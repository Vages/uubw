// Regner ut hvilke PowerOffice-fravær som må føres for at sykefravær og permisjon i Toggl skal stå i PowerOffice.
// En PowerOffice-aktivitet med `holidayLeaveType` er fravær, og føres fra dialogen «Nytt fravær», ikke som en PowerOffice-rad.
// Fravær som finnes, endres eller slettes aldri, siden et godkjent fravær må oppheves først.
// Se docs/adr/0003-poweroffice-fravaer-via-fravaersdialogen.md.
(function (global) {
    const dayKeys = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun']
    const dayNames = ['man', 'tir', 'ons', 'tor', 'fre', 'lør', 'søn']

    // `holidayLeaveType` på aktiviteten og `type` i fraværsdialogen
    const SICK_LEAVE = 20
    const LEAVE = 30
    const supportedTypes = [SICK_LEAVE, LEAVE]

    // `daysOrHours` i fraværsdialogen
    const DAYS = 0
    const HOURS = 10

    // `holidayLeaveStatus` i cellene i uken
    const REVOKED = 40

    function isAbsence(activity) {
        return activity?.holidayLeaveType != null
    }

    // Årsaken til at en oppføring med en fraværsaktivitet ikke kan føres, eller `null`
    function findInvalidReason({ project: projectCode, activity: activityCode }, activity) {
        if (!supportedTypes.includes(activity.holidayLeaveType)) {
            return `PowerOffice-aktivitet 'po-activity:${activityCode}' er ferie eller avspasering, som ikke støttes ennå. Bare sykefravær og permisjon kan føres`
        }
        if (projectCode !== '') {
            return `PowerOffice-aktivitet 'po-activity:${activityCode}' er fravær og kan ikke ha 'po-project:'`
        }
        return null
    }

    // Deler rader fra `rader.toRows` i vanlige rader og fraværsrader
    function partitionRows(rows, activities) {
        const work = []
        const absence = []
        for (const row of rows) {
            (isAbsence(activities.get(row.fields.activity)) ? absence : work).push(row)
        }
        return { work, absence }
    }

    // Dagene i uken som allerede har et PowerOffice-fravær, uansett om det er godkjent eller opphevet
    function readAbsenceCells(week) {
        return (week.lines ?? []).flatMap(line => dayKeys.flatMap((key, day) => {
            const cell = line[key]
            return cell?.holidayLeaveId == null ? [] : [{
                activityCode: line.activityCode,
                day,
                minutes: cell.minutes ?? 0,
                status: cell.holidayLeaveStatus,
            }]
        }))
    }

    // Normtiden er `workMinutes` for dagen i uken, og prosenten en andel av den, høyst 100.
    // PowerOffice runder minuttene ned, så prosenten rundes opp på fjerde desimal for at timene skal bli de samme som i Toggl.
    function toPercentage(minutes, normMinutes) {
        return Math.min(100, Math.ceil(minutes / normMinutes * 1e6) / 1e4)
    }

    // Fraværene som skal føres, fra fraværsradene for uken.
    // Sykefravær blir ett fravær per sammenhengende datospenn med lik prosent, og permisjon ett fravær i timer per dato.
    // Dager som har et fravær for samme aktivitet fra før, føres ikke, men gir en advarsel når fraværet er opphevet
    // eller avviker fra Toggl. Det gjør også fravær i PowerOffice som ikke finnes i Toggl, og fravær på låste dager.
    function planAbsences(rows, week, dates, activities, lockedDays) {
        const existing = readAbsenceCells(week)
        const requests = []
        const warnings = []

        for (const row of rows) {
            const activity = activities.get(row.fields.activity)
            const label = `${activity.code} ${activity.name}`
            const sickDays = []

            row.hours.forEach((hours, day) => {
                const wanted = Math.round(hours * 60)
                const where = `${label}, ${dayNames[day]} ${dates[day]}`
                const normMinutes = week[dayKeys[day]]?.workMinutes ?? 0
                const cell = existing.find(c => c.activityCode === activity.code && c.day === day)

                if (cell !== undefined) {
                    if (cell.status === REVOKED) {
                        warnings.push(`${where}: PowerOffice-fraværet er opphevet. Godkjenn eller slett det for hånd.`)
                    } else if (cell.minutes !== wanted) {
                        warnings.push(`${where}: Toggl har ${formatMinutes(wanted)} t, PowerOffice-fraværet har ${formatMinutes(cell.minutes)} t. Rett fraværet for hånd.`)
                    }
                    return
                }
                if (wanted === 0) {
                    return
                }
                if (lockedDays[day]) {
                    warnings.push(`${where}: Toggl har ${formatMinutes(wanted)} t, men dagen er låst.`)
                    return
                }
                if (activity.holidayLeaveType === LEAVE) {
                    requests.push({ label, type: LEAVE, activityId: activity.id, fromDate: dates[day], toDate: null, daysOrHours: HOURS, minutes: wanted })
                    return
                }
                if (normMinutes === 0) {
                    warnings.push(`${where}: Toggl har ${formatMinutes(wanted)} t, men dagen har ingen normtid i PowerOffice.`)
                    return
                }
                sickDays.push({ day, minutes: wanted, percentage: toPercentage(wanted, normMinutes) })
            })

            for (const span of toSpans(sickDays)) {
                requests.push({
                    label,
                    type: SICK_LEAVE,
                    activityId: activity.id,
                    fromDate: dates[span.firstDay],
                    toDate: dates[span.lastDay],
                    daysOrHours: DAYS,
                    percentage: span.percentage,
                    dailyMinutes: span.minutes,
                })
            }
        }

        for (const cell of existing) {
            const row = rows.find(r => activities.get(r.fields.activity).code === cell.activityCode)
            if (row === undefined && cell.minutes > 0) {
                warnings.push(`${cell.activityCode}, ${dayNames[cell.day]} ${dates[cell.day]}: PowerOffice har et fravær på ` +
                    `${formatMinutes(cell.minutes)} t som ikke finnes i Toggl. Slett det for hånd.`)
            }
        }
        return { requests, warnings }
    }

    function toSpans(days) {
        const spans = []
        for (const { day, minutes, percentage } of days) {
            const last = spans[spans.length - 1]
            if (last !== undefined && last.lastDay === day - 1 && last.percentage === percentage) {
                last.lastDay = day
            } else {
                spans.push({ firstDay: day, lastDay: day, minutes, percentage })
            }
        }
        return spans
    }

    // Det som sendes til `processrequest` og `approve`, ut fra malen fra `loadrequest` for typen.
    // Kommentaren er alltid tom, siden PowerOffice ber om at sensitiv informasjon holdes utenfor.
    function toRequestBody(template, request) {
        return {
            ...template,
            id: null,
            type: request.type,
            employeePartyId: String(template.employeePartyId),
            activityId: String(request.activityId),
            fromDate: request.fromDate,
            toDate: request.toDate,
            fromTime: null,
            toTime: null,
            comment: null,
            daysOrHours: request.daysOrHours,
            minutes: request.minutes ?? null,
            percentage: request.percentage ?? null,
            days: null,
            hasChangedMinutes: false,
        }
    }

    // Teksten brukeren bekrefter før fraværene føres og godkjennes
    function describeRequests(requests) {
        const lines = requests.map(r => r.daysOrHours === HOURS
            ? `• ${r.label}: ${formatDate(r.fromDate)}, ${formatMinutes(r.minutes)} t`
            : `• ${r.label}: ${formatDate(r.fromDate)}${r.toDate === r.fromDate ? '' : `–${formatDate(r.toDate)}`}, ` +
                `${formatMinutes(r.dailyMinutes)} t per dag (${String(r.percentage).replace('.', ',')} %)`)

        const sickCounts = new Map()
        for (const r of requests.filter(r => r.type === SICK_LEAVE)) {
            sickCounts.set(r.label, (sickCounts.get(r.label) ?? 0) + 1)
        }
        const split = [...sickCounts].filter(([, count]) => count > 1)
            .map(([label, count]) => `${label} blir ${count} fravær, fordi timene ikke er like hver dag eller dagene ikke henger sammen. ` +
                'For egenmelding teller hvert fravær som én egenmeldingsperiode.')

        return ['Disse PowerOffice-fraværene blir ført og godkjent. Et fravær må oppheves før det kan slettes.', lines.join('\n'), ...split, 'Føre fraværene?']
            .join('\n\n')
    }

    function formatDate(date) {
        const [, month, day] = date.split('-')
        return `${day}.${month}.`
    }

    function formatMinutes(minutes) {
        return (minutes / 60).toFixed(1).replace('.', ',')
    }

    global.fravaer = { isAbsence, findInvalidReason, partitionRows, readAbsenceCells, planAbsences, toRequestBody, describeRequests }
})(globalThis);
