# PowerOffice-fravær føres via endepunktene til fraværsdialogen

Sykefravær og permisjon føres i PowerOffice med de samme interne endepunktene som dialogen «Nytt fravær» bruker (`holidayleavedialog`: `processrequest` og så `approve`), ikke som PowerOffice-registreringer med `saveEntry` og `isTimeOff: true`.
Det er bare slik PowerOffice regner fravær riktig: egenmeldingsperioder telles per PowerOffice-fravær, og timene regnes ut av tjenerdelen fra prosent og normtid.
Utvidelsen slår opp koden fra `po-activity:` blant aktivitetene fra PowerOffice, og der har fraværsaktivitetene `holidayLeaveType`.
Fravær tagges derfor i Toggl på samme måte som vanlige rader.

## Vurderte alternativer

- **`saveEntry` med `isTimeOff: true`**: feltet finnes i kallet for vanlige registreringer, men nettappen bruker det ikke for fravær, og det er uprøvd. Vi ville ikke vite om fraværet telles som egenmeldingsperiode eller vises som fravær i PowerOffice.
- **En egen tag for fravær**: unødvendig, siden aktiviteten alene forteller at det er fravær.

## Konsekvenser

- Et PowerOffice-fravær godkjennes når det føres, med brukeren selv som godkjenner. Det må oppheves (`undoapproval`) før det kan slettes (`removerequest`). Derfor fører utvidelsen bare fravær som mangler, endrer eller sletter aldri et fravær som finnes, og ber om bekreftelse før det føres. Et opphevet PowerOffice-fravær regnes som et fravær som finnes, og utvidelsen varsler om at det må godkjennes eller slettes for hånd.
- Timene for en dag i et PowerOffice-fravær kan ikke endres i PowerOffice-timelisten, heller ikke etter oppheving. De følger bare av prosenten og datospennet.
- PowerOffice runder minuttene i et sykefravær ned ut fra prosenten, så hel prosent gir urunde timer (33 % av 7,5 t blir 2:28).
  Utvidelsen sender derfor prosenten rundet opp på fjerde desimal. Tjenerdelen godtar det, selv om fraværsdialogen bare tar hele prosenter.
- Sammenhengende dager med lik prosent blir ett PowerOffice-fravær. Dager med ulik prosent blir egne fravær, og for egenmelding koster hver av dem en egenmeldingsperiode.
- Fraværsradene i PowerOffice-timelisten er låst (`canEdit: false`) og må holdes utenfor speilingen av vanlige rader.
