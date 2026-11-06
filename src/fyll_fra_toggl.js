// Knapper som fyller ut timelisten med oppføringer fra Toggl, enten for hele timelisten eller én dag
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
    const periodDescription = columnNumber === null
        ? $('[data-u4id="timesheetTitleDetail"]').innerText.trim()
        : describeColumn(periodColumns[0])

    const { entries, unknownProjectCount } = await oppforinger.fetchSelected(
        periodColumns[0].date, periodColumns[periodColumns.length - 1].date, periodDescription)

    const tagged = entries.map(entry => ({
        description: entry.description,
        date: oppforinger.toLocalDate(entry.start),
        hours: entry.durationInSeconds / 60 / 60,
        tags: entry.tags,
    }))
    // Timene i radene går fra første dag i timelisten, så de treffer `regValue1` osv.
    const firstDay = columns[0].date
    const { rows, skipped } = rader.toRows(tagged, rader.systems.ubw, firstDay, columns.length)
    await fillTimesheet(rader.roundToHalfHours(rows, firstDay), { reuseRows: true })
    if (skipped.length > 0) {
        alert(rader.describeSkipped(skipped))
    }
    if (unknownProjectCount > 0) {
        alert(oppforinger.describeUnknownProjects(unknownProjectCount))
    }
}
