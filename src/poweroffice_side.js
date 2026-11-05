// Kjører i sidens egen kontekst på go.poweroffice.net, fra før nettappen starter.
// Nettappen sender klienten og CSRF-tokener som hoder på hvert kall. De fanges opp her,
// slik at kallene utvidelsen ber om, sendes med de samme hodene.
// Innholdsskriptet ber om kall med `postMessage`, siden det ikke når sidens kontekst.
(function () {
    const headerNames = /^(GoClientId|GoClientToken|__RequestVerificationToken|x-csrf)$/i
    const capturedHeaders = {}

    const setRequestHeader = XMLHttpRequest.prototype.setRequestHeader
    XMLHttpRequest.prototype.setRequestHeader = function (name, value) {
        if (headerNames.test(name)) {
            capturedHeaders[name] = value
        }
        return setRequestHeader.call(this, name, value)
    }

    window.addEventListener('message', async event => {
        if (event.source !== window || event.data?.type !== 'uubw-forespørsel') {
            return
        }
        const { id, method, url, body } = event.data
        const reply = (status, text) => window.postMessage({ type: 'uubw-svar', id, status, text }, location.origin)

        if (!Object.keys(capturedHeaders).some(name => /^GoClientId$/i.test(name))) {
            reply(0, 'Har ikke sett klienten i kallene til PowerOffice ennå. Bytt uke fram og tilbake, og prøv igjen.')
            return
        }
        try {
            // Bare navn og lengde, ikke verdiene, som er innloggingen. Nettappen setter noen hoder til `null`.
            console.debug('Unngå UBW:', method, url, Object.entries(capturedHeaders).map(([name, value]) => `${name} (${String(value).length} tegn)`))
            const response = await fetch(url, {
                method,
                credentials: 'same-origin',
                headers: {
                    ...capturedHeaders,
                    'Accept': 'application/json',
                    'X-Requested-With': 'XMLHttpRequest',
                    ...(body === null ? {} : { 'Content-Type': 'application/json' }),
                },
                body: body === null ? undefined : JSON.stringify(body),
            })
            reply(response.status, await response.text())
        } catch (err) {
            reply(0, err.message)
        }
    })
})()
