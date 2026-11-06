# PowerOffice fylles ut via nettappens interne endepunkter

Timer føres i PowerOffice ved at innholdsskriptet på go.poweroffice.net kaller de samme interne endepunktene som nettappen selv bruker, med brukerens innlogging på siden. Det gir én knapp uten ekstra oppsett, slik som for Unit4, og gjør oss uavhengige av et skjermbilde som kan endre seg.

## Vurderte alternativer

- **Det offentlige API-et (`goapi.poweroffice.net/v2`)**: krever integrasjonsnøkler for hele klienten, utstedt av en administrator, og ikke for den enkelte ansatte.
- **PowerOffice Go MCP**: per-bruker OAuth via Visma Connect, men bare for piloter. Den må slås på for hele klienten og er laget for at et KI-verktøy skal få bekreftelse fra brukeren før hver skriving.
- **Styre skjermbildet**, som i Unit4: skjørt i en enkeltsideapp.

## Konsekvenser

- De interne endepunktene er udokumenterte og kan endres uten varsel.
- Koden for PowerOffice-prosjekt og PowerOffice-aktivitet i taggene er ikke den interne ID-en, så utvidelsen må slå opp ID-ene selv.
- Registreringene merkes ikke med kilde, så utvidelsen kan ikke skille sine egne PowerOffice-registreringer fra manuelle. Derfor gjelder dette for hver celle i en rad som finnes i Toggl: alle PowerOffice-registreringer i cellen slås sammen til én med summen fra Toggl, eller slettes når Toggl har 0.
