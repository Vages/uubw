import { describe, it, expect } from 'vitest'
import '../src/utvalg.js'

const { buildTree, getCheckState, toggleNode, pruneSelection, getNameForKey } = globalThis.utvalg

const projectList = {
    workspaces: [{ id: 1, name: 'Arbeid' }],
    clients: [
        { id: 10, name: 'Havbris', workspaceId: 1 },
        { id: 11, name: 'Annen kunde', workspaceId: 1 },
    ],
    projects: [
        { id: 100, name: 'Forvaltning', clientId: 10, workspaceId: 1, active: true },
        { id: 101, name: 'Utvikling', clientId: 10, workspaceId: 1, active: true },
        { id: 102, name: 'Gammelt', clientId: 10, workspaceId: 1, active: false },
        { id: 110, name: 'Noe annet', clientId: 11, workspaceId: 1, active: true },
        { id: 120, name: 'Internt', clientId: null, workspaceId: 1, active: true },
    ],
}

function getState(key, selection) {
    const { tree, parents } = buildTree(projectList, selection)
    const find = nodes => nodes.flatMap(n => [n, ...find(n.children)])
    return getCheckState(find(tree).find(n => n.key === key), selection, parents)
}

function toggle(key, selection) {
    return toggleNode(key, selection, buildTree(projectList, selection))
}

describe('buildTree', () => {
    it('grupperer prosjekter under kunder, med «Uten kunde» til slutt', () => {
        const { tree } = buildTree(projectList, [])
        const workspace = tree[0]
        expect(workspace.children.map(n => n.name)).toEqual(['Annen kunde', 'Havbris', 'Uten kunde'])
        expect(tree.at(-1).key).toBe('ingen-prosjekt')
    })

    it('skjuler arkiverte prosjekter som ikke er valgt', () => {
        const { tree } = buildTree(projectList, [])
        const havbris = tree[0].children.find(n => n.key === 'c:10')
        expect(havbris.children.map(n => n.key)).toEqual(['p:100', 'p:101'])
    })

    it('viser arkiverte prosjekter som er omfattet av en valgt kunde', () => {
        const { tree } = buildTree(projectList, ['c:10'])
        const havbris = tree[0].children.find(n => n.key === 'c:10')
        const gammelt = havbris.children.find(n => n.key === 'p:102')
        expect(gammelt.archived).toBe(true)
    })

    it('merker prosjekter som ikke fantes ved forrige henting', () => {
        const { tree } = buildTree(projectList, [], [100, 102, 110, 120])
        const havbris = tree[0].children.find(n => n.key === 'c:10')
        expect(havbris.children.find(n => n.key === 'p:101').isNew).toBe(true)
        expect(havbris.children.find(n => n.key === 'p:100').isNew).toBe(false)
    })
})

describe('getCheckState', () => {
    it('regner prosjekter under en valgt kunde som valgt', () => {
        expect(getState('p:100', ['c:10'])).toBe('checked')
    })

    it('regner en kunde med noen valgte prosjekter som delvis valgt', () => {
        expect(getState('c:10', ['p:100'])).toBe('partial')
    })
})

describe('toggleNode', () => {
    it('erstatter valgte prosjekter med kunden når kunden velges', () => {
        expect(toggle('c:10', ['p:100'])).toEqual(['c:10'])
    })

    it('bytter kunden ut med de andre prosjektene når ett prosjekt velges bort', () => {
        expect(toggle('p:100', ['c:10']).sort()).toEqual(['p:101', 'p:102'])
    })

    it('bytter arbeidsområdet ut med søsknene på veien ned', () => {
        expect(toggle('p:100', ['w:1']).sort()).toEqual(['c:11', 'p:101', 'p:102', 'u:1'])
    })

    it('fjerner valgte prosjekter når en delvis valgt kunde velges bort', () => {
        const selection = toggle('c:10', ['p:100'])
        expect(toggle('c:10', selection)).toEqual([])
    })
})

describe('pruneSelection', () => {
    it('fjerner nøkler som ikke finnes i prosjektlisten', () => {
        const result = pruneSelection(['c:10', 'p:999', 'ingen-prosjekt', 'u:1'], projectList)
        expect(result.selection).toEqual(['c:10', 'ingen-prosjekt', 'u:1'])
        expect(result.removed).toEqual(['p:999'])
    })
})

describe('getNameForKey', () => {
    it('finner navn på kunder, prosjekter og «Uten kunde»', () => {
        expect(getNameForKey('c:10', projectList)).toBe('Havbris')
        expect(getNameForKey('p:120', projectList)).toBe('Internt')
        expect(getNameForKey('u:1', projectList)).toBe('Uten kunde (Arbeid)')
    })
})
