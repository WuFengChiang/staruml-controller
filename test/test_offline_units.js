/**
 * Offline unit tests — no StarUML instance required.
 *
 * test_all_endpoints.sh needs a live StarUML with a model open, which makes it
 * unusable while someone else is editing that model. These tests run the same
 * route() entry point against the mock runtime in mock-staruml.js instead.
 *
 * Covers: list endpoints not leaking subtypes, lifeline represent type, and
 * operation return types (parameter direction + type).
 *
 * Run: node test/test_offline_units.js
 * Against a different checkout: API_PATH=/path/to/api-handler node test/test_offline_units.js
 */

const path = require('path')
const mock = require('./mock-staruml')
global.app = mock.app
global.type = mock.type

const api = require(process.env.API_PATH || path.join(__dirname, '..', 'api-handler'))
const t = mock.type

let pass = 0
let fail = 0
function check(label, cond, detail) {
    if (cond) {
        pass += 1
        console.log('OK   ' + label)
    } else {
        fail += 1
        console.log('FAIL ' + label + (detail ? '  -> ' + JSON.stringify(detail) : ''))
    }
}

// ---------- Fixture ----------
const comp = mock.register(new t.UMLComponent(), 'RealComponent')
const subsystem = mock.register(new t.UMLSubsystem(), 'ASubsystem')
const subject = mock.register(new t.UMLUseCaseSubject(), 'ASubject')
const cls = mock.register(new t.UMLClass(), 'Order')
const stereo = mock.register(new t.UMLStereotype(), 'entity')
const enumeration = mock.register(new t.UMLEnumeration(), 'Status')
const dataType = mock.register(new t.UMLDataType(), 'Money')

const dep = mock.register(new t.UMLDependency(), 'dep1')
const real = mock.register(new t.UMLRealization(), 'real1')
const ifaceReal = mock.register(new t.UMLInterfaceRealization(), 'ireal1')
const compReal = mock.register(new t.UMLComponentRealization(), 'creal1')

console.log('=== Gap 3: list endpoints must not leak subtypes ===')

let r = api.route('GET', '/api/component/components')
check('component/components returns only UMLComponent',
    r.success && r.data.length === 1 && r.data[0]._id === comp._id,
    r.data && r.data.map(function (d) { return d._type }))

r = api.route('GET', '/api/class/classes')
check('class/classes excludes UMLStereotype',
    r.success && r.data.length === 1 && r.data[0]._id === cls._id,
    r.data && r.data.map(function (d) { return d._type }))

r = api.route('GET', '/api/class/data-types')
check('class/data-types excludes UMLEnumeration',
    r.success && r.data.length === 1 && r.data[0]._id === dataType._id,
    r.data && r.data.map(function (d) { return d._type }))

r = api.route('GET', '/api/class/dependencies')
check('class/dependencies excludes realization subtypes',
    r.success && r.data.length === 1 && r.data[0]._id === dep._id,
    r.data && r.data.map(function (d) { return d._type }))

r = api.route('GET', '/api/class/realizations')
check('class/realizations excludes interface/component realizations',
    r.success && r.data.length === 1 && r.data[0]._id === real._id,
    r.data && r.data.map(function (d) { return d._type }))

r = api.route('GET', '/api/component/interface-realizations')
check('component/interface-realizations still finds its own type',
    r.success && r.data.length === 1 && r.data[0]._id === ifaceReal._id,
    r.data && r.data.map(function (d) { return d._type }))

r = api.route('GET', '/api/usecase/subjects')
check('usecase/subjects still finds UMLUseCaseSubject',
    r.success && r.data.length === 1 && r.data[0]._id === subject._id,
    r.data && r.data.map(function (d) { return d._type }))

r = api.route('GET', '/api/class/packages')
check('class/packages still finds UMLSubsystem (declared type)',
    r.success && r.data.length === 1 && r.data[0]._id === subsystem._id,
    r.data && r.data.map(function (d) { return d._type }))

console.log('\n=== Gap 2: lifeline represent type ===')

const collab = mock.register(new t.UMLCollaboration(), 'Sys')
const interaction = mock.register(new t.UMLInteraction(), 'Main', collab)

r = api.route('POST', '/api/seq/interactions/' + interaction._id + '/lifelines', { name: 'ui' })
check('create lifeline without represent type', r.success, r.error)
const lifelineId = r.success ? r.data._id : null

r = api.route('PUT', '/api/seq/lifelines/' + lifelineId, { representTypeId: cls._id })
check('set representTypeId to a classifier', r.success, r.error)
check('represent.type now references the class',
    r.success && r.data.representTypeId === cls._id && r.data.representTypeName === 'Order',
    r.data)

r = api.route('GET', '/api/seq/lifelines/' + lifelineId)
check('representTypeId reads back', r.success && r.data.representTypeId === cls._id, r.data)

r = api.route('PUT', '/api/seq/lifelines/' + lifelineId, { representTypeName: 'PlainString' })
check('set representTypeName as a bare string',
    r.success && r.data.representTypeName === 'PlainString' && r.data.representTypeId === undefined,
    r.data)

r = api.route('PUT', '/api/seq/lifelines/' + lifelineId, { representTypeId: cls._id, representTypeName: 'x' })
check('both represent fields at once is rejected', !r.success, r.error)

r = api.route('PUT', '/api/seq/lifelines/' + lifelineId, { representTypeId: 'no-such-id' })
check('unknown representTypeId is rejected', !r.success, r.error)

r = api.route('PUT', '/api/seq/lifelines/' + lifelineId, { representTypeId: dep._id })
check('non-classifier representTypeId is rejected', !r.success, r.error)

r = api.route('PUT', '/api/seq/lifelines/' + lifelineId, { representTypeId: null })
check('representTypeId null clears the type',
    r.success && r.data.representTypeId === undefined && r.data.representTypeName === undefined,
    r.data)

r = api.route('POST', '/api/seq/interactions/' + interaction._id + '/lifelines',
    { name: 'db', representTypeId: cls._id })
check('create lifeline with representTypeId in one call',
    r.success && r.data.representTypeId === cls._id, r.error || r.data)

// The diagramId branch builds a view as well, and is the path most callers take.
const seqDiagram = mock.register(new t.UMLSequenceDiagram(), 'MainSeq', collab)

r = api.route('POST', '/api/seq/interactions/' + interaction._id + '/lifelines',
    { name: 'api', diagramId: seqDiagram._id, representTypeId: cls._id })
check('create lifeline on a diagram with representTypeId',
    r.success && r.data.representTypeId === cls._id && r.data.representTypeName === 'Order',
    r.error || r.data)

r = api.route('POST', '/api/seq/interactions/' + interaction._id + '/lifelines',
    { name: 'plain', diagramId: seqDiagram._id, representTypeName: 'Legacy' })
check('create lifeline on a diagram with representTypeName',
    r.success && r.data.representTypeName === 'Legacy', r.error || r.data)

r = api.route('POST', '/api/seq/interactions/' + interaction._id + '/lifelines',
    { name: 'bad', diagramId: seqDiagram._id, representTypeId: 'no-such-id' })
check('bad representTypeId is refused before the lifeline is built', !r.success, r.error)

r = api.route('GET', '/api/seq/interactions/' + interaction._id + '/lifelines')
check('the refused create left no lifeline behind',
    r.success && r.data.filter(function (l) { return l.name === 'bad' }).length === 0,
    r.data && r.data.map(function (l) { return l.name }))

console.log('\n=== Message y: a clamp must be reported, not swallowed ===')

// Both lifelines need views on the diagram before a message can join them.
let lifelineA = api.route('POST', '/api/seq/interactions/' + interaction._id + '/lifelines',
    { name: 'caller', diagramId: seqDiagram._id })
let lifelineB = api.route('POST', '/api/seq/interactions/' + interaction._id + '/lifelines',
    { name: 'callee', diagramId: seqDiagram._id })
check('two lifelines on the diagram', lifelineA.success && lifelineB.success,
    lifelineA.error || lifelineB.error)

r = api.route('POST', '/api/seq/interactions/' + interaction._id + '/messages',
    { source: lifelineA.data._id, target: lifelineB.data._id, name: 'first', diagramId: seqDiagram._id, y: 200 })
check('first message takes the y it asked for', r.success && !r.clamped, r.error || r.clamped)
check('first message view reports y 200', r.success && r.data.view.y === 200, r.data && r.data.view)

// The mock caps the next message at 100 below the previous one, so asking for
// 900 must come back as a clamp rather than a clean success.
r = api.route('POST', '/api/seq/interactions/' + interaction._id + '/messages',
    { source: lifelineA.data._id, target: lifelineB.data._id, name: 'second', diagramId: seqDiagram._id, y: 900 })
check('clamped create still succeeds', r.success, r.error)
check('clamped y is reported in `clamped`',
    r.success && r.clamped && r.clamped.length === 1 && r.clamped[0].field === 'y' &&
    r.clamped[0].requested === 900 && r.clamped[0].actual === 300,
    r.clamped)
check('the message text names the clamp',
    r.success && r.message.indexOf('CLAMPED') !== -1, r.message)
check('view geometry shows where it really landed',
    r.success && r.data.view.y === 300, r.data && r.data.view)

r = api.route('POST', '/api/seq/interactions/' + interaction._id + '/messages',
    { source: lifelineA.data._id, target: lifelineB.data._id, name: 'third', diagramId: seqDiagram._id })
check('a create with no y requested reports no y outcome',
    r.success && !r.clamped, r.error || r.clamped)

console.log('\n=== Gap 1: operation return type ===')

const op = mock.register(new t.UMLOperation(), 'placeOrder', cls, 'operations')

r = api.route('POST', '/api/elements/' + op._id + '/children',
    { type: 'UMLParameter', name: 'result', direction: 'return', typeId: cls._id })
check('create return parameter with a classifier type', r.success, r.error)
check('created parameter carries direction and typeId',
    r.success && r.data.direction === 'return' && r.data.typeId === cls._id,
    r.data)
const paramId = r.success ? r.data._id : null

r = api.route('GET', '/api/elements/' + op._id + '/children?field=parameters')
check('list the operation parameters',
    r.success && r.data.length === 1 && r.data[0]._id === paramId, r.error || r.data)
check('listed parameter shows return type',
    r.success && r.data[0].direction === 'return' && r.data[0].typeId === cls._id,
    r.data)

r = api.route('GET', '/api/elements/' + op._id + '/children')
check('list children without a field filter', r.success && r.data.length === 1, r.error || r.data)

r = api.route('GET', '/api/elements/' + op._id + '/children?field=bogus')
check('unknown child field is rejected', !r.success, r.error)

r = api.route('PUT', '/api/elements/' + paramId, { direction: 'out', typeName: 'String' })
check('update parameter direction and string type',
    r.success && r.data.direction === 'out' && r.data.typeName === 'String', r.error || r.data)

r = api.route('PUT', '/api/elements/' + paramId, { direction: 'sideways' })
check('invalid direction is rejected', !r.success, r.error)

r = api.route('PUT', '/api/elements/' + cls._id, { direction: 'return' })
check('direction on a non-parameter is rejected', !r.success, r.error)

r = api.route('PUT', '/api/elements/' + cls._id, { typeId: cls._id })
check('typeId on a non-structural-feature is rejected', !r.success, r.error)

r = api.route('POST', '/api/elements/' + cls._id + '/children',
    { type: 'UMLOperation', name: 'x', direction: 'return' })
check('direction on a non-parameter child type is rejected', !r.success, r.error)

const attr = mock.register(new t.UMLAttribute(), 'total', cls, 'attributes')
r = api.route('PUT', '/api/elements/' + attr._id, { typeId: dataType._id })
check('attribute type can now be set by id (was the delete-and-recreate deadlock)',
    r.success && r.data.typeId === dataType._id, r.error || r.data)

r = api.route('GET', '/api/class/classes/' + cls._id + '/attributes')
check('attribute reference type shows in the children list',
    r.success && r.data.length === 1 && r.data[0].typeId === dataType._id,
    r.error || r.data)

console.log('\n=== Placing a new element where it was asked to go ===')

const clsDiagram = mock.register(new t.UMLClassDiagram(), 'Domain', collab)

function lastViewOn(diagram) {
    const views = diagram.ownedViews
    return views.length > 0 ? views[views.length - 1] : null
}

r = api.route('POST', '/api/class/classes',
    { diagramId: clsDiagram._id, name: 'Placed', x1: 680, y1: 420 })
check('create a class at x1/y1 only', r.success, r.error)
let v = lastViewOn(clsDiagram)
check('left/top are the coordinates that were asked for',
    v && v.left === 680 && v.top === 420,
    v && { left: v.left, top: v.top, width: v.width, height: v.height })
check('the default size is still applied',
    v && v.width === 100 && v.height === 80,
    v && { width: v.width, height: v.height })

r = api.route('POST', '/api/class/classes',
    { diagramId: clsDiagram._id, name: 'Second', x1: 900, y1: 600 })
const v2 = lastViewOn(clsDiagram)
check('a second element does not stack on the first',
    v2 && v2.left === 900 && v2.top === 600 && v2.left !== v.left,
    v2 && { left: v2.left, top: v2.top })

r = api.route('POST', '/api/class/classes',
    { diagramId: clsDiagram._id, name: 'Sized', x1: 680, y1: 420, x2: 840, y2: 500 })
v = lastViewOn(clsDiagram)
check('all four coordinates still work as before',
    v && v.left === 680 && v.top === 420 && v.width === 160 && v.height === 80,
    v && { left: v.left, top: v.top, width: v.width, height: v.height })

r = api.route('POST', '/api/class/classes', { diagramId: clsDiagram._id, name: 'Defaulted' })
v = lastViewOn(clsDiagram)
check('no coordinates at all keeps the original defaults',
    v && v.left === 100 && v.top === 100 && v.width === 100 && v.height === 80,
    v && { left: v.left, top: v.top, width: v.width, height: v.height })

console.log('\n=== documentation on an operation (peer reported this as impossible) ===')
r = api.route('PUT', '/api/elements/' + op._id, { documentation: 'Places an order.' })
check('operation documentation is writable', r.success && r.data.documentation === 'Places an order.', r.error || r.data)

console.log('\n' + pass + ' passed, ' + fail + ' failed')
process.exit(fail === 0 ? 0 : 1)
