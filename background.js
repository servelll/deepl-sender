let table = []

function sleep(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms))
}

async function sendMessageWithTimeout(tabId, message, timeout = 5000) {
    return new Promise((resolve, reject) => {
        let finished = false
        const timer = setTimeout(() => {
            finished = true
            reject(new Error('sendMessage timeout'))
        }, timeout)

        chrome.tabs.sendMessage(tabId, message).then(
            (response) => {
                if (finished) return
                clearTimeout(timer)
                resolve(response)
            },
            (error) => {
                if (finished) return
                clearTimeout(timer)
                reject(error)
            }
        )
    })
}

async function sendLoadProgress(tabIds, status, details, currentTable) {
    const message = { command: 'load_content_progress', status, details }
    if (currentTable) message.table = currentTable

    await Promise.all(
        tabIds.map(async (tabId) => {
            try {
                await chrome.tabs.sendMessage(tabId, message)
            } catch (error) {
                console.warn('unable to send load progress to tab', { tabId, error })
            }
        })
    )
}

const manifest = chrome.runtime.getManifest()
const arr = manifest.content_scripts[1].matches
console.log({ dt: new Date(), manifest, arr })

async function addContentScript(url, tabId) {
    const tabs2 = await chrome.tabs.query({ url })
    for (let tab of tabs2) {
        if (!tab.id) continue
        tabId = tab.id
    }
    console.log({ url, tabId, tabs2 })
    if (url.includes('https://www.deepl.com/')) {
        chrome.tabs.sendMessage(tabId, { command: 'recreate_try' })
        /*
        chrome.scripting.executeScript({
            target: { tabId },
            files: ['deepl.js']
        })
            */
    } else {
        chrome.scripting.executeScript({
            target: { tabId },
            files: ['novelbin.js']
        })
    }
}

chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    console.log({ dt: new Date(), request, sender })
    if (request.print) {
        console.log({ dt: new Date(), print: request.print })
    } else if (request.command == 'load_content') {
        ;(async () => {
            try {
                const deepLTabs = await chrome.tabs.query({ url: 'https://www.deepl.com/*' })
                const deepLTabIds = deepLTabs.flatMap((tab) => (tab.id ? [tab.id] : []))
                if (sender.tab?.id && !deepLTabIds.includes(sender.tab.id)) {
                    deepLTabIds.push(sender.tab.id)
                }
                await sendLoadProgress(
                    deepLTabIds,
                    'Подготовка списка вкладок…',
                    'Поиск открытых страниц с текстом.'
                )

                const dynamicHosts = await chrome.scripting.getRegisteredContentScripts()
                const dynamicMatches = dynamicHosts?.flatMap((host) => host.matches ?? []) ?? []
                console.log({ dt: new Date(), dynamicHosts, dynamicMatches })

                //main hosts
                table = []
                const tabs = await chrome.tabs.query({
                    url: [...arr, ...dynamicMatches]
                })
                await sendLoadProgress(
                    deepLTabIds,
                    `Найдено вкладок: ${tabs.length}.`,
                    'Подключаюсь к страницам и собираю главы.',
                    table
                )
                const additional_origins = dynamicMatches.map((a) => a.replaceAll('/*', '/'))
                if (additional_origins.length > 0) {
                    const result = await chrome.permissions.contains({
                        origins: additional_origins
                    })
                    if (!result) {
                        await sendLoadProgress(
                            deepLTabIds,
                            'Нужны разрешения для дополнительных сайтов.',
                            additional_origins.join(' '),
                            table
                        )
                        sendResponse({ text: 'no_host_permissions', array: additional_origins })
                        return true
                    }
                }
                console.log({ dt: new Date(), tabs })
                let successfulTabs = 0
                let failedTabs = 0
                for (let [tabIndex, tab] of tabs.entries()) {
                    if (!tab.id) continue

                    const tabName = tab.title || tab.url || `Вкладка ${tabIndex + 1}`
                    let tabResponse = null
                    for (let i = 0; i < 10; i++) {
                        if (tab.discarded === true || tab.status === 'unloaded') {
                            await sendLoadProgress(
                                deepLTabIds,
                                `Перезагружаю вкладку ${tabIndex + 1}/${tabs.length}: ${tabName}`,
                                `Перед чтением главы, попытка ${i + 1}/10.`,
                                table
                            )
                            console.log(tab, 'reloading unloaded novelbin')
                            await chrome.tabs.reload(tab.id)
                            await sleep(2000)
                            console.log('sleep 2000 after reload')
                        }
                        await sendLoadProgress(
                            deepLTabIds,
                            `Читаю вкладку ${tabIndex + 1}/${tabs.length}: ${tabName}`,
                            `Попытка подключения ${i + 1}/10.`,
                            table
                        )
                        if (i === 9) console.error('unable to communicate with tab after retries', JSON.stringify(tab))
                        try {
                            tabResponse = await sendMessageWithTimeout(tab.id, { command: 'grab_text' }, 3000)
                            if (!tabResponse || !tabResponse.title || !Array.isArray(tabResponse.splitLessN)) {
                                console.warn('invalid grab_text response', { tabId: tab.id, tabResponse })
                                tabResponse = null
                                throw new Error('invalid content response')
                            }
                            console.log(tabResponse)
                            if (!table.some((item) => item.title == tabResponse.title)) {
                                table.push(tabResponse)
                            }
                            successfulTabs++
                            await sendLoadProgress(
                                deepLTabIds,
                                `Получена глава ${successfulTabs}: ${tabResponse.title} (${tabIndex + 1}/${tabs.length}).`,
                                `Собрано глав: ${table.length}.`,
                                table
                            )
                            break
                        } catch (e) {
                            console.log({ dt: new Date(), e, tabId: tab.id, retry: i })
                            if (i === 9) {
                                failedTabs++
                                await sendLoadProgress(
                                    deepLTabIds,
                                    `Не удалось прочитать вкладку ${tabIndex + 1}/${tabs.length}: ${tabName}.`,
                                    'Перехожу к следующей вкладке.',
                                    table
                                )
                            } else {
                                await sendLoadProgress(
                                    deepLTabIds,
                                    `Повтор подключения ${i + 2}/10: ${tabName}`,
                                    'Предыдущая попытка не удалась; ожидаю ответа страницы.',
                                    table
                                )
                            }
                        }
                        await sleep(1000)
                        console.log('sleep 1000 after error')
                    }
                }

                for (let tab of deepLTabs) {
                    if (!tab.id) continue
                    if (tab.discarded === true || tab.status === 'unloaded') {
                        console.log(tab, 'reloading unloaded deepl')
                        await chrome.tabs.reload(tab.id)
                    }
                    try {
                        await chrome.tabs.sendMessage(tab.id, { command: 'write_table_paste_text', table })
                    } catch (error) {
                        console.warn('unable to send final table to tab', { tabId: tab.id, error })
                    }
                }

                await sendLoadProgress(
                    deepLTabIds,
                    `Готово: обработано вкладок ${successfulTabs}; уникальных глав ${table.length}; ошибок чтения ${failedTabs}.`,
                    'Список глав обновлен.',
                    table
                )
                sendResponse(table)
            } catch (error) {
                console.error('load_content failed', error)
                await sendLoadProgress(
                    sender.tab?.id ? [sender.tab.id] : [],
                    `Ошибка загрузки: ${error?.message ?? String(error)}`,
                    'Не удалось завершить сбор глав.'
                )
                sendResponse({ text: 'error', error: error?.message ?? String(error) })
            }
        })()
    } else if (request.command == 'load') {
        sendResponse(table)
    } else if (request.command == 'add_script') {
        //if (request.tab.url)
        console.log({ dt: new Date(), message: 'add script to', request })
        addContentScript(request.tab.url, request.tab.id)

        sendResponse('was sent')
    } else if (request.command == 'trigger_listener') {
        listener({ reason: 'update' }).then(sendResponse('listener done'))
    } else {
        throw Error('wrong command')
    }
    return true //Important! asks to await async promise (at sendResponse)
})

let update_flag = false
async function register(array) {
    const old = await chrome.scripting.getRegisteredContentScripts()
    console.log({ dt: new Date(), array, old, update_flag })

    if (update_flag) {
        await chrome.scripting.unregisterContentScripts({
            ids: ['novelbin-script-additional-by-storage']
        })
        const old2 = await chrome.scripting.getRegisteredContentScripts()
        console.log({ dt: new Date(), old2 })
    }

    try {
        await chrome.scripting.registerContentScripts([
            {
                id: 'novelbin-script-additional-by-storage',
                matches: array,
                js: ['novelbin.js']
            }
        ])
        update_flag = true
    } catch (err) {
        if (!err.message.includes('must specify at least one match.'))
            console.error(new Date() + ` failed to register content scripts: ${err}`)
    }
}

chrome.storage.onChanged.addListener((changes, area) => {
    console.log('change in storage area: ' + area, changes)
    if (changes.domains?.newValue) addContentScript(changes.domains?.newValue)
    else console.log('blank changes')
})

async function listener(details) {
    const scripts = await chrome.scripting.getRegisteredContentScripts()
    console.log({ scripts })

    const result = await chrome.storage.local.get(['domains'])
    let storage_array = []
    console.log({ result, details })
    if (Array.isArray(result.domains)) {
        storage_array = result.domains
            .map((a) => (a.endsWith('/*') ? a : a + '/*'))
            .map((a) => (a.includes('://') ? a : 'https://' + a))
        await register(storage_array)
    } else {
        chrome.storage.local.set({ domains: [] })
        console.log('null domains array ')
    }

    if (details.reason === 'update') {
        //reload pages: [in storage] + deepl + [in manifest_novels]
        const update_arr = [...storage_array, ...arr, ...manifest.content_scripts[0].matches]
        console.log({ update_arr })
        for (let url of update_arr) {
            const tabs = await chrome.tabs.query({ url })
            for (let tab of tabs) {
                console.log(tab, 'reloading on update')
                await chrome.tabs.reload(tab.id)
            }
        }

        if (details.previousVersion) chrome.runtime.onInstalled.removeListener(listener)
    }
    console.log('listener inside end')
}
chrome.runtime.onInstalled.addListener(listener)
