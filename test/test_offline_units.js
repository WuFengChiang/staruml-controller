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

console.log('\n' + pass + ' passed, ' + fail + ' failed')
process.exit(fail === 0 ? 0 : 1)
