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
    }
}
class UMLAttribute extends UMLStructuralFeature {}
class UMLPort extends UMLAttribute {}
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
class UMLRelationship extends UMLModelElement {}
class UMLDirectedRelationship extends UMLRelationship {
    constructor() {
        super()
        this.source = null
        this.target = null
    }
}
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
}
class Points {
    constructor(pts) {
        this._pts = pts || []
    }
    count() { return this._pts.length }
    getPoint(i) { return this._pts[i] }
    clear() { this._pts = [] }
    add(p) { this._pts.push(p) }
}
class UMLSeqMessageView extends Element {
    constructor() {
        super()
        this.points = new Points()
        this.model = null
        this.activation = null
    }
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
    UMLRelationship, UMLDirectedRelationship, UMLDependency, UMLAbstraction,
    UMLRealization, UMLInterfaceRealization, UMLComponentRealization,
    UMLGeneralization, Hyperlink, Tag, UMLSequenceDiagram, UMLClassDiagram,
    Point, UMLSeqMessageView
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

const app = {
    repository: {
        get: function (id) {
            return store.filter(function (e) { return e._id === id })[0] || null
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
        },
        deleteElements: function (elems) {
            elems.forEach(function (e) {
                const i = store.indexOf(e)
                if (i !== -1) store.splice(i, 1)
            })
        }
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

module.exports = { app, type, store, register, nextId }
