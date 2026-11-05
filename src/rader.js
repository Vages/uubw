// Gjør oppføringer fra Toggl om til rader med timer per dag, etter reglene til UBW eller PowerOffice.
// Hvert system har sine tagger, og bestemmer selv om beskrivelsen skiller rader.
(function (global) {
    const systems = {
        ubw: {
            name: 'UBW',
            // `timekode:` er den eldre taggen, og godtas fortsatt for bakoverkompatibilitet
            fields: [
                { name: 'workOrder', tags: ['arbeidsordre', 'timekode'], required: true },
                { name: 'activity', tags: ['aktivitet'], required: false },
            ],
            descriptionSeparatesRows: true,
        },
        poweroffice: {
            name: 'PowerOffice',
            fields: [
                { name: 'project', tags: ['po-project'], required: false },
                { name: 'activity', tags: ['po-activity'], required: true },
            ],
            descriptionSeparatesRows: false,
        },
    }

    // `navn:verdi` kan stå hvor som helst i taggen, etter et mellomrom, som i «Navn på tagg po-activity:10».
    // Ulike verdier for samme felt er en feil, siden det ikke går an å velge.
    // Mangler et påkrevd felt, er `missingTag` den første taggen som kunne gitt det.
    function readFields(tags, system) {
        const values = new Map()
        for (const tag of tags) {
            for (const [, name, value] of tag.matchAll(/(?:^|\s)([\w-]+):([^\s,]+)/g)) {
                values.set(name, [...(values.get(name) ?? []), value])
            }
        }

        const fields = {}
        for (const field of system.fields) {
            const found = [...new Set(field.tags.flatMap(tag => values.get(tag) ?? []))]
            if (found.length > 1) {
                const tagNames = field.tags.map(t => `'${t}:'`).join(' og ')
                throw new Error(`Taggene '${tags.join(', ')}' har ulik verdi for ${tagNames}`)
            }
            if (found.length === 0 && field.required) {
                return { missingTag: field.tags[0] }
            }
            fields[field.name] = found[0] ?? ''
        }
        return { fields }
    }

    // `entries` er `{ description, date, hours, tags }`, med `date` som YYYY-MM-DD.
    // Uten `firstDay` og `numberOfDays` går dagene fra første til siste dag med timer.
    function toRows(entries, system, firstDay, numberOfDays) {
        const sorted = [...entries].sort((a, b) => a.date.localeCompare(b.date))
        if (firstDay === undefined) {
            firstDay = sorted.length > 0 ? sorted[0].date : null
            numberOfDays = sorted.length > 0 ? daysBetween(firstDay, sorted[sorted.length - 1].date) + 1 : 0
        }

        const rows = []
        const skipped = []
        for (const entry of sorted) {
            const { fields, missingTag } = readFields(entry.tags, system)
            if (missingTag !== undefined) {
                skipped.push({ description: entry.description, hours: entry.hours, reason: `Mangler taggen '${missingTag}:'` })
                continue
            }

            const day = daysBetween(firstDay, entry.date)
            if (day < 0 || day >= numberOfDays) {
                continue
            }

            const description = system.descriptionSeparatesRows ? entry.description : ''
            let row = rows.find(r => sameFields(r.fields, fields) && r.description === description)
            if (row === undefined) {
                row = { fields, description, hours: new Array(numberOfDays).fill(0) }
                rows.push(row)
            }
            row.hours[day] += entry.hours
        }
        return { rows, skipped, firstDay, numberOfDays }
    }

    function sameFields(a, b) {
        return Object.keys(a).every(key => a[key] === b[key])
    }

    function daysBetween(from, to) {
        return Math.round((new Date(to) - new Date(from)) / 86400000)
    }

    // Avrunder hver celle til nærmeste halvtime. Blir summen for en dag en annen enn den eksakte summen avrundet,
    // spør `confirmRounding` om utfyllingen skal fortsette.
    function roundToHalfHours(rows, firstDay, confirmRounding = message => confirm(message)) {
        const numberOfDays = rows.length > 0 ? rows[0].hours.length : 0
        const rounded = rows.map(row => ({ ...row, hours: row.hours.map(roundToHalfHour) }))

        for (let day = 0; day < numberOfDays; day++) {
            const exactSum = sum(rows.map(row => row.hours[day]))
            const roundedSum = sum(rounded.map(row => row.hours[day]))
            if (roundToHalfHour(exactSum) !== roundedSum) {
                const continue_ = confirmRounding(`ADVARSEL: Mulig avrundingsfeil funnet for ${describeDay(firstDay, day)}\n\n` +
                    `Avrundet sum '${roundedSum}' er ikke eksakt lik totalen '${exactSum.toFixed(2)}' avrundet. Fortsette?`)
                if (!continue_) {
                    throw new Error('Import avbrutt.')
                }
            }
        }
        return rounded
    }

    function roundToHalfHour(hours) {
        return Math.round(hours * 2) / 2
    }

    function sum(numbers) {
        return numbers.reduce((total, n) => total + n, 0)
    }

    function describeDay(firstDay, day) {
        const date = new Date(firstDay)
        date.setDate(date.getDate() + day)
        const dayNames = ['Søn', 'Man', 'Tir', 'Ons', 'Tors', 'Fre', 'Lør']
        return `${dayNames[date.getDay()]} ${date.getDate()}.`
    }

    // Én linje per årsak og beskrivelse, med timene summert
    function describeSkipped(skipped) {
        const groups = new Map()
        for (const { reason, description, hours } of skipped) {
            const key = `${reason}\0${description}`
            const group = groups.get(key) ?? { reason, description, hours: 0, count: 0 }
            group.hours += hours
            group.count += 1
            groups.set(key, group)
        }
        const totalHours = sum(skipped.map(s => s.hours))
        const lines = [...groups.values()].map(g =>
            `• ${g.reason}: «${g.description || '(uten beskrivelse)'}», ${g.count} oppføring${g.count === 1 ? '' : 'er'}, ${formatHours(g.hours)} t`)
        return `${skipped.length} oppføring${skipped.length === 1 ? '' : 'er'} med til sammen ${formatHours(totalHours)} t ble hoppet over:\n\n${lines.join('\n')}`
    }

    function formatHours(hours) {
        return hours.toFixed(2).replace('.', ',')
    }

    global.rader = { systems, readFields, toRows, roundToHalfHours, describeSkipped }
})(globalThis);
