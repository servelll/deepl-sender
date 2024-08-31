function decode(str) {
    let txt = document.createElement('textarea')
    txt.innerHTML = str
    return txt.value
}

console.log('trying loading novelbin.js')

getContent = () => Array.from(document.querySelectorAll('#chr-content p'), (p) => p.textContent.trim())

if (document.querySelector('#nav div.navbar-header a')?.innerText.trim() == 'NOVEL BIN') {
    let array = []

    //need to load-listener '.comments script' before executing
    console.log('added window listener')
    const insideListenerFunction = function () {
        console.log('inside old main loading novelbin.js')
        array = getContent()

        const replaceScript = document.querySelector('.comments script')
        if (!replaceScript) {
            console.log({ replaceScript, array })
            return
        }
        const replaceMatch = replaceScript.textContent.match(/(?<=ent.replace\(\")[^\"]+/g)
        if (!replaceMatch) throw Error('somehow blank replace now')
        const replaceText = decode(replaceMatch?.[0]) ?? ''
        array = array.map((t) => t.replace(replaceText, ''))

        console.log({ replaceScript, replaceMatch, replaceText, array })
        console.log(document.querySelector('#chr-content').innerHTML)

        calc(last_size)

        //add last_chapter_number
        //add MUTATION OBJECT listener TODO
        /*
        const place = document.querySelectorAll('#chapter a.toggle-nav-open > span')
        const chapterNode = document.querySelector('#chr-nav-top > div.btn-group > select')
        console.log({ chapterNode })
        const number = chapterNode.lastElementChild.textContent.match(/(\d+)/)?.[0]
        place.textContent = number
        */
    }

    window.addEventListener('after_size_loaded', insideListenerFunction)

    let splitLessN, div, last_size

    const place = document.querySelector('#chr-nav-top > div')
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
            calc(changes.size.newValue)
            console.log(changes.size.newValue, splitLessN)
        }
    })

    chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
        console.log(request, sender)

        if (request.command == 'grab_text') {
            const title = document.querySelector('#chapter .chr-text')?.innerText
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
