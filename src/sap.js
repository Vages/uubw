// Regner ut hva som må endres i SAP-timelisten for at en uke eller en dag skal speile Toggl.
// Timelisten kommer fra `sap_side.js` som `{ view, viewVariant, messageKeys, rows, dayStatus }`,
// der hver rad er `{ path, task, days }` og hver dag `{ date, duration, readonly }`.
// Ingenting her kaller SAP, så alt kan testes uten nettleser.
(function (global) {
    const dayNames = ['man', 'tir', 'ons', 'tor', 'fre', 'lør', 'søn']

    // Statusen kalenderen gir dager med frigitte eller godkjente timer
    const releasedStatus = '3'
    const foreignLockKey = '/HOE/CM_LOCK.FOREIGN_LOCK'

    // Varigheter som `PT7H30M`, `PT8H` og `PT0S`. En tom celle er `''`.
    function parseDuration(duration) {
        if (duration === '' || duration === null || duration === undefined) {
            return 0
        }
        const match = duration.match(/^PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?$/)
        if (match === null) {
            throw new Error(`Forstår ikke varigheten '${duration}' i SAP-timelisten.`)
        }
        const [hours, minutes, seconds] = match.slice(1).map(n => Number(n ?? 0))
        return hours + minutes / 60 + seconds / 3600
    }

    // Samme form som nettappen sender selv, som `PT4H30M` og `PT0H0M`
    function formatDuration(hours) {
        const minutes = Math.round(hours * 60)
        return `PT${Math.floor(minutes / 60)}H${minutes % 60}M`
    }

    // Sumraden øverst har ingen SAP-oppgave
    function readRows(sheet) {
        return sheet.rows.filter(row => row.task !== '')
    }

    function assertUsable(sheet) {
        if (sheet.view !== 'GridView' || sheet.viewVariant !== 'TSGRIDWPWEEK') {
            throw new Error('Velg «Worklist» under View i SAP-timelisten, og prøv igjen.')
        }
        if (sheet.messageKeys.includes(foreignLockKey)) {
            throw new Error('SAP-timelisten er låst av en annen økt. Last siden på nytt, og prøv igjen.')
        }
        if (readRows(sheet).length === 0) {
            throw new Error('Fant ingen SAP-rader i timelisten.')
        }
    }

    // Datoene mandag til søndag, slik radene har dem
    function weekDates(sheet) {
        return readRows(sheet)[0].days.map(day => day.date)
    }

    function findRow(sheet, task) {
        const matches = readRows(sheet).filter(row => row.task === task)
        if (matches.length > 1) {
            throw new Error(`Fant ${matches.length} SAP-rader for 'sap-task:${task}'. Utvidelsen vet ikke hvilken den skal fylle ut.`)
        }
        return matches[0]
    }

    // `entries` er `{ description, date, hours, tags }`. Oppføringer som mangler tagger, slipper gjennom,
    // siden `rader.toRows` hopper over dem med sin egen årsak.
    function validateEntries(entries, sheet, system) {
        const valid = []
        const skipped = []
        for (const entry of entries) {
            const { fields } = rader.readFields(entry.tags, system)
            if (fields !== undefined && findRow(sheet, fields.task) === undefined) {
                skipped.push({ description: entry.description, hours: entry.hours, reason: `Fant ingen SAP-rad for 'sap-task:${fields.task}'` })
            } else {
                valid.push(entry)
            }
        }
        return { valid, skipped }
    }

    // Endringene som får dagene `days` (0 er mandag) i radene fra Toggl til å speile Toggl.
    // `rows` er avrundede rader fra `rader.toRows`, for hele uken.
    // Frigitte dager og skrivebeskyttede celler endres ikke, men gir en advarsel når de avviker fra Toggl.
    function planChanges(rows, sheet, days) {
        const changes = []
        const warnings = []
        for (const row of rows) {
            const sheetRow = findRow(sheet, row.fields.task)
            for (const day of days) {
                const cell = sheetRow.days[day]
                const current = parseDuration(cell.duration)
                const wanted = row.hours[day]
                if (current === wanted) {
                    continue
                }
                if (cell.readonly || sheet.dayStatus[cell.date] === releasedStatus) {
                    warnings.push(`sap-task:${row.fields.task}, ${dayNames[day]} ${cell.date}: Toggl har ${formatHours(wanted)} t, ` +
                        `SAP har ${formatHours(current)} t, men dagen er frigitt eller låst.`)
                    continue
                }
                changes.push({
                    path: `${sheetRow.path}/WeekPeriodDetails/Day${day + 1}Details/Duration`,
                    value: formatDuration(wanted),
                    label: `sap-task:${row.fields.task}, ${dayNames[day]} ${cell.date}`,
                })
            }
        }
        return { changes, warnings }
    }

    // Etter lagringen leses timelisten på nytt. Endringer SAP ikke tok imot, er feil.
    function findRejected(changes, sheet) {
        const durations = new Map(sheet.rows.flatMap(row =>
            row.days.map((day, i) => [`${row.path}/WeekPeriodDetails/Day${i + 1}Details/Duration`, day.duration])))
        return changes.filter(change => parseDuration(durations.get(change.path)) !== parseDuration(change.value))
    }

    function formatHours(hours) {
        return hours.toFixed(1).replace('.', ',')
    }

    // Ikke `sap`, som er navnet nettappen bruker i sidens kontekst
    global.sapTimeliste = {
        dayNames,
        parseDuration,
        formatDuration,
        assertUsable,
        weekDates,
        validateEntries,
        planChanges,
        findRejected,
    }
})(globalThis);
