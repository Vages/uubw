// Knapper som fyller ut SAP-timelisten med oppføringer fra Toggl, enten for hele uken eller én dag.
// Timelisten leses og skrives via `sap_side.js`, som kjører i sidens kontekst.
const style = document.createElement('style')
style.textContent = `
    #uubw-fyll-ut { position: absolute; z-index: 10; padding: 2px 8px; font: inherit; white-space: nowrap; cursor: pointer; }
    #uubw-fyll-ut:disabled { cursor: default; }
    .uubw-dagknapp { margin-left: 4px; opacity: 0.4; cursor: pointer; }
    .uubw-dagknapp:hover { opacity: 1; }
`
document.head.append(style)

// Kolonnetitlene i SAP-timelisten, på engelsk og norsk, mandag først
const weekdayNames = [
    ['Monday', 'Mandag'],
    ['Tuesday', 'Tirsdag'],
    ['Wednesday', 'Onsdag'],
    ['Thursday', 'Torsdag'],
    ['Friday', 'Fredag'],
    ['Saturday', 'Lørdag'],
    ['Sunday', 'Søndag'],
]

const pending = new Map()
let nextId = 0
let isFilling = false

window.addEventListener('message', event => {
    if (event.source !== window || event.data?.type !== 'uubw-sap-svar' || !pending.has(event.data.id)) {
        return
    }
    const { resolve, reject } = pending.get(event.data.id)
    pending.delete(event.data.id)
    if (event.data.error) {
        reject(new Error(event.data.error))
    } else {
        resolve(event.data.result)
    }
})

function askPage(action, changes = null) {
    const id = nextId++
    return new Promise((resolve, reject) => {
        pending.set(id, { resolve, reject })
        window.postMessage({ type: 'uubw-sap-forespørsel', id, action, changes }, location.origin)
    })
}

setInterval(updateButtons, 1000)

function findVisibleText(test) {
    const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT, {
        acceptNode: node => test(node.data.trim()) ? NodeFilter.FILTER_ACCEPT : NodeFilter.FILTER_SKIP,
    })
    const found = []
    for (let node = walker.nextNode(); node; node = walker.nextNode()) {
        if (node.parentElement.getClientRects().length > 0) {
            found.push(node)
        }
    }
    return found
}

// «Time Entries from 02.11.2026 to 08.11.2026» over radene. Datoformatet følger innstillingene til brukeren.
function findPeriodHeading() {
    const date = String.raw`\d{1,4}[./-]\d{1,2}[./-]\d{1,4}`
    const pattern = new RegExp(`${date}\\D{1,10}${date}$`)
    return findVisibleText(text => text.length < 80 && pattern.test(text))[0]?.parentElement ?? null
}

function findDayHeaders() {
    return weekdayNames.map(names => findVisibleText(text => names.includes(text))[0]?.parentElement ?? null)
}

function updateButtons() {
    const heading = findPeriodHeading()
    let button = document.getElementById('uubw-fyll-ut')

    if (heading === null) {
        if (button) {
            button.remove()
        }
        return
    }

    if (button === null) {
        button = document.createElement('button')
        button.id = 'uubw-fyll-ut'
        button.textContent = 'Fyll ut fra Toggl'
        button.addEventListener('click', () => fillFromToggl(null))
        document.body.append(button)
    }
    button.disabled = isFilling

    // Teksten, og ikke elementet, som kan være like bredt som siden
    const range = document.createRange()
    range.selectNodeContents(heading)
    const rect = range.getBoundingClientRect()
    button.style.left = `${rect.right + window.scrollX + 16}px`
    button.style.top = `${rect.top + window.scrollY + (rect.height - button.offsetHeight) / 2}px`

    findDayHeaders().forEach((header, day) => {
        if (header === null || header.querySelector('.uubw-dagknapp')) {
            return
        }
        const dayButton = document.createElement('span')
        dayButton.className = 'uubw-dagknapp'
        dayButton.textContent = '⤓'
        dayButton.title = `Fyll ut ${weekdayNames[day][1].toLowerCase()} fra Toggl`
        // Hindrer at SAP sorterer eller markerer kolonnen
        dayButton.addEventListener('mousedown', event => event.stopPropagation())
        dayButton.addEventListener('click', event => {
            event.stopPropagation()
            event.preventDefault()
            fillFromToggl(day)
        })
        header.append(dayButton)
    })
}

async function fillFromToggl(day) {
    if (isFilling) {
        return
    }
    isFilling = true
    try {
        await fillPeriod(day)
    } catch (err) {
        console.error(err)
        alert(err.message)
    } finally {
        isFilling = false
    }
}

// `day` er 0 for mandag, eller `null` for hele uken
async function fillPeriod(day) {
    const system = rader.systems.sap
    const sheet = await askPage('read')
    sapTimeliste.assertUsable(sheet)
    const dates = sapTimeliste.weekDates(sheet)
    const days = day === null ? [0, 1, 2, 3, 4, 5, 6] : [day]
    const periodDescription = day === null
        ? `uken ${dates[0]}–${dates[6]}`
        : `${sapTimeliste.dayNames[day]} ${dates[day]}`

    const { entries, unknownProjectCount } = await oppforinger.fetchSelected(dates[days[0]], dates[days[days.length - 1]], periodDescription)
    const tagged = entries.map(entry => ({
        description: entry.description,
        date: oppforinger.toLocalDate(entry.start),
        hours: entry.durationInSeconds / 60 / 60,
        tags: entry.tags,
    }))

    const { valid, skipped: invalid } = sapTimeliste.validateEntries(tagged, sheet, system)
    const { rows, skipped } = rader.toRows(valid, system, dates[0], dates.length)
    const { changes, warnings } = sapTimeliste.planChanges(rader.roundToHalfHours(rows, dates[0]), sheet, days)

    if (changes.length > 0) {
        const saved = await askPage('write', changes)
        const rejected = sapTimeliste.findRejected(changes, saved)
        if (rejected.length > 0) {
            throw new Error(`SAP tok ikke imot timene for:\n\n${rejected.map(c => c.label).join('\n')}\n\nSe meldingene i SAP.`)
        }
    }

    const allSkipped = [...skipped, ...invalid]
    if (allSkipped.length > 0) {
        alert(rader.describeSkipped(allSkipped))
    }
    if (warnings.length > 0) {
        alert(`Disse dagene er frigitt eller låst og ble ikke endret:\n\n${warnings.join('\n')}`)
    }
    if (unknownProjectCount > 0) {
        alert(oppforinger.describeUnknownProjects(unknownProjectCount))
    }
    if (changes.length === 0 && allSkipped.length === 0 && warnings.length === 0) {
        alert(`${periodDescription[0].toUpperCase()}${periodDescription.slice(1)} stemmer allerede med Toggl.`)
    } else if (changes.length > 0) {
        alert(`${periodDescription[0].toUpperCase()}${periodDescription.slice(1)} er fylt ut fra Toggl og lagret.`)
    }
}
