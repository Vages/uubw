// De interne endepunktene som nettappen til PowerOffice bruker for timelisten.
// Kallene går via `poweroffice_side.js`, som kjører i sidens kontekst og sender nettappens egne hoder. Se docs/adr/0001-poweroffice-via-interne-endepunkter.md.
(function (global) {
    const timetracking = '/api/timetracking'
    const pending = new Map()
    let nextId = 0

    window.addEventListener('message', event => {
        if (event.source !== window || event.data?.type !== 'uubw-svar' || !pending.has(event.data.id)) {
            return
        }
        const { resolve } = pending.get(event.data.id)
        pending.delete(event.data.id)
        resolve(event.data)
    })

    async function request(method, url, body = null) {
        const id = nextId++
        const { status, text } = await new Promise(resolve => {
            pending.set(id, { resolve })
            window.postMessage({ type: 'uubw-forespørsel', id, method, url, body }, location.origin)
        })
        if (status !== 200) {
            throw new Error(`PowerOffice svarte med statuskode ${status} på ${method} ${url}.\n\n${text.slice(0, 500)}`.trim())
        }
        const json = JSON.parse(text)
        if (json.success === false) {
            throw new Error(`PowerOffice avviste ${method} ${url.split('?')[0]}: ${json.message ?? json.errorMessage ?? text}`)
        }
        return json.data ?? json
    }

    function fetchWeek(weekNo, year) {
        return request('GET', `${timetracking}/timesheet/timesheet/week?weekNo=${weekNo}&year=${year}`)
    }

    // Kode → aktivitet
    async function fetchActivities() {
        const activities = await request('GET', '/api/cache/cachedentities/activities?language=nb-NO')
        return new Map(activities.map(activity => [activity.code, activity]))
    }

    // Kode → prosjekt, for de kodene som finnes blant aktive prosjekter
    async function findProjects(codes) {
        const projects = new Map()
        for (const code of codes) {
            const query = new URLSearchParams({ maxCount: 101, searchText: code, employeeId: '', activeOnly: true, customerId: '' })
            const found = await request('POST', `${timetracking}/timedimensions/projectSearch?${query}`)
            const project = found.find(p => p.code === code)
            if (project) {
                projects.set(code, project)
            }
        }
        return projects
    }

    async function fetchAllowedActivityIds(project) {
        const query = new URLSearchParams({ projectId: project.id, assignmentAgreementId: '', hasCustomer: project.customerId != null })
        const allowed = await request('GET', `${timetracking}/timedimensions/getAllowedActivities?${query}`)
        return allowed.map(a => a.activityId)
    }

    // `target` fra `poweroffice.toTargets`, og en dato i uken
    function saveNewLine(target, date) {
        return request('PUT', `${timetracking}/timesheet/timesheet/saveNewLine`, {
            date,
            customerId: target.customerId == null ? null : String(target.customerId),
            projectId: target.projectId == null ? null : String(target.projectId),
            departmentId: null,
            activityId: String(target.activityId),
            timeSpecificationId: '0',
            defaultTimeSpecificationSettingId: null,
            timeProject: target.project,
            compositeAssignmentAgreementId: '',
        })
    }

    // `minutes: 0` sletter registreringen
    function saveEntry(entry) {
        return request('PUT', `${timetracking}/timesheet/timesheet/saveEntry`, entry)
    }

    function removeLine(lineId, weekNo, year) {
        const query = new URLSearchParams({ id: lineId, virtualId: '', weekNo, year })
        return request('DELETE', `${timetracking}/timesheet/timesheet/removeLine?${query}`)
    }

    global.powerOfficeApi = { fetchWeek, fetchActivities, findProjects, fetchAllowedActivityIds, saveNewLine, saveEntry, removeLine }
})(globalThis);
