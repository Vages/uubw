// Kjører i sidens egen kontekst i SAP Business ByDesign, der nettappens objekter finnes.
// Leser SAP-timelisten fra nettappens datamodell, og setter timer og lagrer på samme måte som når brukeren skriver i en celle.
// Innholdsskriptet ber om dette med `postMessage`, siden det ikke når sidens kontekst. Se docs/adr/0002-sap-via-nettappens-datamodell.md.
(function () {
    const timesheetPath = '/hcm/tim/TimeSheet_QAF.QA.uicomponent'

    // Metodene er udokumenterte, så hver av dem sjekkes før noe endres
    function requireMethods(object, description, names) {
        const missing = names.filter(name => typeof object?.[name] !== 'function')
        if (missing.length > 0) {
            throw new Error(`SAP har endret nettappen, og utvidelsen må oppdateres. Mangler ${missing.join(', ')} på ${description}.`)
        }
    }

    function findTimesheet() {
        const controllerNamespace = window.sap?.b?.controller
        requireMethods(controllerNamespace, 'sap.b.controller', ['ControllerFactory'])
        requireMethods(controllerNamespace?.event, 'sap.b.controller.event', ['EventContext'])

        const factory = new controllerNamespace.ControllerFactory()
        requireMethods(factory, 'ControllerFactory', ['getControllerByPath'])
        const controller = factory.getControllerByPath(timesheetPath)?.[0]
        if (controller === undefined) {
            throw new Error('Fant ikke SAP-timelisten. Åpne «Edit Time Sheet», og prøv igjen.')
        }
        requireMethods(controller, 'timelisten', ['getDataModel', 'getEventProcessor'])
        const dataModel = controller.getDataModel()
        requireMethods(dataModel, 'datamodellen', ['getProperty', 'setProperty', 'getRoot'])
        return { controller, dataModel, EventContext: controllerNamespace.event.EventContext }
    }

    function listRows(dataModel, path) {
        const list = dataModel.getProperty(path)
        requireMethods(list, path, ['getRows'])
        const rows = list.getRows()
        requireMethods(rows[0], `radene i ${path}`, ['getPath'])
        return rows.map(row => row.getPath())
    }

    // Hvis nettappen ikke viser fram meldingene sine, oppdages ikke låsen, men utfyllingen virker likevel
    function readMessageKeys(controller) {
        const messages = controller.getMessageManager?.()?.getMessages?.() ?? controller.getMessages?.() ?? []
        return Array.isArray(messages) ? messages.map(m => m.key ?? m.getKey?.() ?? '') : []
    }

    function readSheet({ controller, dataModel }) {
        const get = path => dataModel.getProperty(path)
        const rows = listRows(dataModel, '/Root/_GridView').map(path => ({
            path,
            task: get(`${path}/ProjectTaskID`) ?? '',
            days: [1, 2, 3, 4, 5, 6, 7].map(n => {
                const day = `${path}/WeekPeriodDetails/Day${n}Details`
                const field = get(`${day}/Duration/@`)
                return { date: get(`${day}/Date`), duration: get(`${day}/Duration`), readonly: Boolean(field?.getReadonly?.()) }
            }),
        }))
        const dayStatus = Object.fromEntries(listRows(dataModel, '/Root/_Calendar/_Day')
            .map(path => [get(`${path}/Date`), get(`${path}/Status`)]))
        return {
            view: get('/Root/UIState/SelectedViewVariant'),
            viewVariant: get('/Root/_TimeRecordingMetadata/ActiveTimeRecordingViewVariantCode'),
            messageKeys: readMessageKeys(controller),
            rows,
            dayStatus,
        }
    }

    // `changes` er `{ path, value }` fra `sapTimeliste.planChanges`.
    // Endringene sendes i ett kall, som når brukeren går ut av en celle, og så lagres timelisten.
    async function write(changes) {
        const timesheet = findTimesheet()
        const { controller, dataModel, EventContext } = timesheet
        const processor = controller.getEventProcessor()
        requireMethods(processor, 'EventProcessor', ['handleEvent'])

        for (const { path, value } of changes) {
            dataModel.setProperty(path, value)
        }
        await processor.handleEvent('$SyncBusy', new EventContext(dataModel.getProperty(`${changes[0].path}/@`)))
        await processor.handleEvent('BA_Save', new EventContext(dataModel.getRoot()))
        return readSheet(timesheet)
    }

    window.addEventListener('message', async event => {
        if (event.source !== window || event.data?.type !== 'uubw-sap-forespørsel') {
            return
        }
        const { id, action, changes } = event.data
        const reply = (result, error) => window.postMessage({ type: 'uubw-sap-svar', id, result, error }, location.origin)
        try {
            reply(action === 'write' ? await write(changes) : readSheet(findTimesheet()), null)
        } catch (err) {
            console.error(err)
            reply(null, err.message)
        }
    })
})()
