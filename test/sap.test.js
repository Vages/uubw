import { describe, it, expect } from 'vitest'
import '../src/rader.js'
import '../src/sap.js'

const { parseDuration, formatDuration, assertUsable, weekDates, validateEntries, planChanges, findRejected } = globalThis.sapTimeliste
const system = globalThis.rader.systems.sap

const dates = ['2026-11-02', '2026-11-03', '2026-11-04', '2026-11-05', '2026-11-06', '2026-11-07', '2026-11-08']

const rad = (path, task, durations = [], overrides = {}) => ({
    path,
    task,
    days: dates.map((date, i) => ({ date, duration: durations[i] ?? '', readonly: false })),
    ...overrides,
})

// Formen fra `sap_side.js`, med sumraden øverst slik nettappen har den
function timeliste({ rows = [rad('/Root/_GridView[A1]', '700-1')], ...overrides } = {}) {
    return {
        view: 'GridView',
        viewVariant: 'TSGRIDWPWEEK',
        messageKeys: [],
        rows: [
            { path: '/Root/_GridView[1000001]', task: '', days: dates.map(() => ({ date: '', duration: 'PT0S', readonly: true })) },
            ...rows,
        ],
        dayStatus: Object.fromEntries(dates.map(date => [date, '1'])),
        ...overrides,
    }
}

const mal = (task, hours) => ({ fields: { task }, description: '', hours })

const oppforing = (overrides) => ({ description: 'test', date: '2026-11-02', hours: 1, tags: ['sap-task:700-1'], ...overrides })

describe('parseDuration', () => {
    it('leser formene nettappen bruker', () => {
        expect(parseDuration('PT7H30M')).toBe(7.5)
        expect(parseDuration('PT8H')).toBe(8)
        expect(parseDuration('PT8H0M')).toBe(8)
        expect(parseDuration('PT45M')).toBe(0.75)
        expect(parseDuration('PT0S')).toBe(0)
        expect(parseDuration('')).toBe(0)
    })

    it('stopper på varigheter den ikke forstår', () => {
        expect(() => parseDuration('P1D')).toThrow(/P1D/)
    })
})

describe('formatDuration', () => {
    it('skriver timer og minutter, også for 0', () => {
        expect(formatDuration(4.5)).toBe('PT4H30M')
        expect(formatDuration(2)).toBe('PT2H0M')
        expect(formatDuration(0)).toBe('PT0H0M')
    })
})

describe('assertUsable', () => {
    it('godtar ukevisningen', () => {
        expect(() => assertUsable(timeliste())).not.toThrow()
    })

    it('ber brukeren bytte visning', () => {
        expect(() => assertUsable(timeliste({ view: 'ListView' }))).toThrow(/Worklist/)
    })

    it('stopper når timelisten er låst av en annen økt', () => {
        expect(() => assertUsable(timeliste({ messageKeys: ['/HOE/CM_LOCK.FOREIGN_LOCK'] }))).toThrow(/annen økt/)
    })

    it('stopper når det ikke finnes SAP-rader', () => {
        expect(() => assertUsable(timeliste({ rows: [] }))).toThrow(/ingen SAP-rader/)
    })
})

describe('weekDates', () => {
    it('tar datoene fra radene, ikke fra sumraden', () => {
        expect(weekDates(timeliste())).toEqual(dates)
    })
})

describe('validateEntries', () => {
    it('hopper over oppføringer uten SAP-rad', () => {
        const { valid, skipped } = validateEntries([oppforing(), oppforing({ tags: ['sap-task:999-1'], hours: 2 })], timeliste(), system)
        expect(valid).toHaveLength(1)
        expect(skipped).toEqual([{ description: 'test', hours: 2, reason: "Fant ingen SAP-rad for 'sap-task:999-1'" }])
    })

    it('slipper gjennom oppføringer uten tagg, som `rader.toRows` tar seg av', () => {
        expect(validateEntries([oppforing({ tags: [] })], timeliste(), system).valid).toHaveLength(1)
    })

    it('stopper når flere rader har samme SAP-oppgave', () => {
        const sheet = timeliste({ rows: [rad('/Root/_GridView[A1]', '700-1'), rad('/Root/_GridView[A2]', '700-1')] })
        expect(() => validateEntries([oppforing()], sheet, system)).toThrow(/2 SAP-rader/)
    })
})

describe('planChanges', () => {
    const allDays = [0, 1, 2, 3, 4, 5, 6]

    it('setter dagene som avviker fra Toggl, også til 0', () => {
        const sheet = timeliste({ rows: [rad('/Root/_GridView[A1]', '700-1', ['PT7H30M', 'PT2H', 'PT8H0M'])] })
        const { changes, warnings } = planChanges([mal('700-1', [7.5, 0, 4.5, 0, 0, 0, 0])], sheet, allDays)
        expect(changes).toEqual([
            { path: '/Root/_GridView[A1]/WeekPeriodDetails/Day2Details/Duration', value: 'PT0H0M', label: 'sap-task:700-1, tir 2026-11-03' },
            { path: '/Root/_GridView[A1]/WeekPeriodDetails/Day3Details/Duration', value: 'PT4H30M', label: 'sap-task:700-1, ons 2026-11-04' },
        ])
        expect(warnings).toEqual([])
    })

    it('rører bare dagene i perioden', () => {
        const { changes } = planChanges([mal('700-1', [0, 0, 3, 0, 0, 0, 0])], timeliste({ rows: [rad('/Root/_GridView[A1]', '700-1', ['PT8H'])] }), [2])
        expect(changes.map(c => c.path)).toEqual(['/Root/_GridView[A1]/WeekPeriodDetails/Day3Details/Duration'])
    })

    it('rører ikke rader som ikke finnes i Toggl', () => {
        const sheet = timeliste({ rows: [rad('/Root/_GridView[A1]', '700-1'), rad('/Root/_GridView[B1]', '800-1', ['PT8H'])] })
        const { changes } = planChanges([mal('700-1', [1, 0, 0, 0, 0, 0, 0])], sheet, allDays)
        expect(changes.map(c => c.path)).toEqual(['/Root/_GridView[A1]/WeekPeriodDetails/Day1Details/Duration'])
    })

    it('endrer ikke frigitte dager, men advarer når de avviker', () => {
        const sheet = timeliste({ dayStatus: { ...timeliste().dayStatus, '2026-11-02': '3', '2026-11-03': '3' } })
        sheet.rows[1].days[1].duration = 'PT2H'
        const { changes, warnings } = planChanges([mal('700-1', [1, 2, 0, 0, 0, 0, 0])], sheet, allDays)
        expect(changes).toEqual([])
        expect(warnings).toEqual(['sap-task:700-1, man 2026-11-02: Toggl har 1,0 t, SAP har 0,0 t, men dagen er frigitt eller låst.'])
    })

    it('fyller ut avviste dager og dager som ikke er frigitt', () => {
        const sheet = timeliste({ dayStatus: { ...timeliste().dayStatus, '2026-11-02': '4', '2026-11-03': '2' } })
        const { changes } = planChanges([mal('700-1', [1, 2, 0, 0, 0, 0, 0])], sheet, allDays)
        expect(changes).toHaveLength(2)
    })

    it('endrer ikke skrivebeskyttede celler', () => {
        const sheet = timeliste()
        sheet.rows[1].days[0].readonly = true
        const { changes, warnings } = planChanges([mal('700-1', [1, 0, 0, 0, 0, 0, 0])], sheet, allDays)
        expect(changes).toEqual([])
        expect(warnings).toHaveLength(1)
    })
})

describe('findRejected', () => {
    it('finner endringene SAP ikke tok imot', () => {
        const changes = [
            { path: '/Root/_GridView[A1]/WeekPeriodDetails/Day1Details/Duration', value: 'PT4H30M', label: 'man' },
            { path: '/Root/_GridView[A1]/WeekPeriodDetails/Day2Details/Duration', value: 'PT0H0M', label: 'tir' },
        ]
        const saved = timeliste({ rows: [rad('/Root/_GridView[A1]', '700-1', ['PT4H30M', 'PT2H'])] })
        expect(findRejected(changes, saved).map(c => c.label)).toEqual(['tir'])
    })

    it('regner en tom celle som 0', () => {
        const changes = [{ path: '/Root/_GridView[A1]/WeekPeriodDetails/Day1Details/Duration', value: 'PT0H0M', label: 'man' }]
        expect(findRejected(changes, timeliste())).toEqual([])
    })
})
