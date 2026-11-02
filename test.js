async function test () {
    let timesheet = [
        ['ABSENCE', '', 'Ferie', '', '', '', '', '8'],
        ['ABSENCE', '', 'Fri med trekk i lønn', '8', '', '', '', ''],
        ['ABSENCE', '', 'Fødselspermisjon 100%', '', '8', '', '', ''],
        ['ABSENCE', '', 'Fødselspermisjon 80%', '', '', '8', '', ''],
        ['ABSENCE', '', 'Lege, tannlege,fysioterapi besøk', '', '', '', '8', ''],
        ['ABSENCE', '', 'Militær - Siviltjeneste', '', '', '', '', '8'],
        ['ABSENCE', '', 'Pappaperm 10 dager ved fødsel', '', '', '', '8', '8'],
        ['ABSENCE', '', 'Permisjon med lønn', '', '', '8', '8', '8'],
        ['ABSENCE', '', 'Permisjon uten lønn', '', '8', '8', '8', '8'],
        ['ABSENCE', '', 'Sykdom med egenmelding', '8', '8', '8', '8', '8'],
        ['ABSENCE', '', 'Sykdom med sykmelding 1-14 dager', '', '', '', '', '8'],
        ['ABSENCE', '', 'Sykdom med sykmelding over 14 dager', '', '', '', '', '8'],
        ['ABSENCE', '', 'Sykt barn', '', '', '', '', '8'],
        ['ABSENCE-1', '', 'Lunsj for de med 7,5 timer fakturerbart', '', '', '', '', '8'],
        ['ABSENCE-2', '', 'Lunsjpenger', '', '', '', '', '8'],
        ['40010000-1', '-', 'Føre timer i UBW', '100', '', '100'],
        ['40010025-1', '14', 'SAK-101 Filvedlegg i sak', '', '8'],
        ['40010025-1', '15', 'SAK-102 Søkekriterier', '', '', '8'],
        ['32610015-2', '-', 'Rådgivning', '', '', '', '8'],
        ['32610015-3', '', 'JS Fundementals', '', '', '', '', '8'],
        ['', '', 'qwerty', '😆', '', '', '', '8'],
    ].map(row => row.join('\t'))
    .join('\n')

    fillTimesheet(timesheet)
}
