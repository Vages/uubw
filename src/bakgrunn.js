// Henter oppføringer fra Toggl for innholdsskriptet, som selv stoppes av CORS.
// Firefox laster `toggl_api.js` og `utvalg.js` via `background.scripts`, Chrome via `importScripts`.
if (typeof importScripts === 'function' && typeof togglApi === 'undefined') {
    importScripts('toggl_api.js', 'utvalg.js')
}

const extension = globalThis.browser ?? globalThis.chrome

// `timesystem` er en nøkkel i `utvalg.timesystems`, og bestemmer hvilket utvalg som brukes
async function fetchEntriesForPeriod({ start, end, timesystem }) {
    const { name, storageKey } = utvalg.timesystems[timesystem]
    const { apiToken, economyMode, [storageKey]: selection } =
        await extension.storage.sync.get({ apiToken: '', economyMode: false, [storageKey]: [] })
    const { projectList } = await extension.storage.local.get({ projectList: null })

    if (apiToken === '' || projectList === null) {
        throw new Error('Mangler API-nøkkel for Toggl. Legg den inn på tilvalgssiden for Unngå UBW.')
    }
    if (selection.length === 0) {
        throw new Error(`Ingen prosjekter er valgt for ${name}. Velg prosjekter på tilvalgssiden for Unngå UBW.`)
    }

    const entries = await togglApi.fetchEntries(apiToken, start, end)
    const runningEntry = economyMode ? null : await togglApi.fetchRunningEntry(apiToken)
    return { entries, runningEntry, selection, projectList }
}

extension.runtime.onInstalled.addListener(async () => {
    const migration = utvalg.migrateSelection(await extension.storage.sync.get(null))
    if (migration !== null) {
        await extension.storage.sync.set(migration.set)
        await extension.storage.sync.remove(migration.remove)
    }
})

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
