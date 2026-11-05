// Regner ut hva som må endres i PowerOffice-timelisten for at en uke skal speile Toggl.
// Uken kommer fra `timesheet/week`, der hver linje har ett objekt per dag (`mon`–`sun`) med `id` og `minutes`.
// Ingenting her kaller PowerOffice, så alt kan testes uten nettleser.
(function (global) {
    const dayKeys = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun']
    const dayNames = ['man', 'tir', 'ons', 'tor', 'fre', 'lør', 'søn']

    // Overskriften i ukevisningen er «Uke 45» med datospennet «2. - 8. Nov 2026» ved siden av,
    // eller med to årstall rundt nyttår. Uke 1 hører til året den slutter i, og uke 52 og 53 til året den begynner i.
    // Teksten i overskriften henger sammen uten mellomrom («Uke 452. - 8. Nov 2026»), så ukenummeret leses for seg.
    function parseWeekHeading(weekText, headingText) {
        const week = weekText.match(/^\s*Uke\s+(\d+)\s*$/)
        const rangeText = headingText.replace(weekText, ' ')
        const years = [...rangeText.matchAll(/\b(\d{4})\b/g)].map(m => parseInt(m[1]))
        if (week === null || years.length === 0) {
            throw new Error(`Fant ikke uke og år i '${weekText.trim()}' og '${rangeText.trim()}'.`)
        }
        const weekNo = parseInt(week[1])
        return { weekNo, year: weekNo === 1 ? Math.max(...years) : Math.min(...years) }
    }

    // Datoene mandag til søndag i ISO-uken. 4. januar er alltid i uke 1.
    function weekDates(weekNo, year) {
        const january4 = new Date(Date.UTC(year, 0, 4))
        const monday = new Date(january4)
        monday.setUTCDate(january4.getUTCDate() - (january4.getUTCDay() + 6) % 7 + (weekNo - 1) * 7)
        return dayKeys.map((_, day) => {
            const date = new Date(monday)
            date.setUTCDate(monday.getUTCDate() + day)
            return date.toISOString().slice(0, 10)
        })
    }

    // Uken har også summelinjer, som `SPEC-0` og `TOTALHOURS`, uten aktivitet
    function readLines(week) {
        return (week.lines ?? []).filter(line => typeof line.activityId === 'number')
    }

    // En dag er låst når PowerOffice sier det, eller når uken er sendt inn eller godkjent til og med dagen
    function lockedDays(week, dates) {
        const lockedTo = [week.submittedToDate, week.approvedToDate]
            .filter(Boolean)
            .map(date => date.slice(0, 10))
            .sort()
            .pop()
        return dayKeys.map((key, day) =>
            Boolean(week[key]?.isLocked) || (lockedTo !== undefined && dates[day] <= lockedTo))
    }

    function assertWeekOpen(week, dates) {
        if (lockedDays(week, dates).every(Boolean)) {
            throw new Error('Uken er sendt inn, godkjent eller låst, og kan ikke fylles ut.')
        }
    }

    // `entries` er `{ description, date, hours, tags }`. Oppføringer som mangler tagger, slipper gjennom,
    // siden `rader.toRows` hopper over dem med sin egen årsak.
    // `projects` er kode → `{ id, code, customerId, ... }`, `activities` kode → `{ id, code, requireProject, isActive }`,
    // og `allowedActivities` prosjekt-ID → aktivitets-ID-er.
    function validateEntries(entries, { projects, activities, allowedActivities }, system) {
        const valid = []
        const skipped = []
        for (const entry of entries) {
            const { fields } = rader.readFields(entry.tags, system)
            const reason = fields === undefined ? null : findInvalidReason(fields, { projects, activities, allowedActivities })
            if (reason === null) {
                valid.push(entry)
            } else {
                skipped.push({ description: entry.description, hours: entry.hours, reason })
            }
        }
        return { valid, skipped }
    }

    function findInvalidReason({ project: projectCode, activity: activityCode }, { projects, activities, allowedActivities }) {
        const activity = activities.get(activityCode)
        if (activity === undefined || activity.isActive === false) {
            return `Ukjent eller inaktiv PowerOffice-aktivitet 'po-activity:${activityCode}'`
        }
        if (projectCode === '') {
            return activity.requireProject ? `PowerOffice-aktivitet 'po-activity:${activityCode}' krever prosjekt` : null
        }
        const project = projects.get(projectCode)
        if (project === undefined) {
            return `Ukjent eller inaktivt PowerOffice-prosjekt 'po-project:${projectCode}'`
        }
        if (!(allowedActivities.get(project.id) ?? []).includes(activity.id)) {
            return `PowerOffice-aktivitet 'po-activity:${activityCode}' er ikke lov på 'po-project:${projectCode}'`
        }
        return null
    }

    // Avrundede rader fra `rader.toRows`, med kodene byttet ut med ID-ene i PowerOffice og timene i minutter
    function toTargets(rows, { projects, activities }) {
        return rows.map(row => {
            const project = row.fields.project === '' ? null : projects.get(row.fields.project)
            return {
                label: [row.fields.project, row.fields.activity].filter(Boolean).join(' / '),
                project,
                projectId: project ? project.id : null,
                customerId: project ? project.customerId ?? null : null,
                activityId: activities.get(row.fields.activity).id,
                minutes: row.hours.map(hours => Math.round(hours * 60)),
            }
        })
    }

    // Avdeling skiller ikke rader, så flere linjer med samme prosjekt og aktivitet kan ikke skilles fra hverandre
    function findLine(lines, target) {
        const matches = lines.filter(line => (line.projectId ?? null) === target.projectId && line.activityId === target.activityId)
        if (matches.length > 1) {
            throw new Error(`Fant ${matches.length} rader for ${target.label} i PowerOffice. Slå dem sammen, og prøv igjen.`)
        }
        return matches[0]
    }

    // Rader som må legges til før timene kan føres. Rader uten timer legges ikke til.
    function missingLines(targets, week) {
        const lines = readLines(week)
        return targets.filter(target => findLine(lines, target) === undefined && target.minutes.some(m => m > 0))
    }

    // Lagringene som får hver dag i radene fra Toggl til å speile Toggl.
    // En rad som blir tom for hele uken, fjernes i stedet. Låste dager endres ikke, men gir en advarsel når de avviker fra Toggl.
    function planEntries(targets, week, dates) {
        const lines = readLines(week)
        const weekLocks = lockedDays(week, dates)
        const saves = []
        const removals = []
        const warnings = []

        for (const target of targets) {
            const line = findLine(lines, target)
            if (line === undefined) {
                continue
            }
            const lineSaves = []
            const finalMinutes = dayKeys.map((key, day) => {
                const cell = line[key] ?? null
                const current = cell ? cell.minutes : 0
                const wanted = target.minutes[day]
                if (wanted === current) {
                    return current
                }
                if (weekLocks[day] || cell?.isLocked || line.canEdit === false) {
                    warnings.push(`${target.label}, ${dayNames[day]} ${dates[day]}: Toggl har ${formatMinutes(wanted)} t, ` +
                        `PowerOffice har ${formatMinutes(current)} t, men dagen er låst.`)
                    return current
                }
                lineSaves.push({
                    id: cell ? String(cell.id) : '',
                    customerId: line.customerId == null ? '' : String(line.customerId),
                    activityId: String(line.activityId),
                    projectId: line.projectId == null ? '' : String(line.projectId),
                    departmentId: line.departmentId == null ? '' : String(line.departmentId),
                    timeSpecificationId: line.timeSpecificationId ?? null,
                    date: dates[day],
                    minutes: wanted,
                    externalComment: '',
                    internalComment: '',
                    isTimeOff: false,
                    assignmentAgreementId: '',
                    qualityDeliveryAreaId: '',
                })
                return wanted
            })
            if (finalMinutes.every(m => m === 0)) {
                removals.push(line.id)
            } else {
                saves.push(...lineSaves)
            }
        }
        return { saves, removals, warnings }
    }

    function formatMinutes(minutes) {
        return (minutes / 60).toFixed(1).replace('.', ',')
    }

    global.poweroffice = {
        parseWeekHeading,
        weekDates,
        readLines,
        lockedDays,
        assertWeekOpen,
        validateEntries,
        toTargets,
        missingLines,
        planEntries,
    }
})(globalThis);
