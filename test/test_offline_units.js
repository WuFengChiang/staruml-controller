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

console.log('\n=== Gap: an operation\'s own id resolves its parameters, without knowing its parent class ===')

r = api.route('GET', '/api/elements/' + op._id)
check('GET /api/elements/:id on an operation reports its parameters',
    r.success && Array.isArray(r.data.parameters) && r.data.parameters.length === 1 &&
    r.data.parameters[0]._id === paramId,
    r.error || r.data)
check('the reported parameter carries its type, not just its id',
    r.success && r.data.parameters[0].typeName === 'String' && r.data.parameters[0].direction === 'out',
    r.data)

r = api.route('GET', '/api/class/classes/' + cls._id + '/operations')
check('class_list_class_operations also reports each operation\'s parameters',
    r.success && r.data.length === 1 && Array.isArray(r.data[0].parameters) &&
    r.data[0].parameters[0].typeName === 'String',
    r.error || r.data)

r = api.route('GET', '/api/class/classes/' + cls._id)
check('the class detail view\'s operations carry parameters too',
    r.success && r.data.operations.length === 1 && Array.isArray(r.data.operations[0].parameters) &&
    r.data.operations[0].parameters[0].typeName === 'String',
    r.error || r.data)

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

console.log('\n=== An association end can be found by id ===')

// PUT /api/elements/:id accepts an association end, but nothing used to hand
// out its id, so callers had to parse the .mdj file to get one.
const assoc = mock.register(new t.UMLAssociation(), 'orders', cls)
assoc.end1 = mock.register(new t.UMLAssociationEnd(), 'customer', assoc)
assoc.end2 = mock.register(new t.UMLAssociationEnd(), 'order', assoc)
assoc.end1.reference = cls
assoc.end2.reference = dataType

r = api.route('GET', '/api/class/associations')
check('associations list includes the association', r.success && r.data.length === 1, r.error || r.data)
check('each end carries its own _id',
    r.success && r.data[0].end1._id === assoc.end1._id && r.data[0].end2._id === assoc.end2._id,
    r.success && r.data[0])
check('the end _id is not the classifier it references',
    r.success && r.data[0].end1._id !== r.data[0].end1.reference,
    r.success && r.data[0].end1)

const endId = r.success ? r.data[0].end1._id : null
r = api.route('PUT', '/api/elements/' + endId, { documentation: 'The buying party.' })
check('that id round-trips into a documentation write',
    r.success && r.data.documentation === 'The buying party.', r.error || r.data)

console.log('\n=== No model type lost its only list endpoint ===')

// Listing now matches exact type names. That is the point of the subtype fix, but
// it has a cost: a subtype whose only home was an ancestor's list disappears
// unless some resource declares it by name. The API could then create something
// no endpoint would ever report — the caller cannot tell "I never made it" from
// "I cannot find it", so it makes another one.
//
// Read the declarations out of the family configs and the inheritance out of
// StarUML's own metamodel (dumped by test/dump_metamodel_inheritance.py), and
// require that every model type with a listed ancestor is itself listed.
const fs = require('fs')
const INHERITS = require('./metamodel-inheritance.json')

// Two types are left out on purpose:
//   C4Model                  auto-created container (AUTO_CONTAINER_TYPES); it is
//                            not an element of a diagram and never was meant to
//                            appear under c4/elements.
//   SysMLAbstractRequirement abstract base with no "view" in the metamodel, so
//                            nothing instantiates it; SysMLRequirement is the
//                            concrete one.
const NOT_LISTABLE = ['C4Model', 'SysMLAbstractRequirement']

const declaredBy = {}
fs.readdirSync(path.join(__dirname, '..', 'handlers'))
    .filter(function (f) { return /^family-.*\.js$/.test(f) })
    .forEach(function (f) {
        const cfg = require(path.join(__dirname, '..', 'handlers', f))
        function note(name, where) {
            if (!name) return
            if (!declaredBy[name]) declaredBy[name] = []
            declaredBy[name].push(where)
        }
        ;(cfg.diagrams && cfg.diagrams.types || []).forEach(function (x) { note(x, cfg.prefix + '/diagrams') })
        ;(cfg.resources || []).forEach(function (res) {
            ;(res.modelTypes || res.types || []).forEach(function (x) { note(x, cfg.prefix + '/' + res.name) })
            ;(res.children || []).forEach(function (c) {
                ;(c.modelTypes || c.types || []).forEach(function (x) { note(x, cfg.prefix + '/' + res.name + '/' + c.name) })
            })
        })
        ;(cfg.relations || []).forEach(function (rel) {
            ;(rel.modelTypes || [rel.modelType || rel.type]).forEach(function (x) { note(x, cfg.prefix + '/' + rel.name) })
        })
    })

function ancestry(name) {
    const out = []
    let cur = name
    while (cur) {
        out.push(cur)
        cur = INHERITS[cur]
    }
    return out
}

const orphans = []
Object.keys(INHERITS).forEach(function (name) {
    if (declaredBy[name] || NOT_LISTABLE.indexOf(name) !== -1) return
    const line = ancestry(name)
    // Views and diagrams are not what these endpoints list.
    if (line.indexOf('Model') === -1 || /View$/.test(name) || line.indexOf('Diagram') !== -1) return
    const listedAncestor = line.slice(1).filter(function (a) { return declaredBy[a] })[0]
    if (listedAncestor) {
        orphans.push(name + ' (was reachable via ' + listedAncestor + ')')
    }
})

check('every subtype of a listed type is listed somewhere itself',
    orphans.length === 0, orphans)

// The four the review named, and the one the sweep added, pinned by name so a
// later edit to a family config cannot quietly drop them again.
;[['UMLStructuredActivityNode', 'activity/actions'],
  ['UMLActivityParameterNode', 'activity/object-nodes'],
  ['UMLTimeConstraint', 'timing/timing-states'],
  ['UMLDurationConstraint', 'timing/timing-states'],
  ['SysMLFlowProperty', 'sysml/parts'],
  ['UMLAbstraction', 'class/dependencies'],
  ['SysMLTrace', 'class/dependencies'],
  ['SysMLItemFlow', 'infoflow/information-flows']].forEach(function (pair) {
    check(pair[0] + ' is listed by ' + pair[1],
        (declaredBy[pair[0]] || []).indexOf(pair[1]) !== -1, declaredBy[pair[0]])
})

// A relation endpoint that widened its match must still answer get/update/delete
// for the widened types, or the id it just listed leads nowhere.
const abstraction = mock.register(new t.UMLAbstraction(), 'abstr1')
r = api.route('GET', '/api/class/dependencies')
check('class/dependencies lists a UMLAbstraction',
    r.success && r.data.some(function (d) { return d._id === abstraction._id }),
    r.data && r.data.map(function (d) { return d._type }))

r = api.route('GET', '/api/class/dependencies/' + abstraction._id)
check('and GET on that id answers instead of "not found"', r.success, r.error)

r = api.route('PUT', '/api/class/dependencies/' + abstraction._id, { documentation: 'widened' })
check('and PUT on that id writes', r.success && r.data.documentation === 'widened', r.error || r.data)

// Subtypes that DO have their own endpoint must stay out of the parent list —
// that separation is what the original fix was for.
r = api.route('GET', '/api/class/dependencies')
check('but realizations still stay out of the dependency list',
    r.success && !r.data.some(function (d) { return d._type.indexOf('Realization') !== -1 }),
    r.data && r.data.map(function (d) { return d._type }))

console.log('\n=== direction belongs to more than one class, with different values ===')

// UMLParameter takes UMLDirectionKind (in/inout/out/return); SysMLFlowProperty
// takes SysMLFlowDirectionKind (in/out/inout). Refusing direction on anything but
// a UMLParameter made a flow property's direction unsettable; accepting the union
// on both would let "return" through onto a flow property, which the engine has
// no value for. Each class is checked against its own domain.
const flowProp = mock.register(new t.SysMLFlowProperty(), 'itemIn', cls, 'attributes')

r = api.route('PUT', '/api/elements/' + flowProp._id, { direction: 'out' })
check('a SysMLFlowProperty accepts direction "out"', r.success, r.error)

r = api.route('PUT', '/api/elements/' + flowProp._id, { direction: 'return' })
check('but not "return", which is a UMLParameter value',
    !r.success && /SysMLFlowProperty/.test(r.error || ''), r.error)

r = api.route('PUT', '/api/elements/' + paramId, { direction: 'return' })
check('a UMLParameter still accepts "return"', r.success, r.error)

r = api.route('PUT', '/api/elements/' + cls._id, { direction: 'in' })
check('a class, which has no direction at all, is refused',
    !r.success && /direction/.test(r.error || ''), r.error)

console.log('\n=== a rejected lifeline update must not have written anything ===')

// updateLifeline applied name/stereotype/documentation and only then asked whether
// the lifeline had a role to hang the type on. The caller read a failure for a
// write that had already partly landed.
const bareLifeline = mock.register(new t.UMLLifeline(), 'BeforeUpdate', interaction)
bareLifeline.represent = null

r = api.route('PUT', '/api/seq/lifelines/' + bareLifeline._id,
    { name: 'AfterUpdate', representTypeId: cls._id })
check('a lifeline with no role reports failure', !r.success, r.data)
check('and its name was left alone', bareLifeline.name === 'BeforeUpdate', bareLifeline.name)

console.log('\n=== children written with a field can be read back with it ===')

// POST accepts any `field`; GET used to accept only the fields derived from
// CHILD_TYPE_DEFAULT_FIELDS, so a write succeeded and the matching read answered
// "Unknown child field".
const holder = mock.register(new t.UMLClass(), 'Holder')
holder.ownedElements = []

r = api.route('POST', '/api/elements/' + holder._id + '/children',
    { type: 'UMLAttribute', name: 'tucked', field: 'ownedElements' })
check('POST can create a child into ownedElements', r.success, r.error)
const tuckedId = r.success ? r.data._id : null

r = api.route('GET', '/api/elements/' + holder._id + '/children?field=ownedElements')
check('GET reads it back through the same field',
    r.success && (r.data || []).some(function (c) { return c._id === tuckedId }),
    r.error || r.data)

r = api.route('GET', '/api/elements/' + holder._id + '/children?field=nosuchfield')
check('but a field the parent does not carry is still an error',
    !r.success && /Unknown child field/.test(r.error || ''), r.error)

console.log('\n=== Every list endpoint still answers ===')

// The exact-type filter lives in crud-factory, which builds the routes for all
// 24 diagram families. These three fixtures were not enough to cover that, so
// walk every collection GET the controller advertises and check none of them
// errors. An empty result is fine; a thrown error or a "Not found" route is not.
r = api.route('GET', '/api/status/capabilities')
check('capabilities lists the endpoints', r.success && Array.isArray(r.data.endpoints), r.error)

const listRoutes = (r.data.endpoints || [])
    .filter(function (e) { return e.indexOf('GET ') === 0 })
    .map(function (e) { return e.replace(/^GET\s+/, '') })
    .filter(function (p) { return p.indexOf(':') === -1 && p.indexOf('/api/status') !== 0 })

const broken = []
listRoutes.forEach(function (path) {
    // /api/search requires a keyword. Give it one rather than skipping the route.
    const url = path === '/api/search' ? '/api/search?keyword=probe' : path
    let res
    try {
        res = api.route('GET', url)
    } catch (e) {
        broken.push(path + ' threw ' + (e.message || e))
        return
    }
    if (!res || !res.success) {
        broken.push(path + ' -> ' + (res && res.error))
    }
})
check(listRoutes.length + ' collection GET routes all answer successfully',
    broken.length === 0, broken.slice(0, 8))

console.log('\n=== No list endpoint hands back a raw StarUML element ===')

// A serializer that passes an element straight through drags the model tree into
// the response behind it, and `_parent` closes the loop — JSON.stringify throws,
// or in the live server the request simply never returns. It stayed hidden while
// nothing could set an attribute's type to a real classifier; now that typeId
// writes work, any such serializer is one modelled attribute away from hanging.
//
// Every serializer reports parents as `_parentId`, so a raw `_parent` anywhere in
// a response means an element went out whole.
attr.type = dataType

const leaks = []
listRoutes.forEach(function (p) {
    const url = p === '/api/search' ? '/api/search?keyword=probe' : p
    let res
    try {
        res = api.route('GET', url)
    } catch (e) {
        leaks.push(p + ' threw ' + (e.message || e))
        return
    }
    let text
    try {
        text = JSON.stringify(res)
    } catch (e) {
        leaks.push(p + ' cannot be serialised: ' + (e.message || e))
        return
    }
    if (text.indexOf('"_parent"') !== -1) {
        leaks.push(p + ' embeds a raw element')
    }
})
check('no list endpoint embeds a raw element', leaks.length === 0, leaks.slice(0, 6))

r = api.route('GET', '/api/class/classes')
const withAttr = r.success && r.data.filter(function (c) { return c._id === cls._id })[0]
check('a classifier-typed attribute reports typeId and a name, not the element',
    withAttr && withAttr.attributes.some(function (a) {
        return a.typeId === dataType._id && a.typeName === 'Money' && a.type === 'Money'
    }),
    withAttr && withAttr.attributes)

// ============================================================
// Gaps reported from a live modelling session (A/B/C list)
// ============================================================

console.log('\n=== A-3: a child written to a field the parent lacks must fail loudly ===')

const constraintHost = mock.register(new t.UMLClass(), 'Invoice')
constraintHost.ownedElements = []

r = api.route('POST', '/api/elements/' + constraintHost._id + '/children',
    { type: 'UMLConstraint', name: 'xorGroup', specification: '{xor}' })
check('a UMLConstraint is created without being told where to put it',
    r.success === true && r.data && r.data._type === 'UMLConstraint', r)
check('and it says which field it used',
    r.success && r.data && r.data.field === 'ownedElements', r.data)
check('and it really is in the parent collection',
    constraintHost.ownedElements.some(function (c) { return c._type === undefined && c.name === 'xorGroup' }),
    constraintHost.ownedElements.map(function (c) { return c.name }))
check('and the specification went in with it',
    r.success && r.data && r.data.specification === '{xor}', r.data)

const createdConstraint = constraintHost.ownedElements.filter(function (c) { return c.name === 'xorGroup' })[0]

r = api.route('POST', '/api/elements/' + constraintHost._id + '/children',
    { type: 'UMLConstraint', name: 'nope', field: 'constraints' })
check('the old default field is refused instead of writing nowhere',
    r.success === false && /not a collection/.test(r.error || ''), r)
check('and the refusal names the fields that would have worked',
    r.success === false && /ownedElements/.test(r.error || ''), r.error)

r = api.route('GET', '/api/elements/' + constraintHost._id + '/children?field=ownedElements')
check('the constraint reads back through the field the write used',
    r.success && r.data.some(function (c) { return c.name === 'xorGroup' }), r.data)

r = api.route('POST', '/api/elements/' + constraintHost._id + '/children',
    { type: 'UMLClass', name: 'Nested', specification: 'x' })
check('specification is refused for a type that has none',
    r.success === false && /only supported for UMLConstraint/.test(r.error || ''), r)

console.log('\n=== C-3: a classifier can be created without picking a diagram ===')

const pkg = mock.register(new t.UMLPackage(), 'Domain')
pkg.ownedElements = []
r = api.route('POST', '/api/elements/' + pkg._id + '/children', { type: 'UMLClass', name: 'Receipt' })
check('a UMLClass is created as a model element only',
    r.success === true && r.data && r.data.name === 'Receipt', r)
check('and it lands in the package',
    pkg.ownedElements.some(function (c) { return c.name === 'Receipt' }),
    pkg.ownedElements.map(function (c) { return c.name }))

console.log('\n=== B-2 / B-3: constraint specification and constrainedElements ===')

const cA = mock.register(new t.UMLClass(), 'PaymentByCard')
const cB = mock.register(new t.UMLClass(), 'PaymentByCash')

r = api.route('PUT', '/api/elements/' + createdConstraint._id, { specification: '{xor} exactly one applies' })
check('specification is settable',
    r.success === true && createdConstraint.specification === '{xor} exactly one applies', r)
check('and reads back on the same element',
    r.data && r.data.specification === '{xor} exactly one applies', r.data)

r = api.route('PUT', '/api/elements/' + cA._id, { specification: 'nope' })
check('but not on a class',
    r.success === false && /only supported for UMLConstraint/.test(r.error || ''), r)

r = api.route('PUT', '/api/elements/' + createdConstraint._id,
    { constrainedElementIds: [cA._id, cB._id] })
check('constrainedElements is settable',
    r.success === true && createdConstraint.constrainedElements.length === 2, r)
check('and reads back as ids and names',
    r.data && r.data.constrainedElementIds.join(',') === cA._id + ',' + cB._id &&
    r.data.constrainedElementNames.join(',') === 'PaymentByCard,PaymentByCash', r.data)

r = api.route('PUT', '/api/elements/' + createdConstraint._id, { constrainedElementIds: [cB._id] })
check('writing the list again replaces it rather than appending',
    r.success === true && createdConstraint.constrainedElements.length === 1 &&
    createdConstraint.constrainedElements[0] === cB, createdConstraint.constrainedElements.length)

r = api.route('PUT', '/api/elements/' + createdConstraint._id, { constrainedElementIds: [cA._id, 'no-such-id'] })
check('a bad id in the list is refused',
    r.success === false && /not found/.test(r.error || ''), r)
check('and the list was left as it was',
    createdConstraint.constrainedElements.length === 1 && createdConstraint.constrainedElements[0] === cB,
    createdConstraint.constrainedElements.map(function (c) { return c.name }))

r = api.route('PUT', '/api/elements/' + createdConstraint._id, { constrainedElementIds: 'not-an-array' })
check('and so is a non-array',
    r.success === false && /must be an array/.test(r.error || ''), r)

console.log('\n=== C-1: an update may clear a name ===')

const namedAssoc = mock.register(new t.UMLAssociation(), 'Association1')
namedAssoc.end1 = mock.register(new t.UMLAssociationEnd(), '')
namedAssoc.end2 = mock.register(new t.UMLAssociationEnd(), '')
namedAssoc.end1.reference = cA
namedAssoc.end2.reference = cB

r = api.route('PUT', '/api/elements/' + namedAssoc._id, { name: '' })
check('a generated relation name can be cleared',
    r.success === true && namedAssoc.name === '', r)

console.log('\n=== C-2: `type` and `typeName` are one property under two names ===')

const typedAttr = mock.register(new t.UMLAttribute(), 'amount', cA, 'attributes')

r = api.route('PUT', '/api/elements/' + typedAttr._id, { type: 'Money' })
check('PUT /api/elements accepts `type`, the spelling POST .../attributes takes',
    r.success === true && typedAttr.type === 'Money', r)
check('and the response reports type, typeName and no third answer',
    r.data && r.data.type === 'Money' && r.data.typeName === 'Money', r.data)

r = api.route('PUT', '/api/elements/' + typedAttr._id, { type: 'A', typeName: 'B' })
check('giving both spellings at once is refused rather than silently picking one',
    r.success === false && /mutually exclusive/.test(r.error || ''), r)

console.log('\n=== B-1: a message can name the operation it invokes ===')

const svcClass = mock.register(new t.UMLClass(), 'PaymentService')
const chargeOp = mock.register(new t.UMLOperation(), 'charge', svcClass, 'operations')
mock.register(new t.UMLParameter(), 'amount', chargeOp, 'parameters')
const sigInteraction = mock.register(new t.UMLInteraction(), 'Checkout')
const sigMessage = mock.register(new t.UMLMessage(), 'charge', sigInteraction, 'messages')

r = api.route('PUT', '/api/seq/messages/' + sigMessage._id, { signature: chargeOp._id })
check('signature is settable through the same name the read side reports',
    r.success === true && sigMessage.signature === chargeOp, r)
check('and reads back with the operation name and parameter count',
    r.data && r.data.signatureId === chargeOp._id && r.data.signatureName === 'charge' &&
    r.data.signatureParameterCount === 1, r.data)

r = api.route('PUT', '/api/seq/messages/' + sigMessage._id, { signatureId: svcClass._id })
check('a class is refused: UML allows only an operation or a signal',
    r.success === false && /UMLOperation or a UMLSignal/.test(r.error || ''), r)

r = api.route('PUT', '/api/seq/messages/' + sigMessage._id, { signature: chargeOp._id, signatureId: chargeOp._id })
check('the two spellings are mutually exclusive',
    r.success === false && /two names for the same property/.test(r.error || ''), r)

r = api.route('PUT', '/api/seq/messages/' + sigMessage._id, { arguments: 'amount', guard: 'amount > 0' })
check('arguments and guard are settable',
    r.success === true && sigMessage.arguments === 'amount' && sigMessage.guard === 'amount > 0', r)
check('and read back',
    r.data && r.data.arguments === 'amount' && r.data.guard === 'amount > 0', r.data)

r = api.route('PUT', '/api/seq/messages/' + sigMessage._id, { signature: null })
check('and the signature can be cleared',
    r.success === true && sigMessage.signature === null, r)

console.log('\n=== A-1: an association end can be moved without rebuilding the association ===')

const gapClassDiagram = mock.register(new t.UMLClassDiagram(), 'Domain Model')
const otherDiagram = mock.register(new t.UMLClassDiagram(), 'Overview')
const oldTarget = mock.register(new t.UMLClass(), 'OldTarget')
const newTarget = mock.register(new t.UMLClass(), 'NewTarget')
const gapHolder = mock.register(new t.UMLClass(), 'Holder')

function nodeViewFor(model, diagram, left, top) {
    const v = new t.NodeView()
    v.model = model
    v.left = left
    v.top = top
    v.width = 100
    v.height = 40
    v._parent = diagram
    diagram.ownedViews.push(v)
    mock.store.push(v)
    return v
}

const holderView = nodeViewFor(gapHolder, gapClassDiagram, 0, 0)
const oldTargetView = nodeViewFor(oldTarget, gapClassDiagram, 300, 0)
const newTargetView = nodeViewFor(newTarget, gapClassDiagram, 600, 0)
nodeViewFor(gapHolder, otherDiagram, 0, 0)
nodeViewFor(oldTarget, otherDiagram, 300, 0)
// NewTarget is deliberately absent from otherDiagram.

const movable = mock.register(new t.UMLAssociation(), 'owns')
movable.end1 = mock.register(new t.UMLAssociationEnd(), '')
movable.end2 = mock.register(new t.UMLAssociationEnd(), '')
movable.end1.reference = gapHolder
movable.end2.reference = oldTarget

function assocViewOn(diagram, tail, head) {
    const v = new t.UMLAssociationView()
    v.model = movable
    v.tail = tail
    v.head = head
    v._parent = diagram
    v.points.add(new mock.Point(100, 20))
    v.points.add(new mock.Point(300, 20))
    diagram.ownedViews.push(v)
    mock.store.push(v)
    return v
}
const assocViewMain = assocViewOn(gapClassDiagram, holderView, oldTargetView)
const assocViewOther = assocViewOn(otherDiagram, otherDiagram.ownedViews[0], otherDiagram.ownedViews[1])

r = api.route('PUT', '/api/class/associations/' + movable._id, { end2: { reference: newTarget._id } })
check('end2.reference is accepted and written',
    r.success === true && movable.end2.reference === newTarget, r)
check('the view on a diagram that shows the new class is re-pointed',
    assocViewMain.head === newTargetView, assocViewMain.head && assocViewMain.head._id)
check('a diagram that does not show it is reported, not silently left wrong',
    Array.isArray(r.ignored) && r.ignored.some(function (i) {
        return /has no view on this diagram/.test(i.reason || '')
    }), r.ignored)
check('and that diagram still draws the old endpoint',
    assocViewOther.head.model === oldTarget, assocViewOther.head.model.name)

r = api.route('GET', '/api/class/associations/' + movable._id)
check('the read side reports the new reference',
    r.success && r.data.end2.reference === newTarget._id, r.data && r.data.end2)

r = api.route('PUT', '/api/class/associations/' + movable._id, { end1: { reference: pkg._id } })
check('an association end cannot be pointed at a package',
    r.success === false && /UMLClassifier/.test(r.error || ''), r)
check('and the end was left alone',
    movable.end1.reference === gapHolder, movable.end1.reference && movable.end1.reference.name)

r = api.route('PUT', '/api/class/associations/' + movable._id, { end1: { reference: 'no-such-id' } })
check('a missing id is refused before anything is written',
    r.success === false && /not found/.test(r.error || ''), r)

r = api.route('PUT', '/api/class/associations/' + movable._id, { end1: { multiplicity: '0..*', bogus: 'x' } })
check('an unknown end field is still reported',
    r.success === true && Array.isArray(r.ignored) &&
    r.ignored.some(function (i) { return i.field === 'end1.bogus' }), r.ignored)
check('and the settable list now includes reference',
    r.ignored.some(function (i) { return /reference/.test(i.reason || '') }), r.ignored)

console.log('\n=== C-26: navigable is a UMLNavigableKind string, not a boolean ===')

r = api.route('PUT', '/api/class/associations/' + movable._id, { end1: { navigable: 'navigable' }, end2: { navigable: 'notNavigable' } })
check('the three-valued strings are written as given',
    r.success === true && movable.end1.navigable === 'navigable' && movable.end2.navigable === 'notNavigable', r)

r = api.route('PUT', '/api/class/associations/' + movable._id, { end1: { navigable: false }, end2: { navigable: true } })
check('a boolean is stored as the string it stands for',
    r.success === true && movable.end1.navigable === 'notNavigable' && movable.end2.navigable === 'navigable',
    [movable.end1.navigable, movable.end2.navigable])

r = api.route('GET', '/api/class/associations/' + movable._id)
check('the read side returns the string, not a boolean',
    r.success && r.data.end1.navigable === 'notNavigable' && r.data.end2.navigable === 'navigable', r.data)

r = api.route('PUT', '/api/class/associations/' + movable._id, { end1: { multiplicity: '1' }, end2: { navigable: 'yes' } })
check('an unknown navigable value is refused with the allowed list',
    r.success === false && /unspecified, navigable, notNavigable/.test(r.error || ''), r)
check('and nothing in that request was written, end1 included',
    movable.end1.multiplicity === '0..*' && movable.end2.navigable === 'navigable',
    [movable.end1.multiplicity, movable.end2.navigable])

r = api.route('PUT', '/api/class/associations/' + movable._id, { end1: { aggregation: 'strong' } })
check('an unknown aggregation value is refused too',
    r.success === false && /none, shared, composite/.test(r.error || ''), r)

r = api.route('POST', '/api/class/associations', { diagramId: gapClassDiagram._id, sourceId: gapHolder._id, targetId: oldTarget._id, end1: { navigable: 'yes' } })
check('create refuses an unknown navigable value before building anything',
    r.success === false && /unspecified, navigable, notNavigable/.test(r.error || ''), r)

r = api.route('PUT', '/api/class/associations/' + movable._id, { end1: { isDerived: true, isOrdered: true } })
check('a class association end takes isDerived and isOrdered',
    r.success === true && movable.end1.isDerived === true && movable.end1.isOrdered === true, r)
r = api.route('PUT', '/api/class/associations/' + movable._id, { end1: { isDerived: 'true' } })
check('and refuses a string where a boolean belongs',
    r.success === false && /must be a boolean/.test(r.error || ''), r)

r = api.route('PUT', '/api/elements/' + movable.end2._id, { isDerived: true, isUnique: true })
check('C-22: PUT /api/elements takes isDerived and isUnique on an association end',
    r.success === true && movable.end2.isDerived === true && movable.end2.isUnique === true, r)
r = api.route('PUT', '/api/elements/' + gapHolder._id, { isDerived: true })
check('and names the element type when that element has no such property',
    r.success === false && /not a property of UMLClass/.test(r.error || ''), r)

r = api.route('GET', '/api/status/capabilities')
const endCaps = r.data || {}
check('capabilities publish the navigable kinds',
    JSON.stringify(endCaps.allowedNavigableKinds) === JSON.stringify(['unspecified', 'navigable', 'notNavigable']), endCaps.allowedNavigableKinds)
check('and the class association end fields under its own route',
    (endCaps.writableEndFields['PUT /api/class/associations/:id'] || []).indexOf('isDerived') !== -1,
    endCaps.writableEndFields)
check('and the union of end fields includes them',
    endCaps.writableFields['relation end (end1/end2)'].indexOf('isDerived') !== -1 &&
    endCaps.writableFields['relation end (end1/end2)'].indexOf('referenceId') !== -1,
    endCaps.writableFields['relation end (end1/end2)'])

console.log('\n=== A-2: an edge label takes a position in left/top ===')

const labelEdge = assocViewMain
const label = new t.EdgeLabelView()
label.width = 60
label.height = 13
label.hostEdge = labelEdge
label.edgePosition = 1
label._parent = labelEdge
labelEdge.subViews.push(label)
mock.store.push(label)
// Give the edge a path the label can hang off.
labelEdge.points.clear()
labelEdge.points.add(new mock.Point(100, 20))
labelEdge.points.add(new mock.Point(700, 20))
mock.app.diagrams._current = gapClassDiagram

r = api.route('PUT', '/api/views/' + label._id, { left: 400, top: 120 })
check('left/top on an edge label are accepted',
    r.success === true, r)
check('and StarUML\'s own arrange puts the label within a pixel of where it was asked',
    Math.abs(label.left - 400) <= 1 && Math.abs(label.top - 120) <= 1,
    { left: label.left, top: label.top })
check('the polar pair the engine actually stores was written too',
    label.distance > 0 && isFinite(label.alpha), { alpha: label.alpha, distance: label.distance })
check('and the report never claims an exact write it did not make',
    (r.ignored === undefined) &&
    (Math.abs(label.left - 400) < 1e-6
        ? /left/.test(r.message)
        : (Array.isArray(r.clamped) && r.clamped.some(function (c) { return c.field === 'left' }))),
    { message: r.message, clamped: r.clamped })

r = api.route('PUT', '/api/views/' + label._id, { alpha: 0.5, distance: 40 })
check('alpha/distance still work and re-derive left/top',
    r.success === true && label.alpha === 0.5 && label.distance === 40, r)

// getPointAwayLine branches on the signs of dx and dy, and getPolar has its own
// flip for a negative dx. One horizontal edge exercises exactly one of those
// paths, so a port error in any other branch would pass unnoticed. Drive the
// label round every combination of edge direction and anchor end.
const QUADRANTS = [
    { name: 'down-right', a: [100, 20], b: [700, 420] },
    { name: 'up-left', a: [700, 420], b: [100, 20] },
    { name: 'down-left', a: [700, 20], b: [100, 420] },
    { name: 'up-right', a: [100, 420], b: [700, 20] },
    { name: 'vertical down', a: [400, 20], b: [400, 420] },
    { name: 'vertical up', a: [400, 420], b: [400, 20] }
]
const ANCHORS = [
    { name: 'EP_HEAD', value: 0 },
    { name: 'EP_MIDDLE', value: 1 },
    { name: 'EP_TAIL', value: 2 }
]
const roundTripMisses = []
QUADRANTS.forEach(function (q) {
    ANCHORS.forEach(function (anchor) {
        labelEdge.points.clear()
        labelEdge.points.add(new mock.Point(q.a[0], q.a[1]))
        labelEdge.points.add(new mock.Point(q.b[0], q.b[1]))
        label.edgePosition = anchor.value
        const want = { left: 250, top: 260 }
        const res = api.route('PUT', '/api/views/' + label._id, want)
        if (!res.success) {
            roundTripMisses.push(q.name + '/' + anchor.name + ': ' + res.error)
            return
        }
        if (Math.abs(label.left - want.left) > 1 || Math.abs(label.top - want.top) > 1) {
            roundTripMisses.push(q.name + '/' + anchor.name + ': landed at ' +
                label.left + ',' + label.top)
        }
    })
})
check('the left/top round trip holds for every edge direction and anchor end (' +
    (QUADRANTS.length * ANCHORS.length) + ' cases)',
    roundTripMisses.length === 0, roundTripMisses.slice(0, 6))

// Restore a simple horizontal edge for whatever runs after this.
labelEdge.points.clear()
labelEdge.points.add(new mock.Point(100, 20))
labelEdge.points.add(new mock.Point(700, 20))
label.edgePosition = 1

// The case the live run failed on, and the one every check above stepped over:
// a label created a moment ago, never drawn, with no measured size. The checks
// above all assign width and height first, which hands the controller a size the
// engine does not have yet — so the centre conversion agreed with itself and the
// suite passed a formula the live engine refused (900/40 asked, 866/34 landed).
const freshLabel = new t.EdgeLabelView()
freshLabel.hostEdge = labelEdge
freshLabel.edgePosition = 1
freshLabel._parent = labelEdge
labelEdge.subViews.push(freshLabel)
mock.store.push(freshLabel)
check('a label starts with no size, the way one does before its first draw',
    !(freshLabel.width > 0) && !(freshLabel.height > 0),
    { width: freshLabel.width, height: freshLabel.height })

r = api.route('PUT', '/api/views/' + freshLabel._id, { left: 400, top: 120 })
check('writing left/top on a never-drawn label is accepted', r.success === true, r)
check('and it lands where it was asked, not half a label short',
    Math.abs(freshLabel.left - 400) <= 1 && Math.abs(freshLabel.top - 120) <= 1,
    { left: freshLabel.left, top: freshLabel.top,
      width: freshLabel.width, height: freshLabel.height })
check('the label was measured on the way through, so arrange had a real size',
    freshLabel.width > 0 && freshLabel.height > 0,
    { width: freshLabel.width, height: freshLabel.height })

const plainView = holderView
r = api.route('PUT', '/api/views/' + plainView._id, { left: 15, top: 25 })
check('a plain node view is unaffected by the parasitic path',
    r.success === true && plainView.left === 15 && plainView.top === 25, r)

console.log('\n=== A-4: undo says whether it undid anything ===')

// Every write above pushed an operation, so the stack is not empty here.
r = api.route('POST', '/api/undo')
check('undo reports success while there is something to undo',
    r.success === true && r.data && r.data.stackSizeAfter < r.data.stackSizeBefore, r)

let guard = 0
while (mock.app.repository._undoStack.size() > 0 && guard < 10000) {
    mock.app.repository.undo()
    guard += 1
}
r = api.route('POST', '/api/undo')
check('and reports failure once the stack is empty, instead of "Undo executed"',
    r.success === false && /Nothing to undo/.test(r.error || ''), r)

r = api.route('POST', '/api/redo')
check('redo answers the same way',
    r.success === true && r.data && r.data.stackSizeAfter < r.data.stackSizeBefore, r)

console.log('\n=== C-4: layout is refused on a sequence diagram ===')

const seqForLayout = mock.register(new t.UMLSequenceDiagram(), 'Checkout SD')
r = api.route('POST', '/api/diagrams/' + seqForLayout._id + '/layout', {})
check('layout on a UMLSequenceDiagram is refused with the reason',
    r.success === false && /destroy its arrangement/.test(r.error || ''), r)
check('and points at the supported way to move a message',
    /PUT \/api\/seq\/messages/.test(r.error || ''), r.error)

r = api.route('POST', '/api/diagrams/' + gapClassDiagram._id + '/layout', {})
check('a class diagram still lays out',
    r.success === true, r)

console.log('\n=== D-1: line style is settable, readable, and honest about the self-link ===')

const styleDiagram = mock.register(new t.UMLClassDiagram(), 'Routing', collab)
const boxA = nodeViewFor(mock.register(new t.UMLClass(), 'A'), styleDiagram, 0, 0)
const boxB = nodeViewFor(mock.register(new t.UMLClass(), 'B'), styleDiagram, 400, 0)
// Squarely between A and B, so a straight line from A to B runs through it.
const blocker = nodeViewFor(mock.register(new t.UMLClass(), 'Blocker'), styleDiagram, 180, 0)
mock.app.diagrams._current = styleDiagram

function edgeOn(diagram, tail, head) {
    const v = new t.UMLAssociationView()
    v.tail = tail
    v.head = head
    v._parent = diagram
    v.points.add(new mock.Point(tail.left + tail.width / 2, tail.top + tail.height / 2))
    v.points.add(new mock.Point(head.left + head.width / 2, head.top + head.height / 2))
    diagram.ownedViews.push(v)
    mock.store.push(v)
    return v
}
const styleEdge = edgeOn(styleDiagram, boxA, boxB)

r = api.route('GET', '/api/diagrams/' + styleDiagram._id + '/views')
const edgeInList = r.data.filter(function (d) { return d._id === styleEdge._id })[0]
check('an edge reports its line style, so a caller can read back what it set',
    edgeInList && edgeInList.lineStyle === 1, edgeInList)
check('and reports its points, so a caller can read the route',
    edgeInList && Array.isArray(edgeInList.points) && edgeInList.points.length === 2, edgeInList)

r = api.route('PUT', '/api/views/' + styleEdge._id + '/style', { lineStyle: 0 })
check('lineStyle 0 (rectilinear) is accepted',
    r.success === true && styleEdge.lineStyle === 0, r)
check('and the response carries the stored value',
    r.data && r.data.lineStyle === 0, r.data)

r = api.route('PUT', '/api/views/' + styleEdge._id + '/style', { lineStyle: 7 })
check('a value outside the engine\'s five is refused, not stored',
    r.success === false && /Allowed values/.test(r.error || ''), r)
check('and the refusal names them',
    /LS_RECTILINEAR/.test(r.error || '') && /LS_DIRECT/.test(r.error || ''), r.error)
check('the edge kept the last good value',
    styleEdge.lineStyle === 0, styleEdge.lineStyle)

r = api.route('PUT', '/api/views/' + boxA._id + '/style', { lineStyle: 1 })
check('lineStyle on a node view is refused with the view type',
    r.success === false && /only supported for edge views/.test(r.error || ''), r)

const selfEdge = edgeOn(styleDiagram, boxA, boxA)
r = api.route('PUT', '/api/views/' + selfEdge._id + '/style', { lineStyle: 1 })
check('a self-link reports the oblique write as ignored, not as updated',
    r.success === true && Array.isArray(r.ignored) &&
    r.ignored.some(function (i) { return i.field === 'lineStyle' }), r)
check('and says the arrange pass is what overwrites it',
    r.ignored.some(function (i) { return /arrangeObject/.test(i.reason || '') }), r.ignored)
check('the stored value is the rectilinear the engine forced',
    selfEdge.lineStyle === 0, selfEdge.lineStyle)

console.log('\n=== D-2: an edge route can be written and read back ===')

r = api.route('PUT', '/api/views/' + styleEdge._id + '/points', {
    points: [{ x: 50, y: 20 }, { x: 50, y: 200 }, { x: 450, y: 200 }, { x: 450, y: 20 }]
})
check('a four-point route is accepted',
    r.success === true, r)
check('and reads back with its two waypoints',
    r.data && r.data.points && r.data.points.length === 4, r.data && r.data.points)

r = api.route('PUT', '/api/views/' + styleEdge._id + '/points', { points: [{ x: 0, y: 0 }] })
check('a one-point route is refused',
    r.success === false && /at least two points/.test(r.error || ''), r)

r = api.route('PUT', '/api/views/' + styleEdge._id + '/points', { points: [{ x: 0, y: 0 }, { x: 'a', y: 1 }] })
check('a non-numeric coordinate is refused and names the index',
    r.success === false && /points\[1\]/.test(r.error || ''), r)

r = api.route('PUT', '/api/views/' + boxA._id + '/points', { points: [{ x: 0, y: 0 }, { x: 1, y: 1 }] })
check('points on a node view are refused',
    r.success === false && /only supported for edge views/.test(r.error || ''), r)

// A waypoint inside an end box is dropped by the engine's own reducePoints.
r = api.route('PUT', '/api/views/' + styleEdge._id + '/points', {
    points: [{ x: 50, y: 20 }, { x: 20, y: 20 }, { x: 450, y: 20 }]
})
check('a waypoint inside the tail box is dropped, and the response says so',
    r.success === true && /drops waypoints/.test(r.message || ''), r.message)

console.log('\n=== D-3: moving a box keeps or clears the route, as asked ===')

api.route('PUT', '/api/views/' + styleEdge._id + '/points', {
    points: [{ x: 50, y: 20 }, { x: 50, y: 200 }, { x: 450, y: 200 }, { x: 450, y: 20 }]
})
r = api.route('PUT', '/api/views/' + boxA._id, { top: 10 })
check('moving a box clears the route, the way it always has',
    r.success === true && styleEdge.points.count() === 2, styleEdge.points.count())

api.route('PUT', '/api/views/' + styleEdge._id + '/points', {
    points: [{ x: 50, y: 30 }, { x: 50, y: 200 }, { x: 450, y: 200 }, { x: 450, y: 20 }]
})
r = api.route('PUT', '/api/views/' + boxA._id, { top: 20, keepEdgeWaypoints: true })
check('keepEdgeWaypoints leaves the waypoints alone',
    r.success === true && styleEdge.points.count() === 4, styleEdge.points.count())

r = api.route('PUT', '/api/views/' + boxA._id, { keepEdgeWaypoints: true })
check('keepEdgeWaypoints on its own is refused, rather than reporting a write it did not do',
    r.success === false && /alongside a move or resize/.test(r.error || ''), r)

console.log('\n=== D-4: routing goes around a box in the way ===')

r = api.route('POST', '/api/views/' + styleEdge._id + '/route', {})
check('routing succeeds and says how many views it had to avoid',
    r.success === true && /Routed edge around 1 view/.test(r.message || ''), r)
const routed = r.data && r.data.points
check('the route has at least one waypoint, so it is not the straight line',
    routed && routed.length > 2, routed)
check('and no waypoint sits inside the blocking box',
    routed && routed.every(function (p) {
        return !(p.x >= blocker.left && p.x <= blocker.getRight() &&
            p.y >= blocker.top && p.y <= blocker.getBottom())
    }), { routed: routed, blocker: { left: blocker.left, top: blocker.top, w: blocker.width, h: blocker.height } })

r = api.route('POST', '/api/views/' + selfEdge._id + '/route', {})
check('a self-link is refused with the reason, not routed into nonsense',
    r.success === false && /same view/.test(r.error || ''), r)

r = api.route('POST', '/api/views/' + styleEdge._id + '/route', { grid: 0 })
check('a zero grid is refused',
    r.success === false && /positive number/.test(r.error || ''), r)

r = api.route('POST', '/api/views/' + boxA._id + '/route', {})
check('routing a node view is refused',
    r.success === false && /only supported for edge views/.test(r.error || ''), r)

r = api.route('PUT', '/api/views/' + styleEdge._id + '/points', {
    points: [{ x: 50, y: 30 }, { x: 50, y: 200 }, { x: 450, y: 20 }]
})
check('the response always states whether the engine moved the two ends',
    r.success === true && r.data && typeof r.data.endsSnappedByEngine === 'boolean', r.data)

// Bury the tail box inside a bigger one: there is no way out, and that is a
// different problem from "no route exists".
const cage = nodeViewFor(mock.register(new t.UMLClass(), 'Cage'), styleDiagram, -60, -60)
cage.width = 300
cage.height = 200
r = api.route('POST', '/api/views/' + styleEdge._id + '/route', {})
check('a tail buried inside another box is reported as no way out, not as no route',
    r.success === false && /no way out/.test(r.error || ''), r.error)

console.log('\n=== E-1: capabilities reports the field list every write actually enforces ===')

// The whole point of publishing writableFields is that a caller can ask "does
// any route take field X" without sending a request and reading the rejection.
// That only holds if every key names a real endpoint and every value is the
// array that endpoint checks against.
//
// Probing proves both at once, and it is read-only: checkUnknownFields runs
// before findById, so an unknown field on a made-up id is refused before the
// handler looks anything up.
const caps = api.route('GET', '/api/status/capabilities')
const writable = caps.data.writableFields
const capKeys = Object.keys(writable).filter(function (k) { return /^[A-Z]+ \//.test(k) })

check('capabilities publishes a field list for every write, not a handful',
    capKeys.length > 300, capKeys.length)

const probeFailures = []
const notProbed = []
capKeys.forEach(function (key) {
    const sp = key.indexOf(' ')
    const method = key.slice(0, sp)
    const path = key.slice(sp + 1).replace(/:[a-zA-Z]+/g, 'probe-not-a-real-id')
    let r
    try {
        r = api.route(method, path, { __probe__: 1 })
    } catch (e) {
        probeFailures.push({ key: key, threw: e.message })
        return
    }
    const err = (r && r.error) || ''
    const m = err.match(/Allowed fields: (.*)$/)
    if (!m) {
        notProbed.push({ key: key, error: err.slice(0, 90) || '(no error — the probe was accepted)' })
        return
    }
    const reported = m[1].split(', ')
    const expected = writable[key]
    if (reported.join('|') !== expected.join('|')) {
        probeFailures.push({ key: key, reported: reported, published: expected })
    }
})

check('every published path exists and refuses an unknown field before looking anything up',
    notProbed.length === 0, notProbed.slice(0, 6))
check('and the list it refuses with is exactly the list capabilities published',
    probeFailures.length === 0, probeFailures.slice(0, 6))
console.log('     probed ' + capKeys.length + ' endpoints, ' +
    (capKeys.length - probeFailures.length - notProbed.length) + ' matched')

// A constant nobody registered is the drift this endpoint exists to prevent, so
// fail on it here rather than letting it be found by a caller months later.
const apiSrc = require('fs').readFileSync(
    process.env.API_PATH ? process.env.API_PATH + '.js' : path.join(__dirname, '..', 'api-handler.js'), 'utf8')
const usedConstants = []
const re = /checkUnknownFields\(body,\s*([A-Z][A-Z0-9_]*)\s*\)/g
let cm
while ((cm = re.exec(apiSrc)) !== null) {
    if (usedConstants.indexOf(cm[1]) === -1) usedConstants.push(cm[1])
}
// Only the table itself. Slicing to end-of-file would let a match anywhere in
// the remaining few thousand lines count as "registered".
const tableStart = apiSrc.indexOf('const STATIC_WRITABLE_FIELDS')
const registeredSrc = apiSrc.slice(tableStart, apiSrc.indexOf('\n}\n', tableStart))
// 'm' so `$` means end-of-line: the last entry in the table carries no comma.
const unregistered = usedConstants.filter(function (c) {
    return !new RegExp("': " + c + "(,|$)", 'm').test(registeredSrc)
})
check('every whitelist constant in api-handler.js is published under some endpoint',
    unregistered.length === 0, unregistered)

console.log('\n' + pass + ' passed, ' + fail + ' failed')
process.exit(fail === 0 ? 0 : 1)
