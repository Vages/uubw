// Henter oppføringer fra Toggl for innholdsskriptet, som selv stoppes av CORS.
// Firefox laster `toggl_api.js` via `background.scripts`, Chrome via `importScripts`.
if (typeof importScripts === 'function' && typeof togglApi === 'undefined') {
    importScripts('toggl_api.js')
}

const extension = globalThis.browser ?? globalThis.chrome

async function fetchEntriesForPeriod({ start, end }) {
    const { apiToken, economyMode, selection } =
        await extension.storage.sync.get({ apiToken: '', economyMode: false, selection: [] })
    const { projectList } = await extension.storage.local.get({ projectList: null })

    if (apiToken === '' || projectList === null) {
        throw new Error('Mangler API-nøkkel for Toggl. Legg den inn på tilvalgssiden for Unngå UBW.')
    }
    if (selection.length === 0) {
        throw new Error('Ingen prosjekter er valgt. Velg prosjekter på tilvalgssiden for Unngå UBW.')
    }

    const entries = await togglApi.fetchEntries(apiToken, start, end)
    const runningEntry = economyMode ? null : await togglApi.fetchRunningEntry(apiToken)
    return { entries, runningEntry, selection, projectList }
}

extension.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (message.type !== 'fetchEntries') {
        return false
    }
    fetchEntriesForPeriod(message)
        .then(result => sendResponse({ result }))
        .catch(error => sendResponse({ error: error.message }))
    // Svaret sendes asynkront
    return true
})
