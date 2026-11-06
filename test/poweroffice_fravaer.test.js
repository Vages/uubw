import { describe, it, expect } from 'vitest'
import '../src/rader.js'
import '../src/poweroffice_fravaer.js'
import '../src/poweroffice.js'

const { isAbsence, partitionRows, readAbsenceCells, planAbsences, toRequestBody, describeRequests } = globalThis.fravaer
const { weekDates, validateEntries } = globalThis.poweroffice
const system = globalThis.rader.systems.poweroffice

const dates = weekDates(26, 2026)
const open = [false, false, false, false, false, false, false]

// Formen på `cachedentities/activities`, der fravær har `holidayLeaveType`
const activities = new Map([
    ['10', { id: 9001, code: '10', name: 'Utvikling', requireProject: false, isActive: true }],
    ['901', { id: 4100, code: '901', name: 'Ferie', requireProject: false, isActive: true, holidayLeaveType: 10 }],
    ['902', { id: 4102, code: '902', name: 'Syk med egenmelding', requireProject: false, isActive: true, holidayLeaveType: 20 }],
    ['903', { id: 4103, code: '903', name: 'Syk med sykemelding', requireProject: false, isActive: true, holidayLeaveType: 20 }],
    ['909', { id: 4109, code: '909', name: 'Helse - lege/tannlege (Permisjon)', requireProject: false, isActive: true, holidayLeaveType: 30 }],
])
const lookups = { projects: new Map(), activities, allowedActivities: new Map() }

const dayKeys = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun']

// Formen på `data` fra `timesheet/week`, med normtid 7,5 t på hverdagene
function uke({ lines = [], ...overrides } = {}) {
    const days = Object.fromEntries(dayKeys.map((k, day) => [k, { status: 0, isLocked: false, workMinutes: day < 5 ? 450 : 0 }]))
    return { weekNo: 26, year: 2026, submittedToDate: null, approvedToDate: null, ...days, lines, ...overrides }
}

// En låst fraværsrad, med fraværet i cellene for dagene i `minutes`
function fravaerslinje(activityCode, minutes, { status = 20, holidayLeaveId = 5550001 } = {}) {
    const cells = Object.fromEntries(dayKeys.map((key, day) => [key, minutes[day] === undefined
        ? { isLocked: true, id: null, minutes: 0, holidayLeaveId: null, holidayLeaveStatus: null }
        : { isLocked: true, id: 7770000 + day, minutes: minutes[day], holidayLeaveId, holidayLeaveStatus: status }]))
    return { readonlyReason: 'Ferie og fravær', canEdit: false, activityCode, activityType: 301, ...cells }
}

const rad = (activity, hours) => ({ fields: { project: '', activity }, description: '', hours })

describe('isAbsence', () => {
    it('kjenner fravær på `holidayLeaveType`', () => {
        expect(isAbsence(activities.get('903'))).toBe(true)
        expect(isAbsence(activities.get('10'))).toBe(false)
        expect(isAbsence(undefined)).toBe(false)
    })
})

describe('validateEntries med fravær', () => {
    const oppforing = (tags) => ({ description: 'Tannlege', date: '2026-06-22', hours: 1, tags })

    it('godtar sykefravær og permisjon uten prosjekt', () => {
        const { valid, skipped } = validateEntries([oppforing(['po-activity:903']), oppforing(['po-activity:909'])], lookups, system)
        expect(valid).toHaveLength(2)
        expect(skipped).toEqual([])
    })

    it('hopper over ferie og fravær med prosjekt', () => {
        const { skipped } = validateEntries([oppforing(['po-activity:901']), oppforing(['po-activity:909', 'po-project:700'])], lookups, system)
        expect(skipped.map(s => s.reason)).toEqual([
            "PowerOffice-aktivitet 'po-activity:901' er ferie eller avspasering, som ikke støttes ennå. Bare sykefravær og permisjon kan føres",
            "PowerOffice-aktivitet 'po-activity:909' er fravær og kan ikke ha 'po-project:'",
        ])
    })
})

describe('partitionRows', () => {
    it('skiller fraværsrader fra vanlige rader', () => {
        const rows = [rad('10', [1]), rad('903', [7.5]), rad('909', [1.5])]
        const { work, absence } = partitionRows(rows, activities)
        expect(work.map(r => r.fields.activity)).toEqual(['10'])
        expect(absence.map(r => r.fields.activity)).toEqual(['903', '909'])
    })
})

describe('readAbsenceCells', () => {
    it('leser dagene med fravær, og hopper over tomme celler og vanlige rader', () => {
        const week = uke({ lines: [fravaerslinje('903', [, 301, 301]), { activityId: 9001, mon: { id: 1, minutes: 450 } }] })
        expect(readAbsenceCells(week)).toEqual([
            { activityCode: '903', day: 1, minutes: 301, status: 20 },
            { activityCode: '903', day: 2, minutes: 301, status: 20 },
        ])
    })
})

describe('planAbsences', () => {
    it('gjør sammenhengende sykedager med lik prosent til ett fravær', () => {
        const { requests, warnings } = planAbsences([rad('903', [7.5, 7.5, 7.5, 0, 0, 0, 0])], uke(), dates, activities, open)
        expect(requests).toEqual([{
            label: '903 Syk med sykemelding', type: 20, activityId: 4103,
            fromDate: '2026-06-22', toDate: '2026-06-24', daysOrHours: 0, percentage: 100, dailyMinutes: 450,
        }])
        expect(warnings).toEqual([])
    })

    it('deler sykefraværet ved ulik prosent og når dagene ikke henger sammen', () => {
        const { requests } = planAbsences([rad('902', [7.5, 3.5, 3.5, 0, 7.5, 0, 0])], uke(), dates, activities, open)
        expect(requests.map(r => [r.fromDate, r.toDate, r.percentage])).toEqual([
            ['2026-06-22', '2026-06-22', 100],
            ['2026-06-23', '2026-06-24', 46.6667],
            ['2026-06-26', '2026-06-26', 100],
        ])
    })

    it('regner prosenten av normtiden for dagen, høyst 100', () => {
        const week = uke({ wed: { status: 0, isLocked: false, workMinutes: 300 } })
        const { requests } = planAbsences([rad('903', [0, 0, 2.5, 0, 9, 0, 0])], week, dates, activities, open)
        expect(requests.map(r => [r.fromDate, r.percentage])).toEqual([['2026-06-24', 50], ['2026-06-26', 100]])
    })

    it('runder prosenten opp, så PowerOffice får de samme minuttene når det runder ned', () => {
        for (let halfHours = 1; halfHours <= 15; halfHours++) {
            const { requests } = planAbsences([rad('903', [halfHours / 2, 0, 0, 0, 0, 0, 0])], uke(), dates, activities, open)
            expect(Math.floor(requests[0].percentage * 450 / 100)).toBe(halfHours * 30)
        }
    })

    it('fører permisjon i timer, ett fravær per dato', () => {
        const { requests } = planAbsences([rad('909', [1.5, 2, 0, 0, 0, 0, 0])], uke(), dates, activities, open)
        expect(requests).toEqual([
            { label: '909 Helse - lege/tannlege (Permisjon)', type: 30, activityId: 4109, fromDate: '2026-06-22', toDate: null, daysOrHours: 10, minutes: 90 },
            { label: '909 Helse - lege/tannlege (Permisjon)', type: 30, activityId: 4109, fromDate: '2026-06-23', toDate: null, daysOrHours: 10, minutes: 120 },
        ])
    })

    it('fører ikke dager som har fravær fra før, og varsler når det avviker fra Toggl', () => {
        const week = uke({ lines: [fravaerslinje('903', [450, 210]), fravaerslinje('909', [, , 60])] })
        const rows = [rad('903', [7.5, 3.5, 7.5, 0, 0, 0, 0]), rad('909', [0, 0, 1.5, 0, 0, 0, 0])]
        const { requests, warnings } = planAbsences(rows, week, dates, activities, open)
        expect(requests.map(r => [r.label, r.fromDate, r.toDate])).toEqual([['903 Syk med sykemelding', '2026-06-24', '2026-06-24']])
        expect(warnings).toEqual(['909 Helse - lege/tannlege (Permisjon), ons 2026-06-24: Toggl har 1,5 t, PowerOffice-fraværet har 1,0 t. Rett fraværet for hånd.'])
    })

    it('varsler om opphevet fravær i stedet for å føre et nytt', () => {
        const week = uke({ lines: [fravaerslinje('903', [450, 450], { status: 40 })] })
        const { requests, warnings } = planAbsences([rad('903', [7.5, 7.5, 0, 0, 0, 0, 0])], week, dates, activities, open)
        expect(requests).toEqual([])
        expect(warnings).toEqual([
            '903 Syk med sykemelding, man 2026-06-22: PowerOffice-fraværet er opphevet. Godkjenn eller slett det for hånd.',
            '903 Syk med sykemelding, tir 2026-06-23: PowerOffice-fraværet er opphevet. Godkjenn eller slett det for hånd.',
        ])
    })

    it('varsler om fravær i PowerOffice som ikke finnes i Toggl', () => {
        const week = uke({ lines: [fravaerslinje('909', [, , , 120])] })
        expect(planAbsences([], week, dates, activities, open).warnings).toEqual([
            '909, tor 2026-06-25: PowerOffice har et fravær på 2,0 t som ikke finnes i Toggl. Slett det for hånd.',
        ])
    })

    it('fører ikke fravær på låste dager eller dager uten normtid', () => {
        const locked = [true, false, false, false, false, false, false]
        const { requests, warnings } = planAbsences([rad('903', [7.5, 0, 0, 0, 0, 7.5, 0])], uke(), dates, activities, locked)
        expect(requests).toEqual([])
        expect(warnings).toEqual([
            '903 Syk med sykemelding, man 2026-06-22: Toggl har 7,5 t, men dagen er låst.',
            '903 Syk med sykemelding, lør 2026-06-27: Toggl har 7,5 t, men dagen har ingen normtid i PowerOffice.',
        ])
    })
})

describe('toRequestBody', () => {
    // Utdrag av `data` fra `loadrequest?type=20`
    const template = {
        id: null, type: 20, employeePartyId: 123456789, activityId: 4102, fromDate: '2026-06-29', toDate: null,
        comment: null, daysOrHours: 0, minutes: null, percentage: null, days: null, canApprove: false, showPercentage: false,
    }

    it('fyller malen med fraværet, med ID-ene som strenger og uten kommentar', () => {
        const request = { type: 20, activityId: 4103, fromDate: '2026-06-22', toDate: '2026-06-24', daysOrHours: 0, percentage: 67 }
        expect(toRequestBody(template, request)).toEqual({
            ...template, employeePartyId: '123456789', activityId: '4103', fromDate: '2026-06-22', toDate: '2026-06-24',
            fromTime: null, toTime: null, percentage: 67, hasChangedMinutes: false,
        })
    })

    it('sender minuttene for permisjon i timer', () => {
        const request = { type: 30, activityId: 4109, fromDate: '2026-06-23', toDate: null, daysOrHours: 10, minutes: 90 }
        expect(toRequestBody({ ...template, type: 30 }, request)).toMatchObject({ type: 30, daysOrHours: 10, minutes: 90, percentage: null, toDate: null })
    })
})

describe('describeRequests', () => {
    it('lister fraværene, og sier fra når sykefravær blir flere fravær', () => {
        const { requests } = planAbsences([rad('902', [7.5, 3.5, 0, 0, 0, 0, 0]), rad('909', [0, 0, 0, 1.5, 0, 0, 0])], uke(), dates, activities, open)
        expect(describeRequests(requests)).toBe([
            'Disse PowerOffice-fraværene blir ført og godkjent. Et fravær må oppheves før det kan slettes.',
            '• 902 Syk med egenmelding: 22.06., 7,5 t per dag (100 %)\n• 902 Syk med egenmelding: 23.06., 3,5 t per dag (46,6667 %)\n• 909 Helse - lege/tannlege (Permisjon): 25.06., 1,5 t',
            '902 Syk med egenmelding blir 2 fravær, fordi timene ikke er like hver dag eller dagene ikke henger sammen. For egenmelding teller hvert fravær som én egenmeldingsperiode.',
            'Føre fraværene?',
        ].join('\n\n'))
    })
})
