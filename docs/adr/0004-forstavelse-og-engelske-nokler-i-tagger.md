# Alle systemtagger har forstavelse og engelske nøkler

Fra versjon 2.0.0 tagges Unit4-oppføringer med `unit4-workorder:` og `unit4-activity:`, slik PowerOffice har `po-project:` og `po-activity:` og SAP har `sap-task:`.
Forstavelsen viser hvilket system en tagg gjelder, og hindrer at taggene for ulike systemer forveksles.
Nøklene er engelske, som for PowerOffice og SAP, selv om utvidelsen ellers er på norsk, så alle systemtaggene ser like ut.

De gamle taggene `arbeidsordre:`, `aktivitet:` og `timekode:` ble fjernet i samme storversjon i stedet for å leve videre som alias.
En oppføring med en av dem hoppes over med beskjed om det nye navnet, også når den har de nye taggene i tillegg, så en glemt `aktivitet:` ikke bare forsvinner.
Feilmeldinger om manglende tagger nevner bare den nye nøkkelen.

## Vurderte alternativer

- **Norske nøkler med forstavelse** (`unit4-arbeidsordre:`): nærmere ordene i Unit4, men ulikt PowerOffice- og SAP-taggene.
- **Beholde de gamle taggene som alias under avvikling**: ingen trenger å endre noe, men to skrivemåter må dokumenteres og testes for alltid. En tagg i Toggl kan få nytt navn på ett sted for alle oppføringer, så overgangen er billig.
- **Tagger som holder en oppføring utenfor et system** (`unit4-ignore`): timer som ikke hører hjemme i et system, skal heller holdes utenfor med et eget utvalg av Toggl-prosjekter per system, som ikke finnes ennå, enn med tagger på hver oppføring.
