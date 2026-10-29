function decode(str) {
    let txt = document.createElement('textarea')
    txt.innerHTML = str
    return txt.value
}

console.log('trying loading novelbin.js')

isRoyalRoad = () => document.querySelector("meta[property='og:site_name']")?.getAttribute('content') == 'Royal Road'
isNovelBin = () => document.querySelector('#nav div.navbar-header a')?.innerText.trim().toLowerCase() == 'novel bin'
isRanobes = () => document.querySelector('head > link')?.title.includes('RANOBES.NET')
console.log({ isRoyalRoad: isRoyalRoad(), isNovelBin: isNovelBin(), isRanobes: isRanobes() })
getContent = () => {
    const arr = []
    const tags = ['#chr-content', '.chapter-content', '#arrticle']
    for (let t of tags) {
        const baseNode = document.querySelector(t)
        if (!baseNode) continue
        for (let child of baseNode.childNodes) {
            //console.log(baseNode, child, child.nodeName, child.textContent)
            const nodesNames = ['#text', 'p']
            if (nodesNames.includes(child.nodeName.toLowerCase())) {
                arr.push(child.textContent.trim())
            }
        }
    }
    return arr
}

if (isNovelBin() || isRoyalRoad() || isRanobes()) {
    let array = []

    //need to load-listener '.comments script' before executing
    console.log('added window listener')

    let splitLessN, div, last_size = 5000

    const place = document.querySelector('#chr-nav-top > div, div.row.nav-buttons, article .center')
    div = document.createElement('div')
    div.style = 'display: flex; justify-content: center; grid-gap: 12px'
    if (place) place.parentNode.appendChild(div)

    function calc(v) {
        splitLessN = [{ current: [] }]
        let index = 0,
            sum = 0
        array.forEach((current) => {
            if (current != '') {
                if (sum + current.length + 1 > v) {
                    splitLessN[index].nextSum = sum + current.length + 1
                    index++
                    sum = 0
                    splitLessN[index] = { current: [] }
                } else {
                    sum++
                }
                sum += current.length
                splitLessN[index].current.push(current)
                splitLessN[index].sum = sum
            }
        })
        draw_ui(splitLessN)
    }
    function refreshContent() {
        const latestArray = getContent()
        const changed =
            latestArray.length !== array.length || latestArray.some((text, index) => text !== array[index])

        if (changed || !splitLessN) {
            array = latestArray
            calc(last_size)
        }
    }

    const insideListenerFunction = function () {
        console.log('inside old main loading novelbin.js')
        refreshContent()

        const replaceScript = document.querySelector('.comments script')
        if (!replaceScript) {
            console.log({ replaceScript, array })
        }
    }
    window.addEventListener('after_size_loaded', insideListenerFunction)

    chrome.storage.local.get('size').then((loaded_size) => {
        console.log('inside storage.local.get size')
        const size = loaded_size?.size ?? 5000
        last_size = size
        calc(size)
        console.log('first get', size, splitLessN)

        const event = new Event('after_size_loaded')
        window.dispatchEvent(event)
    })
    chrome.storage.local.onChanged.addListener(function (changes) {
        if (changes?.size?.newValue) {
            last_size = changes.size.newValue
            calc(last_size)
            console.log(changes.size.newValue, splitLessN)
        }
    })

    chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
        console.log(request, sender)

        if (request.command == 'grab_text') {
            refreshContent()
            const title = document.querySelector(
                '#chapter .chr-text, div.page-container h1, #dle-speedbar > span'
            )?.innerText
            sendResponse({ title, splitLessN })
        } else {
            throw Error('wrong command')
        }
        return true
    })

    function draw_ui(input) {
        div.innerHTML = ''
        for (let [i, row] of input.entries()) {
            const obj = document.createElement('div')
            obj.textContent = `[${i}📋]`
            obj.title = `sum ${row.sum}\n${row.current[0]?.split(' ').slice(0, 3).join(' ')}`
            obj.onclick = () => {
                navigator.clipboard.writeText(row.current.join('\n'))
                obj.style.backgroundColor = '#d3b523'
            }
            div.appendChild(obj)
        }
    }

    chrome.storage.local.get(['domains']).then((result) => {
        console.log('domains array is ' + result.domains)
        let newDomains = result?.domains ?? []
        newDomains = Array.isArray(result?.domains) ? result?.domains : [result?.domains]
        if (!newDomains.includes(window.location.hostname)) {
            newDomains.push(window.location.hostname)
            console.log({ newDomains })
            chrome.storage.local.set({ domains: newDomains })
        }
    })
}
