# SAP fylles ut via nettappens egen datamodell

Timer føres i SAP Business ByDesign ved at et skript i sidens egen kontekst (`world: "MAIN"`) finner timelisten i nettappens register over skjermbilder, setter timene i datamodellen og sender endringene til tjeneren slik nettappen selv gjør når brukeren skriver i en celle. Deretter lagres timelisten, men den frigis aldri. Slik brukes økten og låsen som siden allerede har, og skjermbildet viser det som er ført.

## Vurderte alternativer

- **OData (`khemployeetime`)**: dokumentert, men en administrator hos kunden må laste opp tjenesten og gi tilgang til den. Utvidelsen skal virke uten noe oppsett hos kunden.
- **SOAP (`ManageEmployeeTimeIn`)**: krever en teknisk bruker satt opp av en administrator, og kan ikke kjøre med brukerens innlogging.
- **Sende nettappens JSON-kall selv**: en egen økt stoppes av at timelisten er låst av økten på siden. Bruker vi sidens økt, kommer datamodellen på siden ut av takt med tjeneren, og neste endring brukeren gjør, kan overskrive utfyllingen.
- **Styre skjermbildet**, som i UBW: cellene har tilfeldige ID-er og ingenting som knytter dem til SAP-oppgave eller dag.

## Konsekvenser

- Metodene i nettappen er udokumenterte og kan endres med de kvartalsvise oppdateringene av ByDesign. Hver metode sjekkes før bruk, og mangler en, avbrytes utfyllingen før noe er endret.
- Innholdsskriptet når ikke nettappens objekter, så det snakker med skriptet i sidens kontekst via `postMessage`.
- Datamodellen sjekker ikke om en celle er skrivebeskyttet når den settes. Det må utvidelsen gjøre selv.
- Bare rader som er lastet inn i skjermbildet, er synlige for utvidelsen.
