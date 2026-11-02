// Utvalget er en liste med nøkler for noder i prosjekttreet:
// `w:<id>` arbeidsområde, `c:<id>` kunde, `u:<id>` «Uten kunde» i et arbeidsområde,
// `p:<id>` prosjekt og `ingen-prosjekt` for oppføringer uten prosjekt.
// En valgt node omfatter alt under seg, også det som kommer til senere.
(function (global) {
    const withoutProjectKey = 'ingen-prosjekt'

    function buildTree(projectList, selection, previousProjectIds = null) {
        const parents = new Map()

        const workspaces = sortByName(projectList.workspaces).map(workspace => {
            const workspaceKey = `w:${workspace.id}`
            const projectsInWorkspace = projectList.projects.filter(p => p.workspaceId === workspace.id)

            const createProjectNode = project => ({
                key: `p:${project.id}`,
                name: project.name,
                archived: !project.active,
                isNew: previousProjectIds !== null && !previousProjectIds.includes(project.id),
                children: [],
            })
            const createGroupNode = (key, name, projects) => {
                const children = sortByName(projects)
                    // Arkiverte prosjekter vises bare når de er med i utvalget
                    .filter(p => p.active || [`p:${p.id}`, key, workspaceKey].some(k => selection.includes(k)))
                    .map(createProjectNode)
                return { key, name, children }
            }

            const clientNodes = sortByName(projectList.clients.filter(c => c.workspaceId === workspace.id))
                .map(client => createGroupNode(`c:${client.id}`, client.name, projectsInWorkspace.filter(p => p.clientId === client.id)))
            const withoutClientNode = createGroupNode(`u:${workspace.id}`, 'Uten kunde', projectsInWorkspace.filter(p => p.clientId === null))

            const children = [...clientNodes, withoutClientNode]
                .filter(node => node.children.length > 0 || selection.includes(node.key))
            return { key: workspaceKey, name: workspace.name, children }
        })

        const tree = [...workspaces, { key: withoutProjectKey, name: 'Uten prosjekt', children: [] }]
        registerParents(tree, null, parents)
        return { tree, parents }
    }

    function registerParents(nodes, parentKey, parents) {
        for (const node of nodes) {
            parents.set(node.key, parentKey)
            registerParents(node.children, node.key, parents)
        }
    }

    function sortByName(items) {
        return [...items].sort((a, b) => a.name.localeCompare(b.name, 'nb'))
    }

    function getAncestorKeys(key, parents) {
        const ancestors = []
        let parent = parents.get(key)
        while (parent !== null && parent !== undefined) {
            ancestors.push(parent)
            parent = parents.get(parent)
        }
        return ancestors
    }

    function isCovered(key, selection, parents) {
        return [key, ...getAncestorKeys(key, parents)].some(k => selection.includes(k))
    }

    function getDescendantKeys(node) {
        return node.children.flatMap(child => [child.key, ...getDescendantKeys(child)])
    }

    function getCheckState(node, selection, parents) {
        if (isCovered(node.key, selection, parents)) {
            return 'checked'
        }
        return getDescendantKeys(node).some(k => selection.includes(k)) ? 'partial' : 'unchecked'
    }

    function findNode(nodes, key) {
        for (const node of nodes) {
            if (node.key === key) {
                return node
            }
            const found = findNode(node.children, key)
            if (found) {
                return found
            }
        }
        return null
    }

    function toggleNode(key, selection, { tree, parents }) {
        const node = findNode(tree, key)
        const descendants = getDescendantKeys(node)
        const withoutDescendants = selection.filter(k => !descendants.includes(k))

        if (getCheckState(node, selection, parents) !== 'checked') {
            return [...withoutDescendants, key]
        }

        // Er noden valgt via en forelder, byttes forelderen ut med søsknene på veien ned til noden
        const path = [key, ...getAncestorKeys(key, parents)].reverse()
        const selectedIndex = path.findIndex(k => withoutDescendants.includes(k))
        const result = withoutDescendants.filter(k => k !== path[selectedIndex])
        for (let i = selectedIndex; i < path.length - 1; i++) {
            const siblings = findNode(tree, path[i]).children
                .map(child => child.key)
                .filter(k => k !== path[i + 1])
            result.push(...siblings)
        }
        return result
    }

    // Fjerner nøkler som ikke lenger finnes i prosjektlisten
    function pruneSelection(selection, projectList) {
        const existingKeys = new Set([
            withoutProjectKey,
            ...projectList.workspaces.flatMap(w => [`w:${w.id}`, `u:${w.id}`]),
            ...projectList.clients.map(c => `c:${c.id}`),
            ...projectList.projects.map(p => `p:${p.id}`),
        ])
        return {
            selection: selection.filter(k => existingKeys.has(k)),
            removed: selection.filter(k => !existingKeys.has(k)),
        }
    }

    function getNameForKey(key, projectList) {
        const [type, id] = key.split(':')
        const lists = { w: projectList.workspaces, c: projectList.clients, p: projectList.projects }
        if (type === 'u') {
            const workspace = projectList.workspaces.find(w => String(w.id) === id)
            return workspace ? `Uten kunde (${workspace.name})` : key
        }
        const item = (lists[type] ?? []).find(i => String(i.id) === id)
        return item ? item.name : key
    }

    // Prosjekter som er opprettet etter siste henting, finnes ikke i prosjektlisten.
    // Da brukes kundenavnet som Toggl sender med oppføringen.
    function isEntryInSelection(entry, selection, projectList) {
        if (entry.projectId === null) {
            return selection.includes(withoutProjectKey)
        }

        const project = projectList.projects.find(p => p.id === entry.projectId)
        let groupKey
        if (project) {
            groupKey = project.clientId === null ? `u:${project.workspaceId}` : `c:${project.clientId}`
        } else {
            const client = entry.clientName === null
                ? null
                : projectList.clients.find(c => c.workspaceId === entry.workspaceId && c.name === entry.clientName)
            groupKey = client ? `c:${client.id}` : entry.clientName === null ? `u:${entry.workspaceId}` : null
        }

        return [`p:${entry.projectId}`, groupKey, `w:${entry.workspaceId}`]
            .some(key => key !== null && selection.includes(key))
    }

    global.utvalg = {
        withoutProjectKey,
        isEntryInSelection,
        buildTree,
        getCheckState,
        toggleNode,
        pruneSelection,
        getNameForKey,
    }
})(globalThis);
