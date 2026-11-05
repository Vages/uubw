import { describe, it, expect, vi } from 'vitest'
import '../src/rader.js'

const { systems, readFields, toRows, roundToHalfHours, describeSkipped } = globalThis.rader

const oppforing = (overrides) => ({
    description: 'test',
    date: '2026-11-02',
    hours: 1,
    tags: ['arbeidsordre:12345678-1', 'po-project:700', 'po-activity:10'],
    ...overrides,
})

describe('readFields', () => {
    it('leser taggene for UBW', () => {
        expect(readFields(['arbeidsordre:12345678-1', 'aktivitet:11'], systems.ubw))
            .toEqual({ fields: { workOrder: '12345678-1', activity: '11' } })
    })

    it('godtar den eldre taggen timekode', () => {
        expect(readFields(['timekode:12345678-1'], systems.ubw).fields.workOrder).toBe('12345678-1')
    })

    it('leser taggene for PowerOffice, der prosjektet kan mangle', () => {
        expect(readFields(['po-activity:10'], systems.poweroffice))
            .toEqual({ fields: { project: '', activity: '10' } })
    })

    it('sier hvilken tagg som mangler', () => {
        expect(readFields(['po-project:700'], systems.poweroffice)).toEqual({ missingTag: 'po-activity' })
        expect(readFields([], systems.ubw)).toEqual({ missingTag: 'arbeidsordre' })
    })

    it('finner koden etter et navn med mellomrom i taggen', () => {
        const tags = [
            'Navn på tagg po-activity:10',
            'Navn på tagg aktivitet:900001',
            'Navn på tagg timekode:87654321-1',
            'po-project:700 med tekst etter',
        ]
        expect(readFields(tags, systems.ubw)).toEqual({ fields: { workOrder: '87654321-1', activity: '900001' } })
        expect(readFields(tags, systems.poweroffice)).toEqual({ fields: { project: '700', activity: '10' } })
    })

    it('forveksler ikke tagger med lignende navn', () => {
        expect(readFields(['po-aktivitet:10', 'xaktivitet:1', 'arbeidsordre:1'], systems.ubw).fields.activity).toBe('')
    })

    it('kaster feil ved ulike verdier for samme felt', () => {
        expect(() => readFields(['arbeidsordre:1', 'timekode:2'], systems.ubw)).toThrow(/ulik verdi/)
        expect(() => readFields(['po-activity:10', 'po-activity:11'], systems.poweroffice)).toThrow(/ulik verdi/)
    })
})

describe('toRows', () => {
    it('skiller rader på beskrivelse i UBW', () => {
        const { rows } = toRows([oppforing({ description: 'a' }), oppforing({ description: 'b' })], systems.ubw, '2026-11-02', 7)
        expect(rows.map(r => r.description)).toEqual(['a', 'b'])
    })

    it('slår sammen beskrivelser i PowerOffice', () => {
        const { rows } = toRows([
            oppforing({ description: 'a', hours: 1 }),
            oppforing({ description: 'b', hours: 2, date: '2026-11-03' }),
            oppforing({ description: 'c', hours: 0.5 }),
        ], systems.poweroffice, '2026-11-02', 7)
        expect(rows).toEqual([{ fields: { project: '700', activity: '10' }, description: '', hours: [1.5, 2, 0, 0, 0, 0, 0] }])
    })

    it('hopper over oppføringer som mangler påkrevde tagger', () => {
        const { rows, skipped } = toRows([oppforing({ tags: ['arbeidsordre:1'] })], systems.poweroffice, '2026-11-02', 7)
        expect(rows).toEqual([])
        expect(skipped).toEqual([{ description: 'test', hours: 1, reason: "Mangler taggen 'po-activity:'" }])
    })

    it('ser bort fra oppføringer utenfor perioden', () => {
        const { rows } = toRows([oppforing({ date: '2026-11-09' })], systems.ubw, '2026-11-02', 7)
        expect(rows).toEqual([])
    })

    it('finner perioden selv uten første dag', () => {
        const result = toRows([oppforing({ date: '2026-11-04' }), oppforing({ date: '2026-11-02' })], systems.ubw)
        expect(result.firstDay).toBe('2026-11-02')
        expect(result.numberOfDays).toBe(3)
        expect(result.rows[0].hours).toEqual([1, 0, 1])
    })
})

describe('roundToHalfHours', () => {
    const rad = hours => ({ fields: {}, description: '', hours })

    it('avrunder hver celle til nærmeste halvtime', () => {
        const confirmRounding = vi.fn(() => true)
        expect(roundToHalfHours([rad([1.2, 0.8])], '2026-11-02', confirmRounding)[0].hours).toEqual([1, 1])
        expect(confirmRounding).not.toHaveBeenCalled()
    })

    it('spør når den avrundede summen for en dag avviker', () => {
        const confirmRounding = vi.fn(() => true)
        roundToHalfHours([rad([0.2]), rad([0.2]), rad([0.2])], '2026-11-02', confirmRounding)
        expect(confirmRounding).toHaveBeenCalledWith(expect.stringMatching(/Man 2\./))
    })

    it('avbryter når brukeren ikke vil fortsette', () => {
        expect(() => roundToHalfHours([rad([0.2]), rad([0.2]), rad([0.2])], '2026-11-02', () => false)).toThrow(/avbrutt/)
    })
})

describe('describeSkipped', () => {
    it('grupperer per årsak og beskrivelse', () => {
        const tekst = describeSkipped([
            { description: 'Lunsj', hours: 0.5, reason: "Mangler taggen 'po-activity:'" },
            { description: 'Lunsj', hours: 0.25, reason: "Mangler taggen 'po-activity:'" },
            { description: 'Møte', hours: 1, reason: "Ukjent kode 'po-project:999'" },
        ])
        expect(tekst).toContain('3 oppføringer med til sammen 1,75 t')
        expect(tekst).toContain("• Mangler taggen 'po-activity:': «Lunsj», 2 oppføringer, 0,75 t")
        expect(tekst).toContain("• Ukjent kode 'po-project:999': «Møte», 1 oppføring, 1,00 t")
    })
})
