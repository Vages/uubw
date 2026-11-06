const extension = globalThis.browser ?? globalThis.chrome

const tokenInput = document.getElementById('api-nokkel')
const economyModeInput = document.getElementById('sparemodus')
const treeContainer = document.getElementById('prosjekttre')
const statusElement = document.getElementById('status')

const timesystems = Object.entries(utvalg.timesystems)

// `selections` har ett utvalg per nøkkel i `utvalg.timesystems`
let state = {
    apiToken: '',
    economyMode: false,
    selections: Object.fromEntries(timesystems.map(([key]) => [key, []])),
    projectList: null,
    previousProjectIds: null,
}

async function loadState() {
    const storageDefaults = Object.fromEntries(timesystems.map(([, { storageKey }]) => [storageKey, []]))
    const synced = await extension.storage.sync.get({ apiToken: '', economyMode: false, ...storageDefaults })
    const local = await extension.storage.local.get({ projectList: null, previousProjectIds: null })
    state = {
        apiToken: synced.apiToken,
        economyMode: synced.economyMode,
        selections: Object.fromEntries(timesystems.map(([key, { storageKey }]) => [key, synced[storageKey]])),
        ...local,
    }

    tokenInput.value = state.apiToken
    economyModeInput.checked = state.economyMode
    renderTree()
}

// Lagrer bare utvalgene for `changedTimesystems`, så et klikk i treet gir én skriving til `storage.sync`
async function saveState(changedTimesystems = []) {
    const { apiToken, economyMode, selections, projectList, previousProjectIds } = state
    const changedSelections = Object.fromEntries(
        changedTimesystems.map(key => [utvalg.timesystems[key].storageKey, selections[key]]))
    await extension.storage.sync.set({ apiToken, economyMode, ...changedSelections })
    await extension.storage.local.set({ projectList, previousProjectIds })
}

async function saveSelection(timesystem) {
    const { storageKey } = utvalg.timesystems[timesystem]
    await extension.storage.sync.set({ [storageKey]: state.selections[timesystem] })
}

// Fjerner nøkler som ikke finnes i `projectList` fra alle utvalgene, og gir hver nøkkel som ble fjernet én gang
function pruneSelections(projectList) {
    const selections = {}
    const removed = new Set()
    for (const [key] of timesystems) {
        const result = utvalg.pruneSelection(state.selections[key], projectList)
        selections[key] = result.selection
        result.removed.forEach(k => removed.add(k))
    }
    return { selections, removed: [...removed] }
}

function showStatus(message) {
    statusElement.textContent = message
}

function countActiveProjects(projectList) {
    return projectList.projects.filter(p => p.active).length
}

function describeRemoved(removed, projectList) {
    return removed.map(key => projectList ? utvalg.getNameForKey(key, projectList) : key).join(', ')
}

async function saveToken() {
    const newToken = tokenInput.value.trim()
    if (newToken === '') {
        return showStatus('Skriv inn en API-nøkkel først.')
    }

    showStatus('Henter prosjekter …')
    let projectList
    try {
        projectList = await togglApi.fetchProjectList(newToken)
    } catch (error) {
        tokenInput.value = state.apiToken
        return showStatus(`${error.message}\nDen gamle nøkkelen er beholdt.`)
    }

    const { selections, removed } = pruneSelections(projectList)
    if (removed.length > 0) {
        const confirmed = confirm(`Den nye nøkkelen har ikke tilgang til ${removed.length} av de valgte prosjektene: ` +
            `${describeRemoved(removed, state.projectList)}. De fjernes fra utvalget. Fortsette?`)
        if (!confirmed) {
            tokenInput.value = state.apiToken
            return showStatus('Den gamle nøkkelen er beholdt.')
        }
    }

    state = { ...state, apiToken: newToken, selections, projectList, previousProjectIds: null }
    await saveState(timesystems.map(([key]) => key))
    renderTree()
    showStatus(`Nøkkelen er lagret. Fant ${countActiveProjects(projectList)} aktive prosjekter.`)
}

async function refreshProjects() {
    if (state.apiToken === '') {
        return showStatus('Lagre en API-nøkkel først.')
    }

    showStatus('Henter prosjekter …')
    let projectList
    try {
        projectList = await togglApi.fetchProjectList(state.apiToken)
    } catch (error) {
        return showStatus(error.message)
    }

    const { selections, removed } = pruneSelections(projectList)
    const previousProjectIds = state.projectList ? state.projectList.projects.map(p => p.id) : null
    const removedMessage = removed.length > 0
        ? `\nFinnes ikke lenger i Toggl, og er fjernet fra utvalget: ${describeRemoved(removed, state.projectList)}.`
        : ''

    state = { ...state, selections, projectList, previousProjectIds }
    await saveState(timesystems.map(([key]) => key))
    renderTree()
    showStatus(`Fant ${countActiveProjects(projectList)} aktive prosjekter.${removedMessage}`)
}

async function toggleSelection(timesystem, key, treeAndParents) {
    state.selections[timesystem] = utvalg.toggleNode(key, state.selections[timesystem], treeAndParents)
    await saveSelection(timesystem)
    renderTree()
}

function renderTree() {
    treeContainer.replaceChildren()
    if (state.projectList === null) {
        return
    }

    const combined = utvalg.combineSelections(state.selections)
    const treeAndParents = utvalg.buildTree(state.projectList, combined, state.previousProjectIds)
    const { tree } = treeAndParents
    // Arbeidsområdet vises bare som eget nivå når det finnes flere
    const workspaces = tree.filter(node => node.key.startsWith('w:'))
    const topLevel = workspaces.length === 1
        ? [...workspaces[0].children, ...tree.filter(node => !node.key.startsWith('w:'))]
        : tree

    treeContainer.append(createHeader(), createList(topLevel, treeAndParents))
}

function createHeader() {
    const header = document.createElement('div')
    header.className = 'rad overskrift'
    const columns = document.createElement('span')
    columns.className = 'valg'
    columns.append(...timesystems.map(([, { name }]) => {
        const column = document.createElement('span')
        column.textContent = name
        return column
    }))
    header.append(document.createElement('span'), columns)
    return header
}

function createList(nodes, treeAndParents) {
    const list = document.createElement('ul')
    for (const node of nodes) {
        const name = document.createElement('span')
        const markers = [node.archived && 'arkivert', node.isNew && 'ny'].filter(Boolean)
        name.textContent = node.name + (markers.length > 0 ? ` (${markers.join(', ')})` : '')

        const columns = document.createElement('span')
        columns.className = 'valg'
        for (const [timesystem, { name: timesystemName }] of timesystems) {
            const checkbox = document.createElement('input')
            checkbox.type = 'checkbox'
            checkbox.setAttribute('aria-label', `${node.name} i ${timesystemName}`)
            const checkState = utvalg.getCheckState(node, state.selections[timesystem], treeAndParents.parents)
            checkbox.checked = checkState === 'checked'
            checkbox.indeterminate = checkState === 'partial'
            checkbox.addEventListener('change', () => toggleSelection(timesystem, node.key, treeAndParents))
            const column = document.createElement('span')
            column.append(checkbox)
            columns.append(column)
        }

        const row = document.createElement('div')
        row.className = 'rad'
        row.append(name, columns)

        const item = document.createElement('li')
        item.append(row)
        if (node.children.length > 0) {
            item.append(createList(node.children, treeAndParents))
        }
        list.append(item)
    }
    return list
}

document.getElementById('lagre-nokkel').addEventListener('click', saveToken)
document.getElementById('hent-prosjekter').addEventListener('click', refreshProjects)
economyModeInput.addEventListener('change', async () => {
    state.economyMode = economyModeInput.checked
    await saveState()
})

loadState()
