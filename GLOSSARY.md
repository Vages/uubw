# Unngå UBW

Utvidelsen fyller ut timelisten i UBW, PowerOffice eller SAP med timer registrert i Toggl, eller fra en fil med timer.
Begreper som finnes i flere av systemene, skrives alltid med forstavelse: «UBW-», «PowerOffice-» eller «SAP-».
SAP betyr her SAP Business ByDesign.

## Språk

**Timeføring**:
Det å føre timer, altså jobben med å levere timene for en periode i UBW, PowerOffice eller SAP.
_Unngå_: timeføring om en enkelt oppføring i Toggl, eller om skjermbildet i UBW, PowerOffice eller SAP

**Oppføring**:
Én registrering i Toggl, med beskrivelse, starttid, varighet og tagger.
_Unngå_: timeføring, time entry

**Toggl-prosjekt**:
Et prosjekt i Toggl, uten kobling til et UBW-prosjekt, et PowerOffice-prosjekt eller en SAP-oppgave.
Bare oppføringer i Toggl-prosjekter som brukeren har valgt, er med når timelisten fylles ut.
_Unngå_: prosjekt (uten forstavelse)

**Toggl-kunde**:
En kunde i Toggl som Toggl-prosjekter grupperes under.
Skrives «kunde» der det ikke kan forveksles med noe i UBW, PowerOffice eller SAP.
_Unngå_: klient, client

**Arbeidsområde**:
Den øverste inndelingen i Toggl, som Toggl-kunder og Toggl-prosjekter hører til.
_Unngå_: workspace

**Utvalg**:
De arbeidsområdene, Toggl-kundene og Toggl-prosjektene brukeren har valgt.
Et valgt arbeidsområde eller en valgt kunde omfatter også prosjekter som kommer til senere.
_Unngå_: filter, valgte prosjekter

**UBW-timeliste**:
Skjemaet i UBW der timene føres, med et nummer (som «Timeliste 202648») og et datospenn som vises øverst til venstre.
_Unngå_: timeliste (uten forstavelse), timeføring, uke, timesheet

**UBW-rad**:
Én linje i UBW-timelisten, gitt av arbeidsordre, UBW-aktivitet og beskrivelse, med timer per dag.
_Unngå_: rad (uten forstavelse), linje, entry

**Arbeidsoppgave**:
Det en UBW-rad føres på: et UBW-prosjekt, en arbeidsordre under prosjektet og eventuelt en UBW-aktivitet, valgt samlet i UBW.

**UBW-prosjekt**:
Det øverste nivået i en arbeidsoppgave i UBW, som «Nettbutikk 2027».
_Unngå_: prosjekt (uten forstavelse)

**Arbeidsordre**:
Koden i UBW som timene føres på, for eksempel `40010000-1` for administrasjon.
Den hører til et UBW-prosjekt.
_Unngå_: timekode, workorder

**UBW-aktivitet**:
En valgfri underinndeling av en arbeidsordre i UBW, som «Utvikling».
_Unngå_: aktivitet (uten forstavelse)

**PowerOffice-timeliste**:
Skjemaet i PowerOffice der timene føres, vist per uke (som «Uke 45, 2. – 8. Nov 2026»).
_Unngå_: timeliste (uten forstavelse), timesheet

**PowerOffice-rad**:
Én linje i PowerOffice-timelisten, gitt av PowerOffice-prosjekt og PowerOffice-aktivitet, med timer per dag.
Beskrivelsen på oppføringene skiller ikke rader fra hverandre.
_Unngå_: rad (uten forstavelse), linje

**PowerOffice-prosjekt**:
Et prosjekt i PowerOffice, kjent ved koden som vises i brukergrensesnittet.
Det kan mangle på en PowerOffice-rad.
_Unngå_: prosjekt (uten forstavelse)

**PowerOffice-aktivitet**:
Det timene føres som i PowerOffice, kjent ved koden som vises i brukergrensesnittet.
Hver PowerOffice-rad har en.
_Unngå_: aktivitet (uten forstavelse)

**PowerOffice-registrering**:
Det som lagres i PowerOffice for én dag i en PowerOffice-rad: timene for ett PowerOffice-prosjekt og én PowerOffice-aktivitet den dagen.
En celle i PowerOffice-timelisten viser summen av PowerOffice-registreringene den dagen, og det kan være flere.
_Unngå_: oppføring, timeføring, entry

**SAP-timeliste**:
Skjemaet i SAP der timene føres, én uke om gangen.
_Unngå_: timeliste (uten forstavelse), timesheet

**SAP-rad**:
Én linje i SAP-timelisten, med en SAP-oppgave og timer per dag.
Raden har også tjenesteprodukt og timetype, men det er SAP-oppgaven som skiller radene fra hverandre, ikke beskrivelsen på oppføringene.
_Unngå_: rad (uten forstavelse), linje

**SAP-oppgave**:
En oppgave i et prosjekt i SAP som timene føres på, kjent ved nummeret.
_Unngå_: aktivitet, task, arbeidsoppgave (det er UBW)

**Frigi**:
Å sende timene i SAP-timelisten videre, så de ikke lenger bare er lagret. Frigitte timer kan gå til godkjenning.
_Unngå_: release, sende inn

**Avvist**:
Om en dag i SAP-timelisten der timene er sendt tilbake fra godkjenning og må rettes og frigis på nytt.
_Unngå_: rejected

**Periode**:
Det som føres timer for i én operasjon: enten én dag i timelisten eller hele timelisten, i UBW, PowerOffice eller SAP.
_Unngå_: intervall, tidsrom

**Sparemodus**:
En innstilling som bruker færre kall mot Toggl, på bekostning av at en timer som ble startet før perioden og fortsatt går, ikke oppdages.
