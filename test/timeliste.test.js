import { describe, it, expect } from 'vitest'
import '../src/timeliste.js'

const { parseColumnDates, parseYear } = globalThis.timeliste

describe('parseYear', () => {
    it('finner årstallet i datospennet', () => {
        expect(parseYear('02 Nov 2026 - 08 Nov 2026')).toBe(2026)
    })

    it('kaster feil når årstallet mangler', () => {
        expect(() => parseYear('02 Nov - 08 Nov')).toThrow(/årstallet/)
    })
})

describe('parseColumnDates', () => {
    it('gjør om kolonneoverskrifter til datoer', () => {
        expect(parseColumnDates(2026, ['Man\n11/2', 'Tir\n11/3'])).toEqual(['2026-11-02', '2026-11-03'])
    })

    it('stopper ved første kolonne uten dato', () => {
        expect(parseColumnDates(2026, ['Man\n11/2', '', 'Ons\n11/4'])).toEqual(['2026-11-02'])
    })

    it('går over til neste år ved nyttår', () => {
        expect(parseColumnDates(2026, ['Tor\n12/31', 'Fre\n1/1'])).toEqual(['2026-12-31', '2027-01-01'])
    })
})

describe('parseWorkTaskTooltip', () => {
    const { parseWorkTaskTooltip } = globalThis.timeliste

    it('finner arbeidsordre og aktivitet i skjermtipset', () => {
        const tooltip = 'Nettbutikk 2027 (400100)<br>&nbsp;&nbsp;&nbsp;Ny kasseløsning (400100-2)<br>&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;Utvikling (900001)'
        expect(parseWorkTaskTooltip(tooltip)).toEqual({ workOrder: '400100-2', activity: '900001' })
    })

    it('gir tom aktivitet når skjermtipset ikke har noen', () => {
        expect(parseWorkTaskTooltip('Prosjekt (1)<br>Arbeidsordre (1-1)')).toEqual({ workOrder: '1-1', activity: '' })
    })

    it('gir tomme verdier uten skjermtips', () => {
        expect(parseWorkTaskTooltip('')).toEqual({ workOrder: '', activity: '' })
    })
})
