// Henter oppføringene i utvalget for en periode, via bakgrunnsskriptet. Felles for UBW, PowerOffice og SAP.
(function (global) {
    const extension = globalThis.browser ?? globalThis.chrome

    function getNextDate(date) {
        const next = new Date(`${date}T00:00:00`)
        next.setDate(next.getDate() + 1)
        return toLocalDate(next)
    }

    // En oppføring som går over midnatt, telles på startdagen i lokal tid
    function toLocalDate(dateOrTimestamp) {
        const date = new Date(dateOrTimestamp)
        return [date.getFullYear(), date.getMonth() + 1, date.getDate()]
            .map(n => String(n).padStart(2, '0'))
            .join('-')
    }

    // Midnatt i lokal tid, i RFC 3339-formatet Toggl forventer
    function formatLocalMidnight(date) {
        const offsetInMinutes = -new Date(`${date}T00:00:00`).getTimezoneOffset()
        const sign = offsetInMinutes >= 0 ? '+' : '-'
        const hours = String(Math.floor(Math.abs(offsetInMinutes) / 60)).padStart(2, '0')
        const minutes = String(Math.abs(offsetInMinutes) % 60).padStart(2, '0')
        return `${date}T00:00:00${sign}${hours}:${minutes}`
    }

    // Oppføringene i utvalget fra og med `firstDate` til og med `lastDate`.
    // Stopper hvis en timer i utvalget går i perioden, eller hvis det ikke finnes noen oppføringer.
    async function fetchSelected(firstDate, lastDate, periodDescription) {
        const endDate = getNextDate(lastDate)
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

        const unknownProjectCount = selectedEntries
            .filter(e => e.projectId !== null && !projectList.projects.some(p => p.id === e.projectId))
            .length
        return { entries: selectedEntries, unknownProjectCount }
    }

    function describeUnknownProjects(count) {
        return `${count} oppføringer er fra prosjekter som ikke var med da prosjektlisten sist ble hentet. ` +
            'Hent prosjektene på nytt på tilvalgssiden for å se dem der.'
    }

    global.oppforinger = { fetchSelected, describeUnknownProjects, toLocalDate }
})(globalThis);
