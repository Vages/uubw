import { describe, it, expect, beforeEach, vi } from 'vitest'
import { readFileSync } from 'fs'
import { fileURLToPath } from 'url'
import { dirname, resolve } from 'path'
import '../src/toggl_til_tsv.js'

const testDir = dirname(fileURLToPath(import.meta.url))

// Beregn desimalskilletegn på samme måte som kildekoden
const desimalskilletegn = typeof navigator !== 'undefined'
    ? 1.1.toLocaleString(navigator.language).substring(1, 2)
    : ','

function desimal(tall) {
    return tall.toFixed(1).replace('.', desimalskilletegn)
}

const gammelt_format_overskrift =
    'User,Email,Client,Project,Task,Description,Billable,Start date,Start time,End date,End time,Duration,Tags,Amount (USD)'

function gammelt_format_rad({
    description = 'test',
    date = '2024-01-01',
    duration = '01:00:00',
    tags = 'timekode:12345678-1',
} = {}) {
    return `Navn,e@post.no,,,,${description},No,${date},08:00:00,${date},09:00:00,${duration},"${tags}",`
}

function gammelt_format_csv(...rader) {
    return [gammelt_format_overskrift, ...rader].join('\n')
}

describe('aggreger_varigheter', () => {
    it('summerer varigheter for like oppføringer på samme dag', () => {
        const input = gammelt_format_csv(
            gammelt_format_rad({ duration: '00:20:00' }),
            gammelt_format_rad({ duration: '00:10:00' })
        )
        const resultat = globalThis.aggreger_varigheter(input)
        const linjer = resultat.split('\n').filter(l => l.trim().length > 0)

        expect(linjer).toHaveLength(2) // overskrift + 1 aggregert rad
        const kolonner = linjer[1].split(',')
        const duration_index = linjer[0].split(',').indexOf('Duration')
        expect(kolonner[duration_index]).toBe('00:30:00')
    })

    it('beholder adskilte oppføringer med ulike tagger', () => {
        const input = gammelt_format_csv(
            gammelt_format_rad({ tags: 'timekode:AAA' }),
            gammelt_format_rad({ tags: 'timekode:BBB' })
        )
        const resultat = globalThis.aggreger_varigheter(input)
        const linjer = resultat.split('\n').filter(l => l.trim().length > 0)

        expect(linjer).toHaveLength(3) // overskrift + 2 rader
    })

    it('beholder adskilte oppføringer på ulike dager', () => {
        const input = gammelt_format_csv(
            gammelt_format_rad({ date: '2024-01-01' }),
            gammelt_format_rad({ date: '2024-01-02' })
        )
        const resultat = globalThis.aggreger_varigheter(input)
        const linjer = resultat.split('\n').filter(l => l.trim().length > 0)

        expect(linjer).toHaveLength(3) // overskrift + 2 rader
    })

    it('håndterer varigheter som summerer til mer enn én time', () => {
        const input = gammelt_format_csv(
            gammelt_format_rad({ duration: '00:45:00' }),
            gammelt_format_rad({ duration: '00:45:00' })
        )
        const resultat = globalThis.aggreger_varigheter(input)
        const linjer = resultat.split('\n').filter(l => l.trim().length > 0)
        const duration_index = linjer[0].split(',').indexOf('Duration')
        const kolonner = linjer[1].split(',')

        expect(kolonner[duration_index]).toBe('01:30:00')
    })

    it('bevarer CSV-overskriften uendret', () => {
        const input = gammelt_format_csv(
            gammelt_format_rad()
        )
        const resultat = globalThis.aggreger_varigheter(input)
        const overskrift = resultat.split('\n')[0]

        expect(overskrift).toBe(gammelt_format_overskrift)
    })
})

describe('toggl_til_tsv', () => {
    beforeEach(() => {
        globalThis.confirm = vi.fn(() => true)
    })

    it('konverterer enkel CSV til korrekt TSV', () => {
        const input = gammelt_format_csv(
            gammelt_format_rad({ tags: 'timekode:12345678-1, aktivitet:11' })
        )
        const resultat = globalThis.toggl_til_tsv(input)
        const linjer = resultat.split('\n')

        expect(linjer).toHaveLength(2)

        const [overskrift, data] = linjer.map(l => l.split('\t'))
        expect(overskrift[0]).toBe(';Arbeidsordre')
        expect(overskrift[1]).toBe('Aktivitet')
        expect(overskrift[2]).toBe('Beskrivelse')

        expect(data[0]).toBe('12345678-1')
        expect(data[1]).toBe('11')
        expect(data[2]).toBe('test')
        expect(data[3]).toBe(desimal(1.0))
    })

    it('aggregerer timer for samme (timekode, aktivitet, beskrivelse) på samme dag', () => {
        const input = gammelt_format_csv(
            gammelt_format_rad({ duration: '00:30:00' }),
            gammelt_format_rad({ duration: '00:30:00' })
        )
        const resultat = globalThis.toggl_til_tsv(input)
        const linjer = resultat.split('\n')

        expect(linjer).toHaveLength(2)
        const data = linjer[1].split('\t')
        expect(data[3]).toBe(desimal(1.0))
    })

    it('plasserer timer i korrekte dagskolonner for flere dager', () => {
        const input = gammelt_format_csv(
            gammelt_format_rad({ date: '2024-01-01', duration: '01:00:00' }),
            gammelt_format_rad({ date: '2024-01-02', duration: '02:00:00' })
        )
        const resultat = globalThis.toggl_til_tsv(input)
        const linjer = resultat.split('\n')

        const overskrift = linjer[0].split('\t')
        expect(overskrift).toHaveLength(5) // 3 faste kolonner + 2 dager

        const data = linjer[1].split('\t')
        expect(data[3]).toBe(desimal(1.0))
        expect(data[4]).toBe(desimal(2.0))
    })

    it('kaster feil ved manglende timekode i tags', () => {
        const input = gammelt_format_csv(
            gammelt_format_rad({ tags: 'ingen-timekode' })
        )
        expect(() => globalThis.toggl_til_tsv(input)).toThrow(/timekode/)
    })

    it('kaster feil ved manglende kolonne i CSV', () => {
        const input = 'User,Email\nNavn,e@post.no'
        expect(() => globalThis.toggl_til_tsv(input)).toThrow(/fant ikke kolonnen/)
    })

    it('haandterer nytt Toggl-format med annen kolonnerekkefoelge', () => {
        const nytt_format_overskrift = 'Description,Project,Start date,Client,Duration,Tags,Billable'
        const nytt_format_rad = 'test,,2024-01-01,,01:00:00,"timekode:12345678-1",No'
        const input = [nytt_format_overskrift, nytt_format_rad].join('\n')

        const resultat = globalThis.toggl_til_tsv(input)
        const data = resultat.split('\n')[1].split('\t')
        expect(data[0]).toBe('12345678-1')
        expect(data[2]).toBe('test')
        expect(data[3]).toBe(desimal(1.0))
    })

    it('bruker test_timeliste.csv som royktest', () => {
        const fixture = readFileSync(resolve(testDir, '..', 'test_timeliste.csv'), 'utf-8')
        const resultat = globalThis.toggl_til_tsv(fixture)
        const linjer = resultat.split('\n')

        expect(linjer.length).toBeGreaterThanOrEqual(3) // overskrift + 2 oppfoeringer
        expect(resultat).toContain('32010000-1')
        expect(resultat).toContain('32010000-3')
        expect(resultat).toContain('beskrivelse1')
        expect(resultat).toContain('beskrivelse2')
    })
})
