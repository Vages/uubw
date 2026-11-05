// Lager TSV for UBW-timelisten, fra en CSV-eksport fra Toggl eller fra oppføringer fra Toggl-API-et.
// Selve grupperingen og avrundingen skjer i `rader.js`, som må være lastet først.
(function (global) {

    // Oppføringer uten arbeidsordre hoppes over, og beskrives for `onSkipped`
    global.toggl_til_tsv = function (csv, { onSkipped = message => console.warn(message) } = {}) {
        const [first, ...lines] = csv.split('\n')
        const labels = split_csv_line(first)

        const time_entries = lines
            .map(l => l.trim())
            .filter(l => l.length > 0)
            .map(to_time_entry(labels))

        const { rows, skipped, firstDay, numberOfDays } = rader.toRows(time_entries, rader.systems.ubw)
        if (skipped.length > 0) {
            onSkipped(rader.describeSkipped(skipped))
        }
        return format_tsv(rows_to_tsv(rader.roundToHalfHours(rows, firstDay), firstDay, numberOfDays))
    }

    // Oppføringer fra Toggl-API-et, med kolonner for hver dag fra og med `first_day` (YYYY-MM-DD)
    global.oppforinger_til_tsv = function (entries, first_day, number_of_days) {
        const time_entries = entries.map(entry => ({
            description: entry.description,
            date: oppforinger.toLocalDate(entry.start),
            hours: entry.durationInSeconds / 60 / 60,
            tags: entry.tags,
        }))

        const { rows, skipped } = rader.toRows(time_entries, rader.systems.ubw, first_day, number_of_days)
        const tsv = format_tsv(rows_to_tsv(rader.roundToHalfHours(rows, first_day), first_day, number_of_days))
        return { tsv, skipped }
    }

    //Arbeidsordre	Aktivitet	Beskrivelse	Mandag	Tirsdag	Onsdag	Torsdag	Fredag
    function rows_to_tsv(rows, first_day, number_of_days) {
        const header = [';Arbeidsordre', 'Aktivitet', 'Beskrivelse', ...get_days(first_day, number_of_days)]
        return [header, ...rows.map(row => [row.fields.workOrder, row.fields.activity, row.description, ...row.hours])]
    }

    function format_tsv(tsv) {
        const locale_decimal_separator = get_locale_decimal_separator();
        return tsv.map(line =>
            line.map(col => typeof col === 'number'
                ? col === 0 ? '' : col.toFixed(1).replace('.', locale_decimal_separator)
                : col
            ).join('\t')
        ).join('\n')
    }

    global.aggreger_varigheter = function (csv) {
        const [first, ...lines] = csv.split('\n')
        const labels = split_csv_line(first)

        const description_index = labels.indexOf('Description')
        const start_date_index = labels.indexOf('Start date')
        const tags_index = labels.indexOf('Tags')
        const duration_index = labels.indexOf('Duration')

        const grupper = new Map()

        for (const line of lines) {
            const trimmed = line.trim()
            if (trimmed.length === 0) continue

            const kolonner = split_csv_line(trimmed)
            const nokkel = [kolonner[description_index], kolonner[start_date_index], kolonner[tags_index]].join('\0')

            if (grupper.has(nokkel)) {
                grupper.get(nokkel).sekunder += parse_varighet(kolonner[duration_index])
            } else {
                grupper.set(nokkel, {
                    kolonner: [...kolonner],
                    sekunder: parse_varighet(kolonner[duration_index])
                })
            }
        }

        const resultat_linjer = [first]

        for (const { kolonner, sekunder } of grupper.values()) {
            kolonner[duration_index] = formater_varighet(sekunder)
            resultat_linjer.push(til_csv_linje(kolonner))
        }

        return resultat_linjer.join('\n')
    }

    function parse_varighet(str) {
        const [timer, minutter, sekunder] = str.split(':').map(n => parseInt(n))
        return timer * 3600 + minutter * 60 + sekunder
    }

    function formater_varighet(sekunder) {
        const timer = Math.floor(sekunder / 3600)
        const minutter = Math.floor((sekunder % 3600) / 60)
        const rest_sekunder = sekunder % 60
        return [timer, minutter, rest_sekunder]
            .map(n => String(n).padStart(2, '0'))
            .join(':')
    }

    function til_csv_linje(kolonner) {
        return kolonner.map(verdi =>
            verdi.includes(',') ? `"${verdi}"` : verdi
        ).join(',')
    }

    function get_locale_decimal_separator() {
        if (typeof navigator !== 'undefined') {
            return 1.1.toLocaleString(navigator.language).substring(1, 2)
        } else {
            return ','
        }
    }

    function split_csv_line(str) {
        const columns = []
        let current_column = ''
        let string_literal = false
        for (let i = 0; i < str.length; i++) {
            const ch = str.charAt(i)
            if (ch === ',' && !string_literal) {
                columns.push(current_column)
                current_column = ''
            } else if (ch === '"') {
                string_literal = !string_literal
            } else {
                current_column += ch
            }
        }
        columns.push(current_column)
        return columns
    }

    function to_time_entry(labels) {
        return function (line) {
            const columns = split_csv_line(line)
            const columns_to_pick = ['Description', 'Start date', 'Duration', 'Tags']
            const columns_numbers = columns_to_pick.map(col => labels.indexOf(col))
            columns_numbers.forEach((i, ii) => {
                if (i === -1) {
                    throw new Error(`Konvertering av CSV feilet, fant ikke kolonnen '${columns_to_pick[ii]}'.`)
                }
            })

            const time_entry = columns.reduce((acc, val, i) => {
                if (columns_numbers.includes(i)) {
                    const label = columns_to_pick[columns_numbers.indexOf(i)].toLowerCase().replace(/\W/g, '_')
                    acc[label] = val
                }
                return acc
            }, {})
            return {
                description: time_entry.description,
                date: time_entry.start_date,
                hours: duration_in_hours(time_entry.duration),
                tags: time_entry.tags.split(','),
            }
        }
    }

    function duration_in_hours(duration) {
        const [hours, minutes, seconds] = duration.split(':').map(n => parseInt(n))
        return hours + minutes / 60 + seconds / 60 / 60
    }

    function get_days(first_day, number_of_days) {
        return new Array(number_of_days).fill(first_day).map(pretty_date)
    }

    function pretty_date(date, diff = 0) {
        const d = new Date(date)
        const days = ['Søn', 'Man', 'Tir', 'Ons', 'Tors', 'Fre', 'Lør']
        return `${days[(d.getDay() + diff) % 7]} ${d.getDate() + diff}.`
    }

})(typeof window !== 'undefined'
    ? window
    : global
);

