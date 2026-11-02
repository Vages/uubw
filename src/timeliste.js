// Leser perioden og radene i timelisten i UBW.
// Kolonneoverskriftene for dagene har `data-u4id="regValue1"` osv. og teksten «Man 11/2» (måned/dag).
(function (global) {
    // Året hentes fra datospennet, og øker hvis måneden går fra desember til januar
    function parseColumnDates(year, headerTexts) {
        const dates = []
        let previousMonth = null
        for (const text of headerTexts) {
            const match = text.match(/(\d{1,2})\/(\d{1,2})/)
            if (match === null) {
                break
            }
            const [month, day] = [parseInt(match[1]), parseInt(match[2])]
            if (previousMonth !== null && month < previousMonth) {
                year += 1
            }
            previousMonth = month
            dates.push([year, month, day].map(n => String(n).padStart(2, '0')).join('-'))
        }
        return dates
    }

    function parseYear(titleText) {
        const match = titleText.match(/\b(\d{4})\b/)
        if (match === null) {
            throw new Error(`Fant ikke årstallet i datospennet '${titleText}'.`)
        }
        return parseInt(match[1])
    }

    // Siden kan ha flere tabeller med de samme kolonnene, for eksempel «Planlagt tid»
    function getGrid(document) {
        const grid = document.querySelector('div[data-u4id="abw-pcb-timesheet-grid-view"]')
        if (grid === null) {
            throw new Error('Fant ikke tabellen i timelisten.')
        }
        return grid
    }

    function getDayHeaders(grid) {
        return Array.from(grid.querySelectorAll('[role="columnheader"][data-u4id^="regValue"]'))
            .filter(header => /^regValue\d+$/.test(header.dataset.u4id))
    }

    // Kolonnene i perioden, med kolonnenummeret som brukes i `regValue<nummer>`
    function readColumns(document) {
        const title = document.querySelector('[data-u4id="timesheetTitleDetail"]')
        if (title === null) {
            throw new Error('Fant ikke datospennet for timelisten.')
        }
        const headers = getDayHeaders(getGrid(document))
        const headerTexts = headers.map(h => h.innerText)
        const dates = parseColumnDates(parseYear(title.innerText), headerTexts)
        if (dates.length === 0) {
            const shownTexts = headerTexts.slice(0, 3).map(t => `'${t}'`).join(', ')
            throw new Error(`Fant ingen datoer i kolonneoverskriftene i timelisten. Fant ${headers.length} dagkolonner, som begynner med ${shownTexts}.`)
        }
        return dates.map((date, index) => ({
            columnNumber: parseInt(headers[index].dataset.u4id.replace('regValue', '')),
            date,
            header: headers[index],
        }))
    }

    // Skjermtipset til arbeidsoppgaven har kodene i parentes:
    // «Prosjekt (400100)<br>Arbeidsordre (400100-2)<br>Aktivitet (900001)». Aktiviteten kan mangle.
    function parseWorkTaskTooltip(tooltip) {
        const codes = tooltip.split(/<br\s*\/?>/i)
            .map(line => line.match(/\(([^()]+)\)\s*$/))
            .map(match => match ? match[1].trim() : '')
        return { workOrder: codes[1] ?? '', activity: codes[2] ?? '' }
    }

    function readRows(document) {
        const grid = getGrid(document)
        const columnIds = new Map(
            Array.from(grid.querySelectorAll('[role="columnheader"][data-u4id]'))
                .map(header => [header.dataset.u4id, header.id])
        )
        const getCell = (row, u4id) => row.querySelector(`td.x-grid-cell-${columnIds.get(u4id)}`)
        // `textContent` og ikke `innerText`, som hopper over celler i skjulte kolonner og i raden som redigeres
        const getText = (row, u4id) => {
            const cell = getCell(row, u4id)
            return cell ? cell.textContent.trim() : ''
        }

        return Array.from(grid.querySelectorAll('tr.x-grid-data-row')).map(row => {
            // Kolonnene for arbeidsordre og aktivitet kan være skjult, og da finnes ikke cellene
            const workTaskCell = getCell(row, 'workTask')
            const fromTooltip = parseWorkTaskTooltip(workTaskCell ? workTaskCell.dataset.qtip ?? '' : '')
            return {
                element: row,
                workOrder: getText(row, 'workOrder') || fromTooltip.workOrder,
                activity: getText(row, 'activity') || fromTooltip.activity,
                description: getText(row, 'description'),
                getDayCell: columnNumber => getCell(row, `regValue${columnNumber}`),
            }
        })
    }

    function isLocked(document) {
        const addButton = document.querySelector('[data-u4id="addWorkTaskBtn"]')
        return addButton === null || addButton.getAttribute('aria-disabled') === 'true'
    }

    global.timeliste = { parseColumnDates, parseYear, parseWorkTaskTooltip, readColumns, readRows, isLocked }
})(globalThis);
