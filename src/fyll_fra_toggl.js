// Knapper som fyller ut timelisten med oppføringer fra Toggl, enten for hele timelisten eller én dag
const extension = globalThis.browser ?? globalThis.chrome

const style = document.createElement('style')
style.textContent = `
    #uubw-fyll-ut { position: absolute; z-index: 10; padding: 2px 8px; font: inherit; white-space: nowrap; cursor: pointer; }
    #uubw-fyll-ut:disabled { cursor: default; }
    .uubw-dagknapp { visibility: hidden; margin-left: 4px; cursor: pointer; }
    .x-column-header:hover .uubw-dagknapp { visibility: visible; }
`
document.head.append(style)

let isFilling = false

setInterval(updateTogglButtons, 1000)

function updateTogglButtons () {
    const title = $('[data-u4id="timesheetTitleDetail"]')
    let button = $('#uubw-fyll-ut')

    if (!timesheetIsActive() || title === null || !isVisible(title)) {
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
    placeNextTo(button, findLastElementInRow(title))

    const locked = timeliste.isLocked(document)
    button.disabled = locked || isFilling
    button.title = locked ? 'Timelisten er låst og kan ikke fylles ut.' : ''

    for (const column of readColumnsOrNothing()) {
        let dayButton = $('.uubw-dagknapp', column.header)
        if (locked) {
            if (dayButton) {
                dayButton.remove()
            }
            continue
        }
        if (dayButton === null) {
            dayButton = document.createElement('span')
            dayButton.className = 'uubw-dagknapp'
            dayButton.textContent = '⤓'
            // Hindrer at UBW sorterer eller åpner kolonnemenyen
            dayButton.addEventListener('mousedown', event => event.stopPropagation())
            dayButton.addEventListener('click', event => {
                event.stopPropagation()
                event.preventDefault()
                fillFromToggl(column.columnNumber)
            })
            $('.x-column-header-text', column.header).append(dayButton)
        }
        dayButton.title = `Fyll ut ${describeColumn(column)} fra Toggl`
    }
}

function readColumnsOrNothing () {
    try {
        return timeliste.readColumns(document)
    } catch (err) {
        return []
    }
}

// Datospennet står i en rad med piler og kalenderikon, og knappen skal stå til høyre for dem.
// Raden slutter ved fyllelementet i verktøylinjen, som skyver resten mot høyre kant, eller ved en stor luke.
function findLastElementInRow (element) {
    let last = element
    for (let next = element.nextElementSibling; next; next = next.nextElementSibling) {
        if (next.classList.contains('x-toolbar-fill') || next.id.startsWith('tbfill')) {
            break
        }
        const rect = next.getBoundingClientRect()
        if (rect.width === 0) {
            continue
        }
        if (rect.left - last.getBoundingClientRect().right > 40) {
            break
        }
        if (next.matches('a.x-btn')) {
            last = next
        }
    }
    return last
}

function placeNextTo (button, anchor) {
    const rect = anchor.getBoundingClientRect()
    button.style.left = `${rect.right + window.scrollX + 8}px`
    button.style.top = `${rect.top + window.scrollY + (rect.height - button.offsetHeight) / 2}px`
}

function describeColumn (column) {
    const [dayName, date] = column.header.innerText.replace('⤓', '').trim().split(/\s+/)
    return `${dayName.toLowerCase()} ${date}`
}

function getNextDate (date) {
    const next = new Date(`${date}T00:00:00`)
    next.setDate(next.getDate() + 1)
    return [next.getFullYear(), next.getMonth() + 1, next.getDate()]
        .map(n => String(n).padStart(2, '0'))
        .join('-')
}

// Midnatt i lokal tid, i RFC 3339-formatet Toggl forventer
function formatLocalMidnight (date) {
    const offsetInMinutes = -new Date(`${date}T00:00:00`).getTimezoneOffset()
    const sign = offsetInMinutes >= 0 ? '+' : '-'
    const hours = String(Math.floor(Math.abs(offsetInMinutes) / 60)).padStart(2, '0')
    const minutes = String(Math.abs(offsetInMinutes) % 60).padStart(2, '0')
    return `${date}T00:00:00${sign}${hours}:${minutes}`
}

async function fillFromToggl (columnNumber) {
    if (isFilling) {
        return
    }
    isFilling = true
    try {
        await fillPeriod(columnNumber)
    } catch (err) {
        console.error(err)
        alert(err.message)
    } finally {
        isFilling = false
    }
}

async function fillPeriod (columnNumber) {
    const columns = timeliste.readColumns(document)
    const periodColumns = columnNumber === null ? columns : columns.filter(c => c.columnNumber === columnNumber)
    const firstDate = periodColumns[0].date
    const endDate = getNextDate(periodColumns[periodColumns.length - 1].date)
    const periodDescription = columnNumber === null
        ? $('[data-u4id="timesheetTitleDetail"]').innerText.trim()
        : describeColumn(periodColumns[0])

    const response = await extension.runtime.sendMessage({
        type: 'fetchEntries',
        start: formatLocalMidnight(firstDate),
        end: formatLocalMidnight(endDate),
    })
    if (response.error) {
        throw new Error(response.error)
    }
    const { entries, runningEntry, selection, projectList } = response.result
    const isSelected = entry => utvalg.isEntryInSelection(entry, selection, projectList)

    const periodEnd = new Date(formatLocalMidnight(endDate))
    const blockingEntry = [...entries.filter(e => e.isRunning), runningEntry]
        .filter(e => e && isSelected(e) && new Date(e.start) < periodEnd)[0]
    if (blockingEntry) {
        throw new Error(`Timeren for '${blockingEntry.description}' går fortsatt. Stopp den i Toggl, og prøv igjen.`)
    }

    const selectedEntries = entries.filter(isSelected)
    if (selectedEntries.length === 0) {
        throw new Error(`Fant ingen oppføringer i utvalget for ${periodDescription}.`)
    }

    // Kolonnene i TSV-en går fra første dag i timelisten, så de treffer `regValue1` osv.
    const tsv = oppforinger_til_tsv(selectedEntries, columns[0].date, columns.length)
    await fillTimesheet(tsv, { reuseRows: true })

    const unknownProjectCount = selectedEntries
        .filter(e => e.projectId !== null && !projectList.projects.some(p => p.id === e.projectId))
        .length
    if (unknownProjectCount > 0) {
        alert(`${unknownProjectCount} oppføringer er fra prosjekter som ikke var med da prosjektlisten sist ble hentet. ` +
              'Hent prosjektene på nytt på tilvalgssiden for å se dem der.')
    }
}
