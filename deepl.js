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
