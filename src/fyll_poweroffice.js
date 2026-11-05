// Knapp som fyller ut uken i PowerOffice-timelisten med oppføringer fra Toggl
const style = document.createElement('style')
style.textContent = `
    #uubw-fyll-ut { position: absolute; z-index: 10; padding: 2px 8px; font: inherit; white-space: nowrap; cursor: pointer; }
    #uubw-fyll-ut:disabled { cursor: default; }
`
document.head.append(style)

let isFilling = false

setInterval(updateButton, 1000)

// Overskriften «Uke 45» med datospennet ved siden av, som bare vises i ukevisningen.
// Gir elementet rundt begge, og teksten «Uke 45» for seg.
function findWeekHeading () {
    const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT, {
        acceptNode: node => /^\s*Uke\s+\d+\s*$/.test(node.data) ? NodeFilter.FILTER_ACCEPT : NodeFilter.FILTER_SKIP,
    })
    for (let node = walker.nextNode(); node; node = walker.nextNode()) {
        const heading = node.parentElement.parentElement
        if (heading.getClientRects().length > 0 && /\d{4}/.test(heading.textContent)) {
            return { heading, weekText: node.data }
        }
    }
    return null
}

function updateButton () {
    const { heading } = findWeekHeading() ?? {}
    let button = document.getElementById('uubw-fyll-ut')

    if (heading === undefined) {
        if (button) {
            button.remove()
        }
        return
    }

    if (button === null) {
        button = document.createElement('button')
        button.id = 'uubw-fyll-ut'
        button.textContent = 'Fyll ut fra Toggl'
        button.addEventListener('click', fillFromToggl)
        document.body.append(button)
    }
    button.disabled = isFilling

    // Teksten, og ikke elementet, som kan være like bredt som siden
    const range = document.createRange()
    range.selectNodeContents(heading)
    const rect = range.getBoundingClientRect()
    button.style.left = `${rect.right + window.scrollX + 16}px`
    button.style.top = `${rect.top + window.scrollY + (rect.height - button.offsetHeight) / 2}px`
}

async function fillFromToggl () {
    if (isFilling) {
        return
    }
    isFilling = true
    try {
        const { heading, weekText } = findWeekHeading()
        await fillWeek(weekText, heading.textContent)
    } catch (err) {
        console.error(err)
        alert(err.message)
    } finally {
        isFilling = false
    }
}

async function fillWeek (weekText, headingText) {
    const { weekNo, year } = poweroffice.parseWeekHeading(weekText, headingText)
    const dates = poweroffice.weekDates(weekNo, year)
    const system = rader.systems.poweroffice

    let week = await powerOfficeApi.fetchWeek(weekNo, year)
    poweroffice.assertWeekOpen(week, dates)

    const { entries, unknownProjectCount } = await oppforinger.fetchSelected(dates[0], dates[6], `uke ${weekNo}`)
    const tagged = entries.map(entry => ({
        description: entry.description,
        date: oppforinger.toLocalDate(entry.start),
        hours: entry.durationInSeconds / 60 / 60,
        tags: entry.tags,
    }))

    const fields = tagged.map(entry => rader.readFields(entry.tags, system).fields).filter(Boolean)
    const activities = await powerOfficeApi.fetchActivities()
    const projects = await powerOfficeApi.findProjects([...new Set(fields.map(f => f.project).filter(Boolean))])
    const allowedActivities = new Map()
    for (const project of projects.values()) {
        allowedActivities.set(project.id, await powerOfficeApi.fetchAllowedActivityIds(project))
    }
    const lookups = { projects, activities, allowedActivities }

    const { valid, skipped: invalid } = poweroffice.validateEntries(tagged, lookups, system)
    const { rows, skipped } = rader.toRows(valid, system, dates[0], dates.length)
    const targets = poweroffice.toTargets(rader.roundToHalfHours(rows, dates[0]), lookups)

    const newLines = poweroffice.missingLines(targets, week)
    for (const target of newLines) {
        week = await powerOfficeApi.saveNewLine(target, dates[0])
    }
    const { saves, removals, warnings } = poweroffice.planEntries(targets, week, dates)
    for (const save of saves) {
        await powerOfficeApi.saveEntry(save)
    }
    for (const lineId of removals) {
        await powerOfficeApi.removeLine(lineId, weekNo, year)
    }

    const allSkipped = [...skipped, ...invalid]
    if (allSkipped.length > 0) {
        alert(rader.describeSkipped(allSkipped))
    }
    if (warnings.length > 0) {
        alert(`Disse dagene er låst og ble ikke endret:\n\n${warnings.join('\n')}`)
    }
    if (unknownProjectCount > 0) {
        alert(oppforinger.describeUnknownProjects(unknownProjectCount))
    }
    const changes = newLines.length + saves.length + removals.length
    if (changes === 0 && allSkipped.length === 0 && warnings.length === 0) {
        alert(`Uke ${weekNo} stemmer allerede med Toggl.`)
    } else if (changes > 0) {
        alert(`Uke ${weekNo} er fylt ut fra Toggl. Last siden på nytt hvis timene ikke vises.`)
    }
}
