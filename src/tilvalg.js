const extension = globalThis.browser ?? globalThis.chrome

const tokenInput = document.getElementById('api-nokkel')
const economyModeInput = document.getElementById('sparemodus')
const treeContainer = document.getElementById('prosjekttre')
const statusElement = document.getElementById('status')

let state = {
    apiToken: '',
    economyMode: false,
    selection: [],
    projectList: null,
    previousProjectIds: null,
}

async function loadState() {
    const synced = await extension.storage.sync.get({ apiToken: '', economyMode: false, selection: [] })
    const local = await extension.storage.local.get({ projectList: null, previousProjectIds: null })
    state = { ...synced, ...local }

    tokenInput.value = state.apiToken
    economyModeInput.checked = state.economyMode
    renderTree()
}

async function saveState() {
    const { apiToken, economyMode, selection, projectList, previousProjectIds } = state
    await extension.storage.sync.set({ apiToken, economyMode, selection })
    await extension.storage.local.set({ projectList, previousProjectIds })
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

    const { selection, removed } = utvalg.pruneSelection(state.selection, projectList)
    if (removed.length > 0) {
        const confirmed = confirm(`Den nye nøkkelen har ikke tilgang til ${removed.length} av de valgte prosjektene: ` +
            `${describeRemoved(removed, state.projectList)}. De fjernes fra utvalget. Fortsette?`)
        if (!confirmed) {
            tokenInput.value = state.apiToken
            return showStatus('Den gamle nøkkelen er beholdt.')
        }
    }

    state = { ...state, apiToken: newToken, selection, projectList, previousProjectIds: null }
    await saveState()
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

    const { selection, removed } = utvalg.pruneSelection(state.selection, projectList)
    const previousProjectIds = state.projectList ? state.projectList.projects.map(p => p.id) : null
    const removedMessage = removed.length > 0
        ? `\nFinnes ikke lenger i Toggl, og er fjernet fra utvalget: ${describeRemoved(removed, state.projectList)}.`
        : ''

    state = { ...state, selection, projectList, previousProjectIds }
    await saveState()
    renderTree()
    showStatus(`Fant ${countActiveProjects(projectList)} aktive prosjekter.${removedMessage}`)
}

async function toggleSelection(key, treeAndParents) {
    state.selection = utvalg.toggleNode(key, state.selection, treeAndParents)
    await saveState()
    renderTree()
}

function renderTree() {
    treeContainer.replaceChildren()
    if (state.projectList === null) {
        return
    }

    const treeAndParents = utvalg.buildTree(state.projectList, state.selection, state.previousProjectIds)
    const { tree } = treeAndParents
    // Arbeidsområdet vises bare som eget nivå når det finnes flere
    const workspaces = tree.filter(node => node.key.startsWith('w:'))
    const topLevel = workspaces.length === 1
        ? [...workspaces[0].children, ...tree.filter(node => !node.key.startsWith('w:'))]
        : tree

    treeContainer.append(createList(topLevel, treeAndParents))
}

function createList(nodes, treeAndParents) {
    const list = document.createElement('ul')
    for (const node of nodes) {
        const checkbox = document.createElement('input')
        checkbox.type = 'checkbox'
        const checkState = utvalg.getCheckState(node, state.selection, treeAndParents.parents)
        checkbox.checked = checkState === 'checked'
        checkbox.indeterminate = checkState === 'partial'
        checkbox.addEventListener('change', () => toggleSelection(node.key, treeAndParents))

        const label = document.createElement('label')
        const markers = [node.archived && 'arkivert', node.isNew && 'ny'].filter(Boolean)
        label.append(checkbox, ` ${node.name}`, markers.length > 0 ? ` (${markers.join(', ')})` : '')

        const item = document.createElement('li')
        item.append(label)
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
