const div2 = document.createElement('div')
let dTextarea = document.querySelector('d-textarea')
function draw_ui(input) {
    div2.innerHTML = ''
    for (let page of input) {
        for (let [i, row] of page.splitLessN.entries()) {
            const obj = document.createElement('div')
            obj.textContent = `${page.title} [${i}]`
            obj.title = `sum ${row.sum}`
            obj.onclick = function () {
                for (let d of Array.from(div2.children)) {
                    d.removeAttribute('style')
                }
                this.style.backgroundColor = 'red'
                dTextarea.firstElementChild.textContent = row.current.join('\n')
                setTimeout(() => {
                    dTextarea.dispatchEvent(new Event('change', { bubbles: true }))
                })
            }
            div2.appendChild(obj)
        }
    }
}

console.log('loaded deepl.js')

function calc(v, array) {
    let splitLessN = [{ current: [] }]
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

    return splitLessN
}

function add_elements() {
    dTextarea = document.querySelector('d-textarea')

    const place =
        document.querySelector('main > script') ??
        document.querySelector('nav:not([class]) > div > div:not([class])') ??
        document.querySelector('nav > div > div')
    console.log('window.load deepl.js', { place })
    const div = document.createElement('div')
    div.className = 'flex flex-row gap-[10px] px-6 min-[1280px]:px-0'
    place.parentNode.insertBefore(div, place)

    const z = document.createElement('z')
    z.id = 'my_p'

    const z2 = document.createElement('z')
    z2.id = 'my_p2'
    z2.textContent = 'add from clipboard'
    z2.onclick = () => {
        setTimeout(async () => {
            const text = await navigator.clipboard.readText()
            /*
            dTextarea.firstElementChild.textContent = text
            dTextarea.dispatchEvent(new Event('change', { bubbles: true }))
            */
            let result = [text]
            while (result.some((item) => typeof item === 'string' && item.includes('\n'))) {
                result = result.flatMap((item) => (typeof item === 'string' ? item.split('\n') : item))
            }
            draw_ui([{ title: 'clipboard', splitLessN: calc(5000, result) }])
        })
    }

    const button = document.createElement('button')
    button.id = 'my_button'
    button.textContent = 'Try to catch'
    button.onclick = () => {
        chrome.runtime.sendMessage({ command: 'load_content' }, async function (response) {
            console.log('response', response)
            if (!response) return

            //ask here to escape chrome error with 'Request the permissions from within a user gesture'
            if (response?.text == 'no_host_permissions' && response?.array) {
                /*
                const granted = await chrome.permissions.request({
                    origins: array
                })
                if (granted) {
                    chrome.runtime.sendMessage({ command: 'load_content' }, function (response2) {
                        draw_ui(response2)
                    })
                }
                */
                z.textContent = 'no host permissions'
                z.title = response?.array.join(' ')
            } else {
                draw_ui(response)
            }
        })
    }
    div.appendChild(z)
    div.appendChild(z2)
    div.appendChild(button)
    div.appendChild(div2)
}
window.addEventListener('load', add_elements)

chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    console.log(request, sender)

    if (request.command == 'write_table_paste_text') {
        draw_ui(request.table)
    } else if (request.command == 'recreate_try') {
        add_elements()
    } else {
        throw Error('wrong command')
    }
})
