import { describe, it, expect } from 'vitest'
import '../src/rader.js'
import '../src/poweroffice_fravaer.js'
import '../src/poweroffice.js'

const { parseWeekHeading, weekDates, readLines, lockedDays, assertWeekOpen, validateEntries, toTargets, missingLines, planEntries } = globalThis.poweroffice
const system = globalThis.rader.systems.poweroffice

const dates = weekDates(45, 2026)

const project = { id: 7001, code: '700', customerId: 8001 }
const lookups = {
    projects: new Map([['700', project]]),
    activities: new Map([
        ['10', { id: 9001, code: '10', requireProject: false, isActive: true }],
        ['200', { id: 999, code: '200', requireProject: true, isActive: true }],
        ['300', { id: 333, code: '300', requireProject: false, isActive: false }],
    ]),
    allowedActivities: new Map([[7001, [9001]]]),
}

const celle = (id, minutes, overrides) => ({ id, minutes, isLocked: false, ...overrides })

// Formen på `data` fra `timesheet/week`, med summelinjene som også kommer
function uke({ lines = [], ...overrides } = {}) {
    const days = Object.fromEntries(['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'].map(k => [k, { status: 0, isLocked: false }]))
    return {
        weekNo: 45, year: 2026, submittedToDate: null, approvedToDate: null, ...days,
        lines: [
            ...lines,
            { id: 'SPEC-0', activityId: null, mon: celle(1, 450) },
            { id: 'TOTALHOURS', activityId: null, mon: celle(1, 450) },
        ],
        ...overrides,
    }
}

const linje = (overrides) => ({
    id: 'linje-1',
    canEdit: true,
    activityId: 9001,
    projectId: 7001,
    customerId: 8001,
    departmentId: 6001,
    timeSpecificationId: null,
    mon: null, tue: null, wed: null, thu: null, fri: null, sat: null, sun: null,
    ...overrides,
})

const mal = (minutes, overrides) => ({
    label: '700 / 10', project, projectId: 7001, customerId: 8001, activityId: 9001, minutes, ...overrides,
})

describe('parseWeekHeading', () => {
    it('leser uke og år', () => {
        expect(parseWeekHeading('Uke 45', 'Uke 452. - 8. Nov 2026')).toEqual({ weekNo: 45, year: 2026 })
    })

    it('velger riktig år rundt nyttår', () => {
        expect(parseWeekHeading('Uke 1', 'Uke 129. Des 2025 - 4. Jan 2026')).toEqual({ weekNo: 1, year: 2026 })
        expect(parseWeekHeading('Uke 53', 'Uke 5328. Des 2026 - 3. Jan 2027')).toEqual({ weekNo: 53, year: 2026 })
    })

    it('kaster feil uten årstall', () => {
        expect(() => parseWeekHeading('Uke 45', 'Uke 45')).toThrow(/Fant ikke uke og år/)
    })

    it('tar ikke ukenummer og dag for et årstall', () => {
        expect(parseWeekHeading('Uke 20', 'Uke 2011. - 17. Mai 2026')).toEqual({ weekNo: 20, year: 2026 })
    })
})

describe('weekDates', () => {
    it('gir mandag til søndag i ISO-uken', () => {
        expect(dates).toEqual(['2026-11-02', '2026-11-03', '2026-11-04', '2026-11-05', '2026-11-06', '2026-11-07', '2026-11-08'])
        expect(weekDates(1, 2026)[0]).toBe('2025-12-29')
        expect(weekDates(53, 2026)[6]).toBe('2027-01-03')
    })
})

describe('readLines', () => {
    it('hopper over summelinjene', () => {
        expect(readLines(uke({ lines: [linje()] })).map(l => l.id)).toEqual([linje().id])
    })
})

describe('lockedDays', () => {
    it('låser dager PowerOffice sier er låst', () => {
        expect(lockedDays(uke({ mon: { isLocked: true } }), dates)).toEqual([true, false, false, false, false, false, false])
    })

    it('låser dager til og med datoen uken er sendt inn til', () => {
        expect(lockedDays(uke({ submittedToDate: '2026-11-03T00:00:00' }), dates).filter(Boolean)).toHaveLength(2)
    })

    it('stopper når hele uken er låst', () => {
        expect(() => assertWeekOpen(uke({ approvedToDate: '2026-11-08T00:00:00' }), dates)).toThrow(/kan ikke fylles ut/)
        expect(() => assertWeekOpen(uke(), dates)).not.toThrow()
    })
})

describe('validateEntries', () => {
    const oppforing = (tags) => ({ description: 'test', date: '2026-11-02', hours: 1, tags })

    it('slipper gjennom gyldige oppføringer, og oppføringer som mangler tagger', () => {
        const { valid, skipped } = validateEntries([
            oppforing(['po-project:700', 'po-activity:10']),
            oppforing(['po-activity:10']),
            oppforing(['arbeidsordre:1']),
        ], lookups, system)
        expect(valid).toHaveLength(3)
        expect(skipped).toEqual([])
    })

    it('hopper over ukjente koder og aktiviteter som ikke er lov', () => {
        const { valid, skipped } = validateEntries([
            oppforing(['po-project:999', 'po-activity:10']),
            oppforing(['po-activity:999']),
            oppforing(['po-activity:300']),
            oppforing(['po-activity:200']),
            oppforing(['po-project:700', 'po-activity:200']),
        ], lookups, system)
        expect(valid).toEqual([])
        expect(skipped.map(s => s.reason)).toEqual([
            "Ukjent eller inaktivt PowerOffice-prosjekt 'po-project:999'",
            "Ukjent eller inaktiv PowerOffice-aktivitet 'po-activity:999'",
            "Ukjent eller inaktiv PowerOffice-aktivitet 'po-activity:300'",
            "PowerOffice-aktivitet 'po-activity:200' krever prosjekt",
            "PowerOffice-aktivitet 'po-activity:200' er ikke lov på 'po-project:700'",
        ])
    })
})

describe('toTargets', () => {
    it('bytter koder med ID-er og timer med minutter', () => {
        const rows = [{ fields: { project: '700', activity: '10' }, description: '', hours: [7.5, 6, 0, 0, 0, 0, 0] }]
        expect(toTargets(rows, lookups)).toEqual([mal([450, 360, 0, 0, 0, 0, 0])])
    })

    it('godtar rader uten prosjekt', () => {
        const rows = [{ fields: { project: '', activity: '10' }, description: '', hours: [1, 0, 0, 0, 0, 0, 0] }]
        expect(toTargets(rows, lookups)[0]).toMatchObject({ label: '10', projectId: null, customerId: null })
    })
})

describe('missingLines', () => {
    it('gir rader som mangler og har timer', () => {
        const target = mal([450, 0, 0, 0, 0, 0, 0])
        expect(missingLines([target, mal([0, 0, 0, 0, 0, 0, 0], { activityId: 1 })], uke())).toEqual([target])
        expect(missingLines([target], uke({ lines: [linje()] }))).toEqual([])
    })

    it('stopper når flere linjer har samme prosjekt og aktivitet', () => {
        const lines = [linje(), linje({ id: 'annen', departmentId: 1 })]
        expect(() => missingLines([mal([450, 0, 0, 0, 0, 0, 0])], uke({ lines }))).toThrow(/Fant 2 rader for 700 \/ 10/)
    })
})

describe('planEntries', () => {
    it('oppretter, endrer og sletter registreringer så uken speiler Toggl', () => {
        const week = uke({ lines: [linje({ mon: celle(5001, 90), wed: celle(5002, 120) })] })
        const { saves, removals, warnings } = planEntries([mal([450, 360, 0, 0, 0, 0, 0])], week, dates)

        expect(saves.map(s => [s.id, s.date, s.minutes])).toEqual([
            ['5001', '2026-11-02', 450],
            ['', '2026-11-03', 360],
            ['5002', '2026-11-04', 0],
        ])
        expect(saves[1]).toEqual({
            id: '', customerId: '8001', activityId: '9001', projectId: '7001', departmentId: '6001',
            timeSpecificationId: null, date: '2026-11-03', minutes: 360, externalComment: '', internalComment: '',
            isTimeOff: false, assignmentAgreementId: '', qualityDeliveryAreaId: '',
        })
        expect(removals).toEqual([])
        expect(warnings).toEqual([])
    })

    it('rører ikke rader som ikke finnes i Toggl', () => {
        const week = uke({ lines: [linje({ activityId: 1, mon: celle(5, 60) })] })
        expect(planEntries([mal([450, 0, 0, 0, 0, 0, 0])], week, dates)).toEqual({ saves: [], removals: [], warnings: [] })
    })

    it('fjerner raden når hele uken blir tom', () => {
        const week = uke({ lines: [linje({ mon: celle(1, 90) })] })
        expect(planEntries([mal([0, 0, 0, 0, 0, 0, 0])], week, dates)).toEqual({ saves: [], removals: [linje().id], warnings: [] })
    })

    it('endrer ikke låste dager, men advarer når de avviker', () => {
        const week = uke({ mon: { isLocked: true }, lines: [linje({ mon: celle(1, 90) })] })
        const { saves, removals, warnings } = planEntries([mal([450, 60, 0, 0, 0, 0, 0])], week, dates)
        expect(saves.map(s => s.date)).toEqual(['2026-11-03'])
        expect(removals).toEqual([])
        expect(warnings).toEqual(['700 / 10, man 2026-11-02: Toggl har 7,5 t, PowerOffice har 1,5 t, men dagen er låst.'])
    })

    it('fjerner ikke en rad med timer på låste dager', () => {
        const week = uke({ lines: [linje({ mon: celle(1, 90, { isLocked: true }), tue: celle(2, 60) })] })
        const { saves, removals } = planEntries([mal([90, 0, 0, 0, 0, 0, 0])], week, dates)
        expect(saves.map(s => [s.date, s.minutes])).toEqual([['2026-11-03', 0]])
        expect(removals).toEqual([])
    })
})
