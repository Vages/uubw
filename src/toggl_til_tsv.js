(function (global) {
    global.toggl_til_tsv = function (csv) {
        const [first, ...lines] = csv.split('\n')
        const labels = split_csv_line(first)

        const time_entries = lines
            .map(l => l.trim())
            .filter(l => l.length > 0)
            .map(to_time_entry(labels))

        const tsv = time_entries_to_tsv(time_entries)
        round_to_nearest_half_hour_and_notify_if_rounding_error(tsv)
        return format_tsv(tsv)
    }

    // Oppføringer fra Toggl-API-et, med kolonner for hver dag fra og med `first_day` (YYYY-MM-DD)
    global.oppforinger_til_tsv = function (entries, first_day, number_of_days) {
        const time_entries = entries.map(entry => tags_to_timekode_and_aktivitet({
            description: entry.description,
            start_date: to_local_date(entry.start),
            hours_exact: entry.durationInSeconds / 60 / 60,
            tags: entry.tags.join(', '),
        }))

        const tsv = time_entries_to_tsv(time_entries, first_day, number_of_days)
        round_to_nearest_half_hour_and_notify_if_rounding_error(tsv)
        return format_tsv(tsv)
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

    // En oppføring som går over midnatt, telles på startdagen i lokal tid
    function to_local_date(timestamp) {
        const date = new Date(timestamp)
        return [date.getFullYear(), date.getMonth() + 1, date.getDate()]
            .map(n => String(n).padStart(2, '0'))
            .join('-')
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

            let time_entry = columns.reduce((acc, val, i) => {
                if (columns_numbers.includes(i)) {
                    const label = columns_to_pick[columns_numbers.indexOf(i)].toLowerCase().replace(/\W/g, '_')
                    acc[label] = val
                }
                return acc
            }, {})
            time_entry = calculate_time_in_hours_decimal(time_entry)
            return tags_to_timekode_and_aktivitet(time_entry)
        }
    }

    function tags_to_timekode_and_aktivitet(time_entry) {
        time_entry.timekode = get_arbeidsordre(time_entry.tags)
        time_entry.aktivitet = get_regex_group(time_entry.tags, /.*aktivitet:([^ ,]+).*/)

        delete time_entry.tags
        return time_entry
    }

    // `timekode:` er den eldre taggen, og godtas fortsatt for bakoverkompatibilitet
    function get_arbeidsordre(tags) {
        const arbeidsordre = get_regex_group(tags, /.*arbeidsordre:([^ ,]+).*/)
        const timekode = get_regex_group(tags, /.*timekode:([^ ,]+).*/)

        if (arbeidsordre === '' && timekode === '') {
            throw new Error(`Fant verken 'arbeidsordre:' eller 'timekode:' i taggene '${tags}'`)
        } else if (arbeidsordre !== '' && timekode !== '' && arbeidsordre !== timekode) {
            throw new Error(`Taggene '${tags}' har ulik verdi for 'arbeidsordre:' og 'timekode:'`)
        }
        return arbeidsordre || timekode
    }

    function get_regex_group(str, regex) {
        const match = str.match(regex)
        if (match === null) {
            return ''
        }
        return match[1]
    }

    function calculate_time_in_hours_decimal(time_entry) {
        let [hours, minutes, seconds] = time_entry.duration.split(':').map(n => parseInt(n))
        time_entry.hours_exact = (hours + minutes / 60 + seconds / 60 / 60)
        return time_entry
    }

    // Uten `first_day` og `number_of_days` går kolonnene fra første til siste dag med timer
    function time_entries_to_tsv(time_entries, first_day, number_of_days) {
        //Arbeidsordre	Aktivitet	Beskrivelse	Mandag	Tirsdag	Onsdag	Torsdag	Fredag
        const lines = []

        time_entries.sort(sort_by_date)
        if (first_day === undefined) {
            first_day = time_entries[0].start_date
            const last_day = time_entries[time_entries.length - 1].start_date
            number_of_days = number_of_days_since(last_day, first_day) + 1
        }

        lines.push([';Arbeidsordre', 'Aktivitet', 'Beskrivelse', ...(get_days(first_day, number_of_days))])

        time_entries.forEach(time_entry => {
            let line
            if (lines.some(line => has_same_timekode_aktivitet_and_beskrivelse(line, time_entry))) {
                line = lines.find(line => has_same_timekode_aktivitet_and_beskrivelse(line, time_entry))
            } else {
                line = create_tsv_line(time_entry, number_of_days)
                lines.push(line)
            }
            let n_day = number_of_days_since(time_entry.start_date, first_day)
            line[3 + n_day] += time_entry.hours_exact
        })

        return lines
    }

    function sort_by_date(a, b) {
        if (a.start_date > b.start_date) {
            return 1
        } else if (a.start_date < b.start_date) {
            return -1
        }
        return 0
    }

    function number_of_days_since(day, since) {
        return (new Date(day) - new Date(since)) / 86400000
    }

    function get_days(first_day, number_of_days) {
        return new Array(number_of_days).fill(first_day).map(pretty_date)
    }

    function pretty_date(date, diff = 0) {
        const d = new Date(date)
        const days = ['Søn', 'Man', 'Tir', 'Ons', 'Tors', 'Fre', 'Lør']
        return `${days[(d.getDay() + diff) % 7]} ${d.getDate() + diff}.`
    }

    function has_same_timekode_aktivitet_and_beskrivelse(tsv, time_entry) {
        return tsv[0] === time_entry.timekode && tsv[1] === time_entry.aktivitet && tsv[2] === time_entry.description;
    }

    function create_tsv_line(time_entry, number_of_days) {
        return [time_entry.timekode, time_entry.aktivitet, time_entry.description, ...(new Array(number_of_days).fill(0))]
    }

    function round_to_nearest_half_hour_and_notify_if_rounding_error(tsv) {
        //Arbeidsordre	Aktivitet	Beskrivelse	Mandag	Tirsdag	Onsdag	Torsdag	Fredag
        const [ordre, aktivitet, beskrivelse, ...days] = tsv[0]

        for (let n_day = 0; n_day < days.length; n_day++) {
            const day_exact_sum = sum_day(tsv, n_day)
            tsv.forEach((line, index) => {
                if (index === 0) {
                    return;
                }
                line[3 + n_day] = round(line[3 + n_day])
            })
            const day_rounded_sum = sum_day(tsv, n_day)

            if (round(day_exact_sum) !== day_rounded_sum) {
                const continue_ = confirm(`ADVARSEL: Mulig avrundingsfeil funnet for ${days[n_day]}\n\n` +
                      `Avrundet sum '${day_rounded_sum}' er ikke eksakt lik totalen '${day_exact_sum.toFixed(2)}' avrundet. Fortsette?`)

                if (!continue_) {
                    throw new Error("Import avbrutt.")
                }
            }
        }
    }

    function sum_day(tsv, n_day) {
        return tsv.filter(([ordre, ...rest]) => ordre[0] !== ';')
            .map(l => l[3 + n_day])
            .reduce((sum, n) => sum + n, 0)
    }

    function round(n) {
        return Math.round(n * 2) / 2
    }


})(typeof window !== 'undefined'
    ? window
    : global
);

