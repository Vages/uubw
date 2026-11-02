// Kall mot Toggl-API-et. Brukes fra tilvalgssiden og bakgrunnsskriptet,
// som har vertstillatelse for api.track.toggl.com og derfor ikke stoppes av CORS.
(function (global) {
    const baseUrl = 'https://api.track.toggl.com/api/v9'

    async function fetchFromToggl(path, apiToken) {
        const response = await fetch(baseUrl + path, {
            headers: { Authorization: 'Basic ' + btoa(`${apiToken}:api_token`) },
        })
        if (!response.ok) {
            throw new Error(describeFailedResponse(response))
        }
        return response.json()
    }

    function describeFailedResponse(response) {
        if (response.status === 401 || response.status === 403) {
            return 'Ugyldig API-nøkkel. Sjekk nøkkelen på tilvalgssiden.'
        }
        if (response.status === 402 || response.status === 429) {
            const resetsIn = response.headers.get('X-Toggl-Quota-Resets-In')
            const whenReset = resetsIn ? ` Den fornyes om ${resetsIn} sekunder.` : ''
            return `Kvoten hos Toggl er brukt opp.${whenReset} Sparemodus på tilvalgssiden gir færre kall.`
        }
        return `Toggl svarte med statuskode ${response.status}.`
    }

    // Kallene gjøres etter hverandre, siden Toggl struper ved mer enn omtrent ett kall i sekundet
    async function fetchProjectList(apiToken) {
        const workspaces = await fetchFromToggl('/me/workspaces', apiToken)
        const clients = await fetchFromToggl('/me/clients', apiToken)
        const projects = await fetchFromToggl('/me/projects?include_archived=true', apiToken)

        return {
            workspaces: (workspaces ?? []).map(w => ({ id: w.id, name: w.name })),
            clients: (clients ?? []).map(c => ({ id: c.id, name: c.name, workspaceId: c.wid })),
            projects: (projects ?? []).map(p => ({
                id: p.id,
                name: p.name,
                clientId: p.client_id ?? null,
                workspaceId: p.workspace_id,
                active: p.active,
            })),
        }
    }

    function toEntry(entry) {
        return {
            description: entry.description ?? '',
            start: entry.start,
            durationInSeconds: entry.duration,
            isRunning: entry.stop === null || entry.duration < 0,
            tags: entry.tags ?? [],
            projectId: entry.project_id ?? null,
            workspaceId: entry.workspace_id,
            clientName: entry.client_name ?? null,
        }
    }

    // Toggl filtrerer på starttid, og `end` er ikke inkludert
    async function fetchEntries(apiToken, start, end) {
        const query = new URLSearchParams({ start_date: start, end_date: end, meta: 'true' })
        const entries = await fetchFromToggl(`/me/time_entries?${query}`, apiToken)
        return (entries ?? []).map(toEntry)
    }

    async function fetchRunningEntry(apiToken) {
        const entry = await fetchFromToggl('/me/time_entries/current', apiToken)
        return entry ? toEntry(entry) : null
    }

    global.togglApi = { fetchProjectList, fetchEntries, fetchRunningEntry }
})(globalThis);
