const tbody = document.querySelector('tbody')

function reDraw(input) {
    tbody.parentNode.removeAttribute('style')
    tbody.innerText = ''
    for (let page of input) {
        for (let [i, row] of page.splitLessN.entries()) {
            const tr = document.createElement('tr')
            tr.innerHTML =
                (i == 0 ? `<td rowspan="${page.splitLessN.length}">${page.title}</td>` : '') +
                `<td>${row.sum}</td>` +
                `<td>${row.current[0]}</td>`
            tbody.appendChild(tr)
        }
    }
}

let domains = []
function load_content_actions() {
    chrome.runtime.sendMessage({ command: 'load_content' }, function (response) {
        console.log('response', response)
        if (!response) return
        reDraw(response)
    })
}
document.getElementById('b').onclick = () => load_content_actions
const hosts = document.getElementById('ask_hosts')
hosts.onclick = async () => {
    console.log({ domains })
    const granted = await chrome.permissions.request({
        origins: domains
    })
    console.log({ granted })
    if (granted) {
        load_content_actions()
    }
}

chrome.runtime.sendMessage({ command: 'load' }).then((response) => {
    console.log('response', response)
    if (!response) return
    reDraw(response)
})

const size_button = document.getElementById('max_size')
size_button.onclick = async function () {
    const size = this.textContent == 'size 5000' ? 1500 : 5000
    this.textContent = 'size ' + size
    await chrome.storage.local.set({ size })
}

chrome.storage.local.get('size').then((loaded_size) => {
    if (loaded_size.size) size_button.textContent = 'size ' + loaded_size.size
})
chrome.storage.local.get('domains').then((r) => {
    if (r.domains) {
        hosts.title = 'domains: ' + r.domains.join(',')
        domains = r.domains
            .map((a) => (a.includes('://') ? a : 'https://' + a))
            .map((a) => (a.endsWith('/') ? a : a + '/'))
    }
})

document.getElementById('add_script').addEventListener('click', async function () {
    const tabs = await chrome.tabs.query({ active: true, lastFocusedWindow: true })
    console.log({ tabs })

    for (let tab of tabs) {
        if (!tab.id) continue
        chrome.runtime.sendMessage({ command: 'add_script', tab }).then((response) => {
            console.log('response to add_script: ', { response, tab })
            if (!response) return
        })
    }
})

document.getElementById('trigger').addEventListener('click', async function () {
    chrome.runtime.sendMessage({ command: 'trigger_listener' }, function (response) {
        console.log('trigger_listener_response', response)
        if (!response) return
    })
})
