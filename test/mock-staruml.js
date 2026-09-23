/**
 * Minimal stand-in for the StarUML runtime, so the controller's route() can be
 * exercised without a live StarUML instance.
 *
 * Only models what the offline tests touch:
 *   - repository.select('@Type') matching the whole inheritance chain, which is
 *     the behaviour that caused the list leak in the first place
 *   - engine.setProperty writing straight through
 *   - factory.createModel / createModelAndView building children
 *
 * The class hierarchy below was read out of StarUML 6's own source
 * (StarUML.app/Contents/Resources/app.asar), not guessed. It is a subset: it
 * proves the controller's own logic, and cannot prove how StarUML's engine
 * behaves. Anything about clamping, view geometry or persistence still needs
 * test_all_endpoints.sh against a live instance.
 */

let idSeq = 0
function nextId() {
    idSeq += 1
    return 'id-' + idSeq
}

// --- Class hierarchy, mirroring StarUML's (verified against app.asar) ---
class Element {
    constructor() {
        this._id = nextId()
        this.name = ''
        this._parent = null
        this.documentation = ''
    }
}
class Model extends Element {}
class UMLModelElement extends Model {
    constructor() {
        super()
        this.stereotype = null
    }
}
class UMLFeature extends UMLModelElement {}
class UMLStructuralFeature extends UMLFeature {
    constructor() {
        super()
        this.type = ''
        this.visibility = 'public'
        this.isStatic = false
        this.defaultValue = ''
        // extensions/essential/uml/metamodel.json gives UMLStructuralFeature
        // these four, and UMLAttribute adds isDerived.
        this.multiplicity = ''
        this.isReadOnly = false
        this.isOrdered = false
        this.isUnique = false
    }
}
class UMLAttribute extends UMLStructuralFeature {
    constructor() {
        super()
        this.isDerived = false
    }
}
class UMLPort extends UMLAttribute {}
// SysMLProperty extends UMLAttribute, and SysMLFlowProperty extends that with a
// direction of its own — SysMLFlowDirectionKind, which has no "return".
class SysMLProperty extends UMLAttribute {}
class SysMLFlowProperty extends SysMLProperty {
    constructor() {
        super()
        this.direction = 'inout'
    }
}
class UMLParameter extends UMLStructuralFeature {
    constructor() {
        super()
        this.direction = 'in'
    }
}
class UMLBehavioralFeature extends UMLFeature {
    constructor() {
        super()
        this.parameters = []
    }
}
class UMLOperation extends UMLBehavioralFeature {
    constructor() {
        super()
        this.visibility = 'public'
        this.isStatic = false
    }
}
class UMLClassifier extends UMLModelElement {
    constructor() {
        super()
        this.attributes = []
        this.operations = []
    }
}
class UMLClass extends UMLClassifier {}
class UMLStereotype extends UMLClass {}
class UMLInterface extends UMLClassifier {}
class UMLDataType extends UMLClassifier {}
class UMLEnumeration extends UMLDataType {}
class UMLPrimitiveType extends UMLDataType {}
class UMLSignal extends UMLClassifier {}
class UMLComponent extends UMLClassifier {}
class UMLSubsystem extends UMLComponent {}
class UMLUseCaseSubject extends UMLSubsystem {}
class UMLPackage extends UMLModelElement {}
class UMLModel_ extends UMLPackage {}
class UMLProfile extends UMLPackage {}
class UMLCollaboration extends UMLClassifier {}
class UMLInteraction extends UMLModelElement {
    constructor() {
        super()
        this.participants = []
        this.messages = []
        this.fragments = []
    }
}
class UMLMessageEndpoint extends UMLModelElement {}
class UMLLifeline extends UMLMessageEndpoint {
    constructor() {
        super()
        this.represent = null
    }
}
class UMLMessage extends UMLModelElement {}
class UMLCombinedFragment extends UMLModelElement {}
class UMLInteractionOperand extends UMLModelElement {}
class UMLStateInvariant extends UMLModelElement {}
class UMLInteractionUse extends UMLModelElement {}
// getElement's dispatch checks `instanceof` these ERD classes before falling
// back to the generic serializer. The mock never builds one — nothing here
// exercises ERD — but without a class to check against, `instanceof undefined`
// throws on every call to GET /api/elements/:id, ERD element or not.
class ERDEntity extends UMLModelElement {}
class ERDColumn extends UMLModelElement {}
class ERDDiagram extends UMLModelElement {}
class ERDRelationship extends UMLModelElement {}
class UMLRelationship extends UMLModelElement {}
class UMLDirectedRelationship extends UMLRelationship {
    constructor() {
        super()
        this.source = null
        this.target = null
    }
}
class UMLAssociationEnd extends UMLAttribute {
    constructor() {
        super()
        this.reference = null
        this.navigable = 'unspecified'
        this.aggregation = 'none'
        this.multiplicity = ''
        this.isDerived = false
        this.isReadOnly = false
        this.isOrdered = false
        this.isUnique = false
    }
}
class UMLUndirectedRelationship extends UMLRelationship {
    constructor() {
        super()
        this.end1 = null
        this.end2 = null
    }
}
class UMLAssociation extends UMLUndirectedRelationship {}
class UMLDependency extends UMLDirectedRelationship {}
class UMLAbstraction extends UMLDependency {}
class UMLRealization extends UMLAbstraction {}
class UMLInterfaceRealization extends UMLRealization {}
class UMLComponentRealization extends UMLRealization {}
class UMLGeneralization extends UMLDirectedRelationship {}
class Hyperlink extends UMLModelElement {
    constructor() {
        super()
        this.reference = null
    }
}
class Tag extends UMLModelElement {}
class UMLConstraint extends UMLModelElement {
    constructor() {
        super()
        this.specification = ''
        this.constrainedElements = []
    }
}
class UMLSequenceDiagram extends UMLModelElement {
    constructor() {
        super()
        this.ownedViews = []
    }
}
class UMLClassDiagram extends UMLModelElement {
    constructor() {
        super()
        this.ownedViews = []
    }
}

// --- View geometry, enough for message views ---
class Point {
    constructor(x, y) {
        this.x = x
        this.y = y
    }
    copy() { return new Point(this.x, this.y) }
}
// The internal array is named `points` because that is the field
// Engine.modifyEdge reads off the Points object handed to it
// (`edge.points.assign(points)` walks `pts.points`). A mock that hid it under
// another name would accept a route the real engine cannot read.
class Points {
    constructor(pts) {
        this.points = pts || []
    }
    count() { return this.points.length }
    getPoint(i) { return this.points[i] }
    clear() { this.points = [] }
    add(p) { this.points.push(p) }
    insert(i, p) { this.points.splice(i, 0, p) }
    remove(i) { this.points.splice(i, 1) }
    setPoint(i, p) { this.points[i] = p }
    copy() {
        const out = new Points()
        out.assign(this)
        return out
    }
    assign(pts) {
        this.points.length = 0
        for (let i = 0; i < pts.points.length; i++) {
            this.points.push(pts.points[i].copy())
        }
    }
}
class UMLSeqMessageView extends Element {
    constructor() {
        super()
        this.points = new Points()
        this.model = null
        this.activation = null
    }
}

// --- Views, enough to exercise edge re-pointing and parasitic geometry ---
//
// The parasitic classes below reproduce StarUML's ARRANGE side of the contract
// (EdgeParasiticView.arrangeObject and Coord.getPointAwayLine, ported from
// app.asar). The controller supplies the inverse. A round trip through both is
// the only offline way to show the inverse is right; it proves the arithmetic,
// not that StarUML calls arrange when the controller expects it to.
class View extends Element {
    constructor() {
        super()
        this.model = null
        this.subViews = []
    }
    assignTo(memento) {
        Object.keys(this).forEach(function (k) { memento[k] = this[k] }, this)
    }
    assignFrom(memento) {
        Object.keys(memento).forEach(function (k) { this[k] = memento[k] }, this)
    }
    diff(memento) {
        const out = []
        Object.keys(this).forEach(function (k) {
            if (this[k] !== memento[k]) out.push({ elem: this, f: k, n: this[k], o: memento[k] })
        }, this)
        return out
    }
    getDiagram() {
        let n = this._parent
        while (n) {
            if (Array.isArray(n.ownedViews)) return n
            n = n._parent
        }
        return null
    }
}
class NodeView extends View {
    constructor() {
        super()
        this.left = 0
        this.top = 0
        this.width = 0
        this.height = 0
    }
    getRight() { return this.left + this.width }
    getBottom() { return this.top + this.height }
    getCenter() { return new Point(this.left + this.width / 2, this.top + this.height / 2) }
}
class EdgeView extends View {
    constructor() {
        super()
        this.points = new Points()
        this.tail = null
        this.head = null
        // EdgeView's constructor reads app.preferences with LS_OBLIQUE as the
        // fallback. Oblique is what an edge starts as unless a user has changed
        // the preference.
        this.lineStyle = 1
    }
}
class UMLAssociationView extends EdgeView {}
class ParasiticView extends NodeView {
    constructor() {
        super()
        this.alpha = 0
        this.distance = 0
    }
}
class NodeParasiticView extends ParasiticView {
    constructor() {
        super()
        this.hostNode = null
    }
}
class EdgeParasiticView extends ParasiticView {
    constructor() {
        super()
        this.hostEdge = null
        this.edgePosition = 0
    }
}
// A real label carries no size until it has been drawn: View's constructor
// assigns neither width nor height, and LabelView.arrange is what fills them in,
// by measuring the text on a canvas (app.asar, LabelView.arrange). NodeView here
// starts everything at 0 for the benefit of the other tests, so a label that has
// never been drawn has to say so explicitly — `_measured` is that flag, and
// `measure()` stands in for the textExtent call.
//
// This matters because it is the state the offline suite could not reach. A test
// that assigns width before writing left/top hands the controller a size the
// live engine does not have yet, and the centre conversion then agrees with
// itself. Live, the label was 70.2 x 13 after the draw and 866/34 instead of
// 900/40 on the way in.
const MOCK_LABEL_MEASURED = { width: 70.21142578125, height: 13 }

class EdgeLabelView extends EdgeParasiticView {
    constructor() {
        super()
        this._measured = false
    }
    /** Stand-in for LabelView.arrange's canvas.textExtent call. */
    measure() {
        if (this._measured) {
            return
        }
        this._measured = true
        // A test that set a size on purpose keeps it; only an unmeasured label
        // takes the stand-in numbers.
        if (!(this.width > 0)) {
            this.width = MOCK_LABEL_MEASURED.width
        }
        if (!(this.height > 0)) {
            this.height = MOCK_LABEL_MEASURED.height
        }
    }
}

// Port of Coord.getPointAwayLine (app.asar). Do not "clean up" the arithmetic:
// the controller's inverse is written against exactly this.
function getPointAwayLine(tailPoint, headPoint, alpha, distance) {
    const a = tailPoint.x - headPoint.x
    const b = tailPoint.y - headPoint.y
    let th = Math.atan(Math.abs(b) / (Math.abs(a) + 0.000001))
    if (a > 0) {
        th = b > 0 ? Math.PI - th : th + Math.PI
    } else if (b < 0) {
        th = 2 * Math.PI - th
    }
    const x = distance * Math.cos(th + alpha)
    const y = distance * Math.sin(th + alpha)
    return new Point(Math.floor(x), Math.floor(-y))
}

// Port of EdgeParasiticView.arrangeObject / NodeParasiticView.arrange.
function arrangeParasitic(view) {
    let p1
    let p2
    if (view instanceof NodeParasiticView) {
        const node = view.hostNode || view._parent
        if (!node) return
        p1 = new Point((node.left + node.getRight()) / 2, (node.top + node.getBottom()) / 2)
        p2 = p1
        const pn = getPointAwayLine(p1, p2, view.alpha, view.distance)
        view.left = pn.x + p1.x - view.width / 2
        view.top = pn.y + p1.y - view.height / 2
        return
    }
    const edge = view.hostEdge || view._parent
    if (!edge || !edge.points || edge.points.count() < 2) return
    const count = edge.points.count()
    if (view.edgePosition === 0) {
        p1 = edge.points.getPoint(count - 1)
        p2 = edge.points.getPoint(count - 2)
    } else if (view.edgePosition === 2) {
        p1 = edge.points.getPoint(0)
        p2 = edge.points.getPoint(1)
    } else {
        let mid = Math.floor(count / 2)
        if (count % 2 === 0) mid -= 1
        const a = edge.points.getPoint(mid)
        const b = edge.points.getPoint(mid + 1)
        p2 = b
        p1 = count % 2 === 0
            ? new Point(Math.floor((a.x + b.x) / 2), Math.floor((a.y + b.y) / 2))
            : a
    }
    const p = getPointAwayLine(p1, p2, view.alpha, view.distance)
    view.left = p.x + p1.x - Math.floor(view.width / 2)
    view.top = p.y + p1.y - Math.floor(view.height / 2)
}

// StarUML's sequence layout will not place a new message more than this far
// below the previous one. The number reproduces behaviour observed against a
// live instance; it is NOT read from StarUML's source. Its job here is to let
// the tests prove the controller REPORTS a clamp — not to assert what the real
// cap is.
const MOCK_MESSAGE_Y_STEP = 100

const type = {
    Element, Model, UMLModelElement, UMLFeature, UMLStructuralFeature,
    UMLAttribute, UMLPort, UMLParameter, UMLBehavioralFeature, UMLOperation,
    UMLClassifier, UMLClass, UMLStereotype, UMLInterface, UMLDataType,
    UMLEnumeration, UMLPrimitiveType, UMLSignal, UMLComponent, UMLSubsystem,
    UMLUseCaseSubject, UMLPackage, UMLProfile, UMLCollaboration,
    UMLInteraction, UMLMessageEndpoint, UMLLifeline, UMLMessage,
    UMLCombinedFragment, UMLInteractionOperand, UMLStateInvariant, UMLInteractionUse,
    ERDEntity, ERDColumn, ERDDiagram, ERDRelationship,
    UMLRelationship, UMLDirectedRelationship, UMLDependency, UMLAbstraction,
    UMLRealization, UMLInterfaceRealization, UMLComponentRealization,
    UMLGeneralization, Hyperlink, Tag, UMLConstraint, UMLSequenceDiagram, UMLClassDiagram,
    Point, Points, UMLSeqMessageView,
    UMLUndirectedRelationship, UMLAssociation, UMLAssociationEnd,
    SysMLProperty, SysMLFlowProperty,
    View, NodeView, EdgeView, UMLAssociationView,
    ParasiticView, NodeParasiticView, EdgeParasiticView, EdgeLabelView
}
type.UMLModel = UMLModel_

// --- Repository ---
const store = []

function register(elem, name, parent, field) {
    if (name !== undefined) elem.name = name
    if (parent) {
        elem._parent = parent
        if (field && Array.isArray(parent[field])) {
            parent[field].push(elem)
        }
    }
    store.push(elem)
    return elem
}

/**
 * Build a message view, applying the same kind of vertical cap StarUML's
 * sequence layout applies: a new message cannot sit more than
 * MOCK_MESSAGE_Y_STEP below the lowest message already on the diagram.
 */
function makeMessageView(msg, options) {
    const diagram = options.diagram
    const view = new UMLSeqMessageView()
    view.model = msg

    let lowest = null
    if (diagram && Array.isArray(diagram.ownedViews)) {
        diagram.ownedViews.forEach(function (v) {
            if (v instanceof UMLSeqMessageView && v.points.count() > 0) {
                const y = v.points.getPoint(0).y
                if (lowest === null || y > lowest) lowest = y
            }
        })
    }

    const wanted = options.y1 !== undefined ? options.y1 : 50
    const capped = lowest === null ? wanted : Math.min(wanted, lowest + MOCK_MESSAGE_Y_STEP)

    view.points.add(new Point(options.x1 !== undefined ? options.x1 : 100, capped))
    view.points.add(new Point(options.x2 !== undefined ? options.x2 : 300, capped))
    if (diagram && Array.isArray(diagram.ownedViews)) {
        diagram.ownedViews.push(view)
    }
    store.push(view)
    return view
}

// StarUML pushes every write onto an undo stack; the controller now reads its
// depth to tell "undone" from "nothing to undo". Only the depth is modelled —
// this mock does not revert anything.
const undoStack = []
const redoStack = []

/**
 * Stand-in for Diagram.drawDiagram: arrange every parasitic view on the
 * diagram, the way a repaint does in StarUML.
 */
/**
 * The part of EdgeView.arrangeObject that changes what a caller reads back.
 *
 * The real one recomputes every point from the line style. Reproduced here:
 * the self-link rule, which overwrites lineStyle on every arrange, and
 * reducePoints, which drops middle points that fall inside an end box. Both are
 * cases where a write reports one value and the next draw stores another, and
 * both are what the controller has to report honestly.
 *
 * Not reproduced: the junction arithmetic that snaps the two end points to the
 * box borders. Offline tests must not assert on end coordinates.
 */
function arrangeEdge(edge) {
    if (!(edge instanceof EdgeView)) return
    if (edge.head && edge.tail && edge.head === edge.tail) {
        edge.lineStyle = 0
    }
    const inBox = function (p, node) {
        if (!node || !(node instanceof NodeView)) return false
        return p.x >= node.left && p.x <= node.getRight() &&
            p.y >= node.top && p.y <= node.getBottom()
    }
    let i = 1
    while (i < edge.points.count() - 1) {
        const p = edge.points.getPoint(i)
        if (inBox(p, edge.tail) || inBox(p, edge.head)) {
            edge.points.remove(i)
        } else {
            i++
        }
    }
}

function repaintDiagram(diagram) {
    if (!diagram || !Array.isArray(diagram.ownedViews)) return
    diagram.ownedViews.forEach(function (v) {
        if (v instanceof EdgeView) arrangeEdge(v)
    })
    // Measure before arranging, in that order: LabelView.arrange sizes itself
    // from its text and only then computes left/top from the polar pair. Arrange
    // divides the width by two, so an unmeasured label would otherwise produce
    // NaN here — which is exactly what the real engine never does, because it
    // always measures first.
    diagram.ownedViews.forEach(function (v) {
        (v.subViews || []).forEach(function (sv) {
            if (sv instanceof ParasiticView) {
                if (typeof sv.measure === 'function') sv.measure()
                arrangeParasitic(sv)
            }
        })
        if (v instanceof ParasiticView) {
            if (typeof v.measure === 'function') v.measure()
            arrangeParasitic(v)
        }
    })
}

const app = {
    repository: {
        _undoStack: { size: function () { return undoStack.length } },
        _redoStack: { size: function () { return redoStack.length } },
        undo: function () {
            if (undoStack.length > 0) redoStack.push(undoStack.pop())
        },
        redo: function () {
            if (redoStack.length > 0) undoStack.push(redoStack.pop())
        },
        getOperationBuilder: function () {
            let ops = []
            return {
                begin: function () { ops = [] },
                fieldAssign: function (elem, f, n) { ops.push({ elem: elem, f: f, n: n }) },
                end: function () {},
                getOperation: function () { return { ops: ops } }
            }
        },
        doOperation: function (op) {
            if (!op || !op.ops || op.ops.length === 0) return
            op.ops.forEach(function (o) { o.elem[o.f] = o.n })
            undoStack.push(op)
            redoStack.length = 0
        },
        getViewsOf: function (model) {
            return store.filter(function (e) { return e && e.model === model })
        },
        getEdgeViewsOf: function (view) {
            return store.filter(function (e) {
                return e instanceof EdgeView && (e.head === view || e.tail === view)
            })
        },
        get: function (id) {
            return store.filter(function (e) { return e._id === id })[0] || null
        },
        search: function (keyword) {
            return store.filter(function (e) {
                return typeof e.name === 'string' && e.name.indexOf(keyword) !== -1
            })
        },
        // Mirrors StarUML: '@Type' matches the whole inheritance chain.
        select: function (selector) {
            const typeName = selector.replace('@', '')
            const ctor = type[typeName]
            if (!ctor) return []
            return store.filter(function (e) { return e instanceof ctor })
        }
    },
    engine: {
        setProperty: function (target, prop, value) {
            target[prop] = value
            undoStack.push({ ops: [{ elem: target, f: prop, n: value }] })
            redoStack.length = 0
        },
        addItem: function (elem, field, val) {
            if (Array.isArray(elem[field])) {
                elem[field].push(val)
                undoStack.push({ ops: [] })
            }
        },
        removeItem: function (elem, field, val) {
            if (Array.isArray(elem[field])) {
                const i = elem[field].indexOf(val)
                if (i !== -1) elem[field].splice(i, 1)
                undoStack.push({ ops: [] })
            }
        },
        // Mirrors Engine.moveParasiticView: set the polar pair, repaint so
        // arrange recomputes left/top, then keep both.
        moveParasiticView: function (editor, view, alpha, distance) {
            view.alpha = alpha
            view.distance = distance
            if (editor && typeof editor.repaint === 'function') editor.repaint()
            undoStack.push({ ops: [] })
        },
        // Mirrors Engine.setLineStyle: edge views only, arrange after the write
        // so the points follow the new style, then repaint. The arrange is what
        // forces a self-link back to LS_RECTILINEAR, so the controller's report
        // of that case is exercised offline.
        setLineStyle: function (editor, views, lineStyle) {
            views.forEach(function (v) {
                if (!(v instanceof EdgeView)) return
                v.lineStyle = lineStyle
                arrangeEdge(v)
            })
            if (editor && typeof editor.repaint === 'function') editor.repaint()
            undoStack.push({ ops: [] })
            redoStack.length = 0
        },
        // Mirrors Engine.modifyEdge: assign the points, repaint, record one
        // undoable operation covering the edge and its sub views.
        modifyEdge: function (editor, edge, points) {
            if (!edge || !edge.points) return
            edge.points.assign(points)
            if (editor && typeof editor.repaint === 'function') editor.repaint()
            undoStack.push({ ops: [] })
            redoStack.length = 0
        },
        // Enough to show that the controller reaches the engine for diagram
        // types it allows. It does not lay anything out — the real one runs
        // dagre and then diffs views by index across a repaint, which is the
        // behaviour that makes it unusable on a sequence diagram.
        layoutDiagram: function (editor, diagram) {
            if (editor && typeof editor.repaint === 'function') editor.repaint()
            undoStack.push({ ops: [] })
        },
        deleteElements: function (elems) {
            elems.forEach(function (e) {
                const i = store.indexOf(e)
                if (i !== -1) store.splice(i, 1)
            })
        }
    },
    diagrams: {
        _current: null,
        _hidden: { diagram: null, repaint: function () { repaintDiagram(this.diagram) } },
        getEditor: function () {
            return { diagram: app.diagrams._current, repaint: function () { repaintDiagram(app.diagrams._current) } }
        },
        getHiddenEditor: function () { return app.diagrams._hidden }
    },
    factory: {
        createModel: function (options) {
            const ctor = type[options.id]
            if (!ctor) throw new Error('Unknown type: ' + options.id)
            const m = new ctor()
            if (options.id === 'UMLLifeline') {
                // lifelineFn always builds a Role (UMLAttribute) and attaches it.
                const role = new UMLAttribute()
                role.name = 'Role1'
                role._parent = options.parent ? options.parent._parent : null
                store.push(role)
                m.represent = role
            }
            register(m, undefined, options.parent, options.field)
            if (options.modelInitializer) options.modelInitializer(m)
            return m
        },
        createModelAndView: function (options) {
            const m = app.factory.createModel(options)
            if (m instanceof UMLMessage) {
                return makeMessageView(m, options)
            }
            const view = { _id: nextId(), model: m }
            // StarUML normalises the rectangle it is handed: left/top are the
            // minimums, width/height the absolute differences. That is what turns
            // an inverted rectangle into an element sitting somewhere else.
            if (options.x1 !== undefined && options.x2 !== undefined) {
                view.left = Math.min(options.x1, options.x2)
                view.top = Math.min(options.y1, options.y2)
                view.width = Math.abs(options.x2 - options.x1)
                view.height = Math.abs(options.y2 - options.y1)
            }
            if (options.diagram && Array.isArray(options.diagram.ownedViews)) {
                options.diagram.ownedViews.push(view)
            }
            store.push(view)
            return view
        }
    }
}

module.exports = { app, type, store, register, nextId, arrangeParasitic, repaintDiagram, Point }
