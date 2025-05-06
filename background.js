let table = []

function sleep(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms))
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
            const dynamicHosts = await chrome.scripting.getRegisteredContentScripts()
            console.log({ dt: new Date(), dynamicHosts, test: [...arr, ...dynamicHosts[0].matches] })

            //main hosts
            table = []
            const tabs = await chrome.tabs.query({
                url: [...arr, ...dynamicHosts[0].matches]
            })
            const additional_origins = dynamicHosts[0].matches.map((a) => a.replaceAll('/*', '/'))
            const result = await chrome.permissions.contains({
                origins: additional_origins
            })
            if (!result) {
                sendResponse({ text: 'no_host_permissions', array: additional_origins })
                return true
            }
            console.log({ dt: new Date(), tabs })
            for (let tab of tabs) {
                if (!tab.id) continue

                //const origins = [new URL(tab.url).origin]
                //console.log({ origins })

                for (let i = 0; i < 50; i++) {
                    if (tab.discarded === true || tab.status === 'unloaded') {
                        console.log(tab, 'reloading unloaded novelbin')
                        await chrome.tabs.reload(tab.id)
                        await sleep(2000)
                        console.log('sleep 2000 after reload')
                    }
                    if (i == 49) console.error('too many reloading tab', JSON.stringify(tab))
                    try {
                        const tabResponse = await chrome.tabs.sendMessage(tab.id, { command: 'grab_text' })
                        console.log(tabResponse)
                        if (!table.some((i) => i.title == tabResponse.title)) {
                            table.push(tabResponse)
                        }
                        break
                    } catch (e) {
                        console.log({ dt: new Date(), e })
                        //console.error(e, 'tab', JSON.stringify(tab))
                    }
                    await sleep(1000)
                    console.log('sleep 1000 after error')
                }
            }

            const tabs2 = await chrome.tabs.query({ url: 'https://www.deepl.com/*' })
            for (let tab of tabs2) {
                if (!tab.id) continue
                if (tab.discarded === true || tab.status === 'unloaded') {
                    console.log(tab, 'reloading unloaded deepl')
                    await chrome.tabs.reload(tab.id)
                }
                chrome.tabs.sendMessage(tab.id, { command: 'write_table_paste_text', table })
            }

            sendResponse(table)
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
