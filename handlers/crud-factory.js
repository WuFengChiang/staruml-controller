/**
 * CRUD Factory Engine
 *
 * Generates REST API handlers from a declarative family configuration.
 * Each family config describes:
 *   - prefix: URL prefix (e.g. 'class')
 *   - diagrams.types: array of StarUML diagram types
 *   - resources: array of node-type resources with optional children
 *   - relations: array of edge-type resources
 *
 * For each resource, the factory generates:
 *   GET    /api/{prefix}/{resource}          — list (filterable by diagramId)
 *   POST   /api/{prefix}/{resource}          — create
 *   GET    /api/{prefix}/{resource}/:id      — get one
 *   PUT    /api/{prefix}/{resource}/:id      — update
 *   DELETE /api/{prefix}/{resource}/:id      — delete
 *
 * For child resources:
 *   GET    /api/{prefix}/{parent}/:id/{children}  — list children
 *   POST   /api/{prefix}/{parent}/:id/{children}  — create child
 */

const h = require('./shared-helpers')

// Toolbox type aliases: types that the GUI toolbox maps to a base type + model-init.
// StarUML's toolbox "command-arg" overrides the factory id and sets model-init properties.
// Without this mapping, createModelAndView fails because these alias types have no model class.
const TOOLBOX_TYPE_ALIASES = {
    'C4ContainerDatabase':   { id: 'C4Container', 'model-init': { kind: 'database' } },
    'C4ContainerWebApp':     { id: 'C4Container', 'model-init': { kind: 'client-webapp' } },
    'C4ContainerDesktopApp': { id: 'C4Container', 'model-init': { kind: 'desktop-app' } },
    'C4ContainerMobileApp':  { id: 'C4Container', 'model-init': { kind: 'mobile-app' } }
}

// Auto-created container types that should be cleaned up when empty
const AUTO_CONTAINER_TYPES = [
    'UMLModel', 'UMLStateMachine', 'UMLActivity',
    'UMLInteraction', 'UMLCollaboration',
    'FCFlowchart', 'DFDDataFlowModel',
    'BPMNProcess', 'BPMNCollaboration',
    'C4Model',
    'SysMLRequirement', 'SysMLBlock',
    'WFWireframe',
    'MMMindmap',
    'AWSModel',
    'AzureModel',
    'GCPModel'
]

function isAutoContainer(elem) {
    return elem && AUTO_CONTAINER_TYPES.indexOf(elem.constructor.name) !== -1
}

/**
 * Parse a createFields entry.
 * Supports two formats:
 *   - String:  'guard'  →  { param: 'guard', prop: 'guard' }
 *   - Object:  { param: 'pseudostateKind', prop: 'kind' }  →  as-is
 */
function parseFieldEntry(f) {
    if (typeof f === 'string') return { param: f, prop: f }
    return { param: f.param, prop: f.prop || f.param, values: f.values }
}

/**
 * Check fields declared with a `values` whitelist.
 * Accepts both field-definition shapes: parseFieldEntry's { param, prop, values }
 * and resolveFieldDef's { name, type, prop, values }.
 *
 * Runs before anything is created or written, so a rejected value leaves no
 * half-configured element behind. Returns an error string, or null when clean.
 */
function checkFieldValues(body, defs) {
    for (let i = 0; i < defs.length; i++) {
        const d = defs[i]
        if (!d.values) continue
        const param = d.param !== undefined ? d.param : d.name
        const given = body[param]
        if (given !== undefined && d.values.indexOf(given) === -1) {
            return 'Invalid ' + param + ' "' + given + '". Allowed: ' + d.values.join(', ')
        }
    }
    return null
}

/**
 * Propagate name to the linked UMLInteraction when the model is a UMLAction.
 *
 * In Interaction Overview Diagrams, the view displays the UMLInteraction's name,
 * not the UMLAction's name. The link chain is:
 *   Inline:  UMLAction.target → UMLSequenceDiagram → ._parent → UMLInteraction
 *   Ref:     UMLAction.target → UMLInteractionUse  → .refersTo → UMLInteraction
 */
function propagateNameToChildInteraction(model, name) {
    if (model.constructor.name !== 'UMLAction' || !model.target) return
    const target = model.target
    const targetType = target.constructor.name
    let interaction = null
    if (targetType === 'UMLSequenceDiagram' && target._parent &&
        target._parent.constructor.name === 'UMLInteraction') {
        interaction = target._parent
    } else if (targetType === 'UMLInteractionUse' && target.refersTo &&
        target.refersTo.constructor.name === 'UMLInteraction') {
        interaction = target.refersTo
    }
    if (interaction) {
        app.engine.setProperty(interaction, 'name', name)
    }
}

// ============================================================
// Serialization helpers
// ============================================================

/**
 * Default serializer for a node element.
 */
function defaultSerializeNode(elem) {
    if (!elem) return null
    const result = {
        _id: elem._id,
        _type: elem.constructor.name,
        name: elem.name || ''
    }
    if (elem.stereotype) {
        result.stereotype = elem.stereotype
    }
    if (elem.documentation) {
        result.documentation = elem.documentation
    }
    if (elem._parent) {
        result._parentId = elem._parent._id
    }
    return result
}

/**
 * Default serializer for a relation element.
 */
function defaultSerializeRelation(elem, config) {
    if (!elem) return null
    const result = {
        _id: elem._id,
        _type: elem.constructor.name,
        name: elem.name || ''
    }
    if (elem.stereotype) {
        result.stereotype = elem.stereotype
    }
    if (elem.documentation) {
        result.documentation = elem.documentation
    }
    if (elem._parent) {
        result._parentId = elem._parent._id
    }

    // source/target references
    if (config && config.hasEnds && elem.end1 && elem.end2) {
        result.end1 = serializeEnd(elem.end1, config.endFields)
        result.end2 = serializeEnd(elem.end2, config.endFields)
    } else {
        // Generic source/target via ownedElements or known fields
        if (elem.source) {
            result.sourceId = elem.source._id || null
            result.sourceName = elem.source.name || ''
        }
        if (elem.target) {
            result.targetId = elem.target._id || null
            result.targetName = elem.target.name || ''
        }
    }

    return result
}

function serializeEnd(end, endFields) {
    if (!end) return null
    // The end's own id: PUT /api/elements/:id accepts an association end, but
    // no endpoint used to hand out its id, so callers had to parse the .mdj to
    // find one. `reference` below is a different thing — the classifier this
    // end attaches to.
    const result = { _id: end._id, _type: end.constructor.name }
    if (end.reference) {
        result.reference = end.reference._id
    }
    const fields = endFields || ['name', 'navigable', 'aggregation', 'multiplicity']
    fields.forEach(function (f) {
        if (end[f] !== undefined) {
            result[f] = end[f]
        }
    })
    return result
}

/**
 * Default serializer for a child element.
 */
function defaultSerializeChild(elem) {
    if (!elem) return null
    const result = {
        _id: elem._id,
        _type: elem.constructor.name,
        name: elem.name || ''
    }
    if (elem.documentation) {
        result.documentation = elem.documentation
    }
    if (elem._parent) {
        result._parentId = elem._parent._id
    }
    // Include common child-specific fields if present.
    // `type` holds either a plain string or a Model reference; only the string
    // form used to be reported, so a type set by element id read back as absent.
    if (elem.type !== undefined && elem.type !== null && elem.type !== '') {
        if (typeof elem.type === 'string') {
            result.type = elem.type
            result.typeName = elem.type
        } else if (typeof elem.type === 'object') {
            result.typeId = elem.type._id
            result.typeName = elem.type.name || ''
        }
    }
    // An operation's return type is the parameter whose direction is 'return'.
    if (elem.direction !== undefined) {
        result.direction = elem.direction
    }
    if (elem.defaultValue !== undefined) {
        result.defaultValue = elem.defaultValue
    }
    if (elem.visibility !== undefined) {
        result.visibility = elem.visibility
    }
    if (elem.isStatic !== undefined) {
        result.isStatic = elem.isStatic
    }
    return result
}

// ============================================================
// Handler generators
// ============================================================

/**
 * Build all route handlers for a family config.
 * Returns an array of { method, pattern, handler } objects.
 */
function createFamilyHandlers(config) {
    const routes = []
    const prefix = '/api/' + config.prefix

    // --- Diagram routes ---
    if (config.diagrams) {
        routes.push({
            method: 'GET',
            pattern: prefix + '/diagrams',
            handler: makeListDiagrams(config)
        })
        routes.push({
            method: 'POST',
            pattern: prefix + '/diagrams',
            handler: makeCreateDiagram(config)
        })
        routes.push({
            method: 'GET',
            pattern: prefix + '/diagrams/:id',
            handler: makeGetDiagram(config)
        })
        routes.push({
            method: 'PUT',
            pattern: prefix + '/diagrams/:id',
            handler: makeUpdateDiagram(config)
        })
        routes.push({
            method: 'DELETE',
            pattern: prefix + '/diagrams/:id',
            handler: makeDeleteDiagram(config)
        })
    }

    // --- Resource routes (nodes) ---
    if (config.resources) {
        config.resources.forEach(function (res) {
            routes.push({
                method: 'GET',
                pattern: prefix + '/' + res.name,
                handler: makeListResource(config, res)
            })
            routes.push({
                method: 'POST',
                pattern: prefix + '/' + res.name,
                handler: makeCreateResource(config, res)
            })
            routes.push({
                method: 'GET',
                pattern: prefix + '/' + res.name + '/:id',
                handler: makeGetResource(config, res)
            })
            routes.push({
                method: 'PUT',
                pattern: prefix + '/' + res.name + '/:id',
                handler: makeUpdateResource(config, res)
            })
            routes.push({
                method: 'DELETE',
                pattern: prefix + '/' + res.name + '/:id',
                handler: makeDeleteResource(config, res)
            })

            // Child routes
            if (res.children) {
                res.children.forEach(function (child) {
                    routes.push({
                        method: 'GET',
                        pattern: prefix + '/' + res.name + '/:id/' + child.name,
                        handler: makeListChildren(config, res, child)
                    })
                    routes.push({
                        method: 'POST',
                        pattern: prefix + '/' + res.name + '/:id/' + child.name,
                        handler: makeCreateChild(config, res, child)
                    })
                    if (child.updateFields) {
                        routes.push({
                            method: 'PUT',
                            pattern: prefix + '/' + res.name + '/:id/' + child.name + '/:childId',
                            handler: makeUpdateChild(config, res, child)
                        })
                    }
                })
            }
        })
    }

    // --- Relation routes (edges) ---
    if (config.relations) {
        config.relations.forEach(function (rel) {
            routes.push({
                method: 'GET',
                pattern: prefix + '/' + rel.name,
                handler: makeListRelation(config, rel)
            })
            routes.push({
                method: 'POST',
                pattern: prefix + '/' + rel.name,
                handler: makeCreateRelation(config, rel)
            })
            routes.push({
                method: 'GET',
                pattern: prefix + '/' + rel.name + '/:id',
                handler: makeGetRelation(config, rel)
            })
            routes.push({
                method: 'PUT',
                pattern: prefix + '/' + rel.name + '/:id',
                handler: makeUpdateRelation(config, rel)
            })
            routes.push({
                method: 'DELETE',
                pattern: prefix + '/' + rel.name + '/:id',
                handler: makeDeleteRelation(config, rel)
            })

            // Child routes on relations (e.g., triggers under a transition).
            // makeListChildren/makeCreateChild only read `name` and `types` off the
            // parent config, so a resource-shaped view of the relation reuses them as-is.
            if (rel.children) {
                const relAsResource = { name: rel.name, types: [rel.modelType || rel.type] }
                rel.children.forEach(function (child) {
                    routes.push({
                        method: 'GET',
                        pattern: prefix + '/' + rel.name + '/:id/' + child.name,
                        handler: makeListChildren(config, relAsResource, child)
                    })
                    routes.push({
                        method: 'POST',
                        pattern: prefix + '/' + rel.name + '/:id/' + child.name,
                        handler: makeCreateChild(config, relAsResource, child)
                    })
                    if (child.updateFields) {
                        routes.push({
                            method: 'PUT',
                            pattern: prefix + '/' + rel.name + '/:id/' + child.name + '/:childId',
                            handler: makeUpdateChild(config, relAsResource, child)
                        })
                    }
                })
            }
        })
    }

    return routes
}

// ============================================================
// Diagram handlers
// ============================================================

function makeListDiagrams(config) {
    return function (params, query, body, reqInfo) {
        let diagrams = []
        config.diagrams.types.forEach(function (t) {
            const found = app.repository.select('@' + t)
            diagrams = diagrams.concat(found)
        })
        return {
            success: true,
            message: 'Retrieved ' + diagrams.length + ' diagram(s)',
            request: reqInfo,
            data: diagrams.map(function (d) { return h.serializeGenericDiagramDetail(d) })
        }
    }
}

function makeCreateDiagram(config) {
    const allowedFields = ['name', 'parentId']
    // If multiple diagram types, allow 'type' field
    if (config.diagrams.types.length > 1) {
        allowedFields.push('type')
    }
    return function (params, query, body, reqInfo) {
        const err = h.validate([
            h.checkUnknownFields(body, allowedFields),
            h.checkFieldType(body, 'name', 'string'),
            h.checkFieldType(body, 'parentId', 'string'),
            h.checkFieldType(body, 'type', 'string')
        ])
        if (err) return h.validationError(err, reqInfo, body)

        if (body.name !== undefined) {
            const nameErr = h.checkNonEmptyString(body, 'name')
            if (nameErr) return h.validationError(nameErr, reqInfo, body)
        }

        // Determine diagram type
        let diagramType
        if (config.diagrams.types.length === 1) {
            diagramType = config.diagrams.types[0]
        } else if (body.type) {
            if (config.diagrams.types.indexOf(body.type) === -1) {
                return h.validationError(
                    'Invalid diagram type "' + body.type + '". Allowed: ' + config.diagrams.types.join(', '),
                    reqInfo, body
                )
            }
            diagramType = body.type
        } else {
            diagramType = config.diagrams.types[0]
        }

        let parent
        if (body.parentId) {
            parent = h.findById(body.parentId)
            if (!parent) return h.validationError('Parent not found: ' + body.parentId, reqInfo, body)
        } else {
            parent = app.project.getProject()
            if (!parent) return h.validationError('No project found. Open a project first.', reqInfo, body)
        }

        try {
            const diagram = app.factory.createDiagram({
                id: diagramType,
                parent: parent,
                diagramInitializer: function (d) {
                    if (body.name) {
                        d.name = body.name
                    }
                }
            })
            if (!diagram) {
                return { success: false, error: 'Failed to create diagram. StarUML factory returned null.', request: Object.assign({}, reqInfo, { body: body }) }
            }
            return {
                success: true,
                message: 'Created diagram "' + diagram.name + '" (' + diagramType + ')',
                request: Object.assign({}, reqInfo, { body: body }),
                data: h.serializeGenericDiagramDetail(diagram)
            }
        } catch (e) {
            return { success: false, error: 'Failed to create diagram: ' + (e.message || String(e)), request: Object.assign({}, reqInfo, { body: body }) }
        }
    }
}

function makeGetDiagram(config) {
    return function (params, query, body, reqInfo) {
        const diagram = h.findById(params.id)
        if (!diagram || !diagram.ownedViews) {
            return { success: false, error: 'Diagram not found: ' + params.id, request: reqInfo }
        }
        // Verify it's one of this family's types
        const typeName = diagram.constructor.name
        if (config.diagrams.types.indexOf(typeName) === -1) {
            return { success: false, error: 'Diagram not found: ' + params.id, request: reqInfo }
        }
        return {
            success: true,
            message: 'Retrieved diagram "' + (diagram.name || params.id) + '"',
            request: reqInfo,
            data: h.serializeGenericDiagramDetail(diagram)
        }
    }
}

function makeUpdateDiagram(config) {
    return function (params, query, body, reqInfo) {
        const err = h.validate([
            h.checkUnknownFields(body, ['name']),
            h.checkFieldType(body, 'name', 'string')
        ])
        if (err) return h.validationError(err, reqInfo, body)

        if (Object.keys(body).length === 0) {
            return h.validationError('At least one field must be provided. Allowed fields: name', reqInfo, body)
        }

        if (body.name !== undefined) {
            const nameErr = h.checkNonEmptyString(body, 'name')
            if (nameErr) return h.validationError(nameErr, reqInfo, body)
        }

        const diagram = h.findById(params.id)
        if (!diagram || !diagram.ownedViews) {
            return { success: false, error: 'Diagram not found: ' + params.id, request: Object.assign({}, reqInfo, { body: body }) }
        }

        const report = h.createWriteReport()
        if (body.name !== undefined) {
            h.applyProperty(report, diagram, 'name', body.name)
        }

        return h.attachWriteReport({
            success: true,
            message: h.writeReportMessage('Updated diagram "' + diagram.name + '"', report),
            request: Object.assign({}, reqInfo, { body: body }),
            data: h.serializeGenericDiagramDetail(diagram)
        }, report)
    }
}

function makeDeleteDiagram(config) {
    return function (params, query, body, reqInfo) {
        const diagram = h.findById(params.id)
        if (!diagram || !diagram.ownedViews) {
            return { success: false, error: 'Diagram not found: ' + params.id, request: reqInfo }
        }
        const name = diagram.name
        const parent = diagram._parent
        const viewsToDelete = diagram.ownedViews.slice()
        const modelsToDelete = [diagram]
        const modelIdSet = {}
        modelIdSet[diagram._id] = true

        viewsToDelete.forEach(function (view) {
            if (view.model && view.model._id && !modelIdSet[view.model._id]) {
                const viewsOfModel = app.repository.getViewsOf(view.model) || []
                const viewsOnOtherDiagrams = viewsOfModel.filter(function (v) {
                    return v._parent && v._parent._id !== diagram._id
                })
                if (viewsOnOtherDiagrams.length === 0) {
                    modelIdSet[view.model._id] = true
                    modelsToDelete.push(view.model)
                }
            }
        })

        if (parent && parent._parent && isAutoContainer(parent)) {
            let container = parent
            while (container && container._parent && isAutoContainer(container)) {
                if (!modelIdSet[container._id]) {
                    const otherChildren = (container.ownedElements || []).filter(function (child) {
                        return !modelIdSet[child._id]
                    })
                    if (otherChildren.length === 0) {
                        modelIdSet[container._id] = true
                        modelsToDelete.push(container)
                    } else {
                        break
                    }
                }
                container = container._parent
            }
        }

        app.engine.deleteElements(modelsToDelete, viewsToDelete)

        return {
            success: true,
            message: 'Deleted diagram "' + name + '"',
            request: reqInfo,
            data: { deleted: params.id, name: name }
        }
    }
}

// ============================================================
// Resource (node) handlers
// ============================================================

function makeListResource(config, res) {
    const listTypes = res.modelTypes || res.types
    return function (params, query, body, reqInfo) {
        let elements = []
        const seenIds = {}
        listTypes.forEach(function (t) {
            const found = app.repository.select('@' + t)
            found.forEach(function (e) {
                // select('@Type') matches the whole inheritance chain, so it also hands
                // back subtypes: @UMLComponent returns UMLSubsystem and UMLUseCaseSubject,
                // @UMLClass returns UMLStereotype, @UMLDataType returns UMLEnumeration.
                // makeGetResource/makeUpdateResource/makeDeleteResource already match on
                // constructor.name against this same list, so listing stayed the odd one
                // out. Drop anything whose exact type was not asked for.
                if (listTypes.indexOf(e.constructor.name) === -1) {
                    return
                }
                if (!seenIds[e._id]) {
                    seenIds[e._id] = true
                    elements.push(e)
                }
            })
        })

        // Filter by diagramId if provided
        if (query && query.diagramId) {
            const diagram = h.findById(query.diagramId)
            if (!diagram || !diagram.ownedViews) {
                return { success: false, error: 'Diagram not found: ' + query.diagramId, request: reqInfo }
            }
            const modelIdsOnDiagram = {}
            diagram.ownedViews.forEach(function (v) {
                if (v.model) {
                    modelIdsOnDiagram[v.model._id] = true
                }
            })
            elements = elements.filter(function (e) {
                return modelIdsOnDiagram[e._id]
            })
        }

        const serializer = res.serialize || defaultSerializeNode
        return {
            success: true,
            message: 'Retrieved ' + elements.length + ' ' + res.name,
            request: reqInfo,
            data: elements.map(function (e) { return serializer(e) })
        }
    }
}

function makeCreateResource(config, res) {
    const allowedFields = ['diagramId', 'name', 'stereotype', 'x1', 'y1', 'x2', 'y2', 'tailViewId', 'lineColor', 'fillColor', 'fontColor']
    // If multiple types, allow 'type' field
    if (res.types.length > 1) {
        allowedFields.push('type')
    }
    // Add extra create fields from config
    if (res.createFields) {
        res.createFields.forEach(function (f) {
            const entry = parseFieldEntry(f)
            if (allowedFields.indexOf(entry.param) === -1) allowedFields.push(entry.param)
        })
    }

    return function (params, query, body, reqInfo) {
        const checks = [
            h.checkUnknownFields(body, allowedFields),
            h.checkFieldType(body, 'diagramId', 'string'),
            h.checkFieldType(body, 'name', 'string'),
            h.checkFieldType(body, 'x1', 'number'),
            h.checkFieldType(body, 'y1', 'number'),
            h.checkFieldType(body, 'x2', 'number'),
            h.checkFieldType(body, 'y2', 'number'),
            h.checkFieldType(body, 'type', 'string'),
            h.checkFieldType(body, 'tailViewId', 'string')
        ]
        const err = h.validate(checks)
        if (err) return h.validationError(err, reqInfo, body)

        if (!body.diagramId) {
            return h.validationError('Field "diagramId" is required', reqInfo, body)
        }

        const diagram = h.findById(body.diagramId)
        if (!diagram || !diagram.ownedViews) {
            return { success: false, error: 'Diagram not found: ' + body.diagramId, request: Object.assign({}, reqInfo, { body: body }) }
        }

        // Determine element type
        let elemType
        if (res.types.length === 1) {
            elemType = res.types[0]
        } else if (body.type) {
            if (res.types.indexOf(body.type) === -1) {
                return h.validationError(
                    'Invalid type "' + body.type + '". Allowed: ' + res.types.join(', '),
                    reqInfo, body
                )
            }
            elemType = body.type
        } else {
            elemType = res.types[0]
        }

        let parent = diagram._parent
        if (!parent) {
            return h.validationError('Diagram has no parent model', Object.assign({}, reqInfo, { body: body }))
        }

        // Some factory functions (e.g. SysMLConstraintParameter's parameterFn) expect
        // the diagram itself as parent, not diagram._parent. The factory function
        // internally resolves the actual parent from the diagram.
        if (res.diagramAsParent && res.diagramAsParent.indexOf(elemType) !== -1) {
            parent = diagram
        }

        // Apply toolbox type alias mapping (e.g. C4ContainerDatabase → C4Container + kind)
        const alias = TOOLBOX_TYPE_ALIASES[elemType]
        const factoryId = alias ? alias.id : elemType

        // Validate that the resolved factory type has a registered view type
        if (app.metamodel) {
            const viewTypeName = app.metamodel.getViewTypeOf(factoryId)
            if (!viewTypeName || !type[viewTypeName]) {
                return h.validationError(
                    'Type "' + elemType + '" cannot be created on a diagram (no view type registered). ' +
                    'Allowed: ' + res.types.filter(function (t) {
                        const resolvedType = TOOLBOX_TYPE_ALIASES[t] ? TOOLBOX_TYPE_ALIASES[t].id : t
                        const vt = app.metamodel.getViewTypeOf(resolvedType)
                        return vt && type[vt]
                    }).join(', '),
                    reqInfo, body
                )
            }
        }

        // x2/y2 default to a size measured from x1/y1, not to fixed coordinates.
        // Absolute defaults inverted the rectangle whenever x1/y1 exceeded them:
        // x1=680,y1=420 with no x2/y2 gave (680,420)-(200,180), which StarUML
        // normalises to left=200,top=180 — so every element placed past (200,180)
        // silently stacked in the same spot.
        const x1 = body.x1 !== undefined ? body.x1 : 100
        const y1 = body.y1 !== undefined ? body.y1 : 100
        const x2 = body.x2 !== undefined ? body.x2 : x1 + 100
        const y2 = body.y2 !== undefined ? body.y2 : y1 + 80

        const factoryOpts = {
            id: factoryId,
            parent: parent,
            diagram: diagram,
            x1: x1, y1: y1, x2: x2, y2: y2
        }
        if (alias && alias['model-init']) {
            factoryOpts['model-init'] = alias['model-init']
        }

        // Resolve tailViewId to a view reference (for elements that must be placed inside a container view)
        if (body.tailViewId) {
            const tailView = h.findViewOnDiagramByAnyId(diagram, body.tailViewId)
            if (!tailView) {
                return h.validationError('View not found on diagram: ' + body.tailViewId, reqInfo, body)
            }
            factoryOpts.tailView = tailView
            if (tailView.model) {
                factoryOpts.tailModel = tailView.model
                // Frame views (UMLFrameView, UMLTimingFrameView, etc.) have model pointing
                // to the diagram itself. The parent should be diagram._parent (the owning
                // Interaction/Block/etc.), not the diagram.
                if (tailView.model === diagram && diagram._parent) {
                    factoryOpts.parent = diagram._parent
                } else {
                    factoryOpts.parent = tailView.model
                }
            }
        }

        // Auto-attach to timing frame when creating elements on a UMLTimingDiagram
        // without an explicit tailViewId. The StarUML factory requires lifelines to be
        // placed inside the UMLTimingFrameView.
        if (!body.tailViewId && diagram.constructor.name === 'UMLTimingDiagram') {
            const frameView = diagram.ownedViews.filter(function (v) {
                return v.constructor.name === 'UMLTimingFrameView'
            })[0]
            if (frameView) {
                factoryOpts.tailView = frameView
                factoryOpts.tailModel = frameView.model
                factoryOpts.parent = diagram._parent
            }
        }

        // Some factory functions (e.g. UMLTimeSegment) access options.editor.canvas.
        // Provide the current diagram editor if available.
        const editor = app.diagrams ? app.diagrams.getEditor() : null
        if (editor) {
            factoryOpts.editor = editor
        }

        try {
            const view = app.factory.createModelAndView(factoryOpts)
            const model = view.model || view

            const report = h.createWriteReport()
            const hasModel = model && typeof model._id === 'string'

            if (body.name && hasModel) {
                h.applyProperty(report, model, 'name', body.name)
                // Propagate name to child UMLInteraction (used by Interaction Overview Diagram).
                // StarUML creates UMLAction + child UMLInteraction; the view displays the child's name.
                propagateNameToChildInteraction(model, body.name)
            }

            if (body.stereotype !== undefined && hasModel) {
                h.applyProperty(report, model, 'stereotype', body.stereotype)
            }

            // Apply extra fields via setProperty
            if (res.createFields) {
                res.createFields.forEach(function (f) {
                    const entry = parseFieldEntry(f)
                    if (body[entry.param] !== undefined && entry.param !== 'name' && entry.param !== 'diagramId' && entry.param !== 'type' && entry.param !== 'tailViewId') {
                        if (hasModel) {
                            h.applyProperty(report, model, entry.prop, body[entry.param], entry.param)
                        } else {
                            // These used to be dropped without a word when the
                            // factory returned a view with no model element.
                            h.reportIgnoredWrite(report, entry.param, body[entry.param], undefined,
                                'the created ' + elemType + ' has no model element to store it on')
                        }
                    }
                })
            }

            // Apply style properties to the view (not the model)
            const styleProps = ['lineColor', 'fillColor', 'fontColor']
            styleProps.forEach(function (prop) {
                if (body[prop] !== undefined) {
                    h.applyProperty(report, view, prop, body[prop])
                }
            })

            // Auto-expand frame to contain newly created element
            h.autoExpandFrame(diagram)

            const serializer = res.serialize || defaultSerializeNode
            return h.attachWriteReport({
                success: true,
                message: h.appendWriteWarnings('Created ' + res.name.replace(/-/g, ' ') + ' "' + (model ? model.name || elemType : elemType) + '"', report),
                request: Object.assign({}, reqInfo, { body: body }),
                data: serializer(model)
            }, report)
        } catch (e) {
            return { success: false, error: 'Failed to create element: ' + (e.message || String(e)), request: Object.assign({}, reqInfo, { body: body }) }
        }
    }
}

function makeGetResource(config, res) {
    const checkTypes = res.modelTypes || res.types
    return function (params, query, body, reqInfo) {
        const elem = h.findById(params.id)
        if (!elem) {
            return { success: false, error: res.name.replace(/-/g, ' ') + ' not found: ' + params.id, request: reqInfo }
        }
        // Verify type
        if (checkTypes.indexOf(elem.constructor.name) === -1) {
            return { success: false, error: res.name.replace(/-/g, ' ') + ' not found: ' + params.id, request: reqInfo }
        }
        const serializer = res.serialize || defaultSerializeNode
        return {
            success: true,
            message: 'Retrieved ' + res.name.replace(/-/g, ' ') + ' "' + (elem.name || params.id) + '"',
            request: reqInfo,
            data: serializer(elem)
        }
    }
}

function resolveFieldDef(f) {
    if (typeof f === 'string') return { name: f, type: 'string', prop: f }
    return { name: f.name, type: f.type || 'string', prop: f.prop || f.name, values: f.values }
}

function makeUpdateResource(config, res) {
    const updateFields = res.updateFields || ['name', 'stereotype', 'documentation']
    const fieldDefs = updateFields.map(resolveFieldDef)
    const fieldNames = fieldDefs.map(function (d) { return d.name })
    const checkTypes = res.modelTypes || res.types
    return function (params, query, body, reqInfo) {
        const checks = [h.checkUnknownFields(body, fieldNames)]
        fieldDefs.forEach(function (d) {
            checks.push(h.checkFieldType(body, d.name, d.type))
        })
        const err = h.validate(checks)
        if (err) return h.validationError(err, reqInfo, body)

        if (Object.keys(body).length === 0) {
            return h.validationError('At least one field must be provided. Allowed fields: ' + fieldNames.join(', '), reqInfo, body)
        }

        if (body.name !== undefined) {
            const nameErr = h.checkNonEmptyString(body, 'name')
            if (nameErr) return h.validationError(nameErr, reqInfo, body)
        }

        const elem = h.findById(params.id)
        if (!elem) {
            return { success: false, error: res.name.replace(/-/g, ' ') + ' not found: ' + params.id, request: Object.assign({}, reqInfo, { body: body }) }
        }
        if (checkTypes.indexOf(elem.constructor.name) === -1) {
            return { success: false, error: res.name.replace(/-/g, ' ') + ' not found: ' + params.id, request: Object.assign({}, reqInfo, { body: body }) }
        }

        const report = h.createWriteReport()
        fieldDefs.forEach(function (d) {
            if (body[d.name] !== undefined) {
                h.applyProperty(report, elem, d.prop, body[d.name], d.name)
                // Propagate name to child UMLInteraction (used by Interaction Overview Diagram)
                if (d.prop === 'name') {
                    propagateNameToChildInteraction(elem, body[d.name])
                }
            }
        })

        const serializer = res.serialize || defaultSerializeNode
        return h.attachWriteReport({
            success: true,
            message: h.writeReportMessage('Updated ' + res.name.replace(/-/g, ' ') + ' "' + (elem.name || params.id) + '"', report),
            request: Object.assign({}, reqInfo, { body: body }),
            data: serializer(elem)
        }, report)
    }
}

function makeDeleteResource(config, res) {
    const checkTypes = res.modelTypes || res.types
    return function (params, query, body, reqInfo) {
        const elem = h.findById(params.id)
        if (!elem) {
            return { success: false, error: res.name.replace(/-/g, ' ') + ' not found: ' + params.id, request: reqInfo }
        }
        if (checkTypes.indexOf(elem.constructor.name) === -1) {
            return { success: false, error: res.name.replace(/-/g, ' ') + ' not found: ' + params.id, request: reqInfo }
        }

        const name = elem.name || params.id

        // Find associated views across all diagrams
        const views = []
        const allDiagrams = app.repository.select('@Diagram')
        allDiagrams.forEach(function (d) {
            if (d.ownedViews) {
                d.ownedViews.forEach(function (v) {
                    if (v.model && v.model._id === params.id) {
                        views.push(v)
                    }
                })
            }
        })

        app.engine.deleteElements([elem], views)
        return {
            success: true,
            message: 'Deleted ' + res.name.replace(/-/g, ' ') + ' "' + name + '"',
            request: reqInfo,
            data: { deleted: params.id, name: name }
        }
    }
}

// ============================================================
// Child handlers
// ============================================================

function makeListChildren(config, res, child) {
    return function (params, query, body, reqInfo) {
        const parent = h.findById(params.id)
        if (!parent) {
            return { success: false, error: res.name.replace(/-/g, ' ') + ' not found: ' + params.id, request: reqInfo }
        }
        if (res.types.indexOf(parent.constructor.name) === -1) {
            return { success: false, error: res.name.replace(/-/g, ' ') + ' not found: ' + params.id, request: reqInfo }
        }

        const field = child.field
        const children = parent[field] || []
        const serializer = child.serialize || defaultSerializeChild
        return {
            success: true,
            message: 'Retrieved ' + children.length + ' ' + child.name,
            request: reqInfo,
            data: children.map(function (c) { return serializer(c) })
        }
    }
}

function makeCreateChild(config, res, child) {
    const allowedFields = ['name', 'diagramId']
    if (child.createFields) {
        child.createFields.forEach(function (f) {
            const entry = parseFieldEntry(f)
            if (allowedFields.indexOf(entry.param) === -1) allowedFields.push(entry.param)
        })
    }

    return function (params, query, body, reqInfo) {
        const err = h.validate([
            h.checkUnknownFields(body, allowedFields),
            h.checkFieldType(body, 'name', 'string'),
            h.checkFieldType(body, 'diagramId', 'string')
        ])
        if (err) return h.validationError(err, reqInfo, body)

        if (child.createFields) {
            const valErr = checkFieldValues(body, child.createFields.map(parseFieldEntry))
            if (valErr) return h.validationError(valErr, reqInfo, body)
        }

        const parent = h.findById(params.id)
        if (!parent) {
            return { success: false, error: res.name.replace(/-/g, ' ') + ' not found: ' + params.id, request: Object.assign({}, reqInfo, { body: body }) }
        }
        if (res.types.indexOf(parent.constructor.name) === -1) {
            return { success: false, error: res.name.replace(/-/g, ' ') + ' not found: ' + params.id, request: Object.assign({}, reqInfo, { body: body }) }
        }

        try {
            const options = {
                id: child.type,
                parent: parent,
                field: child.field
            }

            let model = null
            try {
                model = app.factory.createModel(options)
            } catch (_ignored) {
                // Some types (e.g., SysMLOperation, SysMLFlowProperty) are not registered
                // with createModel and throw "ModelType is not a constructor".
                // Fall through to createModelAndView fallback below.
            }

            // Fallback to createModelAndView when createModel returns null or throws
            // (e.g., UMLInputPin, UMLOutputPin, SysMLOperation, SysMLFlowProperty)
            if (!model) {
                let diagram = null
                let parentView = null

                if (body.diagramId) {
                    diagram = h.findById(body.diagramId)
                    if (diagram) {
                        parentView = h.findViewOnDiagram(diagram, parent._id)
                    }
                }

                // Auto-detect: find the first diagram that has a view of the parent
                if (!diagram) {
                    const allDiagrams = app.repository.select('@Diagram')
                    for (let i = 0; i < allDiagrams.length; i++) {
                        const d = allDiagrams[i]
                        const v = h.findViewOnDiagram(d, parent._id)
                        if (v) {
                            diagram = d
                            parentView = v
                            break
                        }
                    }
                }

                if (!diagram) {
                    return {
                        success: false,
                        error: 'Cannot create ' + child.name.replace(/-/g, ' ') + ': no diagram found with a view of the parent element. Specify diagramId or create the parent on a diagram first.',
                        request: Object.assign({}, reqInfo, { body: body })
                    }
                }

                const factoryOpts = {
                    id: child.type,
                    parent: parent,
                    diagram: diagram
                }

                if (parentView) {
                    factoryOpts.containerView = parentView
                    factoryOpts.x1 = parentView.left
                    factoryOpts.y1 = parentView.top
                    factoryOpts.x2 = parentView.left + 20
                    factoryOpts.y2 = parentView.top + 20
                }

                const view = app.factory.createModelAndView(factoryOpts)
                if (!view) {
                    return {
                        success: false,
                        error: 'Cannot create ' + child.name.replace(/-/g, ' ') + ': factory returned null for type "' + child.type + '". This type may not support createModelAndView.',
                        request: Object.assign({}, reqInfo, { body: body })
                    }
                }
                model = view.model || view
            }

            const report = h.createWriteReport()
            if (body.name && model) {
                h.applyProperty(report, model, 'name', body.name)
            }

            // Apply extra fields
            if (child.createFields) {
                child.createFields.forEach(function (f) {
                    const entry = parseFieldEntry(f)
                    if (body[entry.param] !== undefined && entry.param !== 'name') {
                        h.applyProperty(report, model, entry.prop, body[entry.param], entry.param)
                    }
                })
            }

            const serializer = child.serialize || defaultSerializeChild
            return h.attachWriteReport({
                success: true,
                message: h.appendWriteWarnings('Created ' + child.name.replace(/-/g, ' ') + ' "' + (model.name || child.type) + '"', report),
                request: Object.assign({}, reqInfo, { body: body }),
                data: serializer(model)
            }, report)
        } catch (e) {
            return { success: false, error: 'Failed to create ' + child.name.replace(/-/g, ' ') + ': ' + (e.message || String(e)), request: Object.assign({}, reqInfo, { body: body }) }
        }
    }
}

/**
 * Update one child element in place.
 *
 * Only generated when the child config declares `updateFields`. Without this,
 * a child created with a wrong value can only be deleted and rebuilt, and some
 * of those values are invisible on the canvas -- a UMLEvent created without a
 * kind silently becomes 'anyReceive', which means "any event triggers this",
 * while the label still shows only the event name.
 */
function makeUpdateChild(config, res, child) {
    const updateFields = child.updateFields || ['name', 'documentation']
    const fieldDefs = updateFields.map(resolveFieldDef)
    const fieldNames = fieldDefs.map(function (d) { return d.name })

    return function (params, query, body, reqInfo) {
        const checks = [h.checkUnknownFields(body, fieldNames)]
        fieldDefs.forEach(function (d) {
            checks.push(h.checkFieldType(body, d.name, d.type))
        })
        const err = h.validate(checks)
        if (err) return h.validationError(err, reqInfo, body)

        const valErr = checkFieldValues(body, fieldDefs)
        if (valErr) return h.validationError(valErr, reqInfo, body)

        if (Object.keys(body).length === 0) {
            return h.validationError('At least one field must be provided. Allowed fields: ' + fieldNames.join(', '), reqInfo, body)
        }

        const parent = h.findById(params.id)
        if (!parent || res.types.indexOf(parent.constructor.name) === -1) {
            return { success: false, error: res.name.replace(/-/g, ' ') + ' not found: ' + params.id, request: Object.assign({}, reqInfo, { body: body }) }
        }

        const elem = h.findById(params.childId)
        const siblings = parent[child.field] || []
        // The child must actually live under this parent. Without this check a
        // valid id from somewhere else in the model would be edited instead.
        if (!elem || siblings.indexOf(elem) === -1) {
            return { success: false, error: child.name.replace(/-/g, ' ') + ' not found under ' + res.name.replace(/-/g, ' ') + ' ' + params.id + ': ' + params.childId, request: Object.assign({}, reqInfo, { body: body }) }
        }

        const report = h.createWriteReport()
        fieldDefs.forEach(function (d) {
            if (body[d.name] !== undefined) {
                h.applyProperty(report, elem, d.prop, body[d.name], d.name)
            }
        })

        const serializer = child.serialize || defaultSerializeChild
        return h.attachWriteReport({
            success: true,
            message: h.writeReportMessage('Updated ' + child.name.replace(/-/g, ' ') + ' "' + (elem.name || params.childId) + '"', report),
            request: Object.assign({}, reqInfo, { body: body }),
            data: serializer(elem)
        }, report)
    }
}

// ============================================================
// Relation handlers
// ============================================================

function makeListRelation(config, rel) {
    const listType = rel.modelType || rel.type
    return function (params, query, body, reqInfo) {
        // Same inheritance-chain leak as makeListResource: @UMLDependency also returns
        // UMLAbstraction, UMLRealization, UMLInterfaceRealization and
        // UMLComponentRealization, all of which have their own endpoints. Match exactly.
        const elements = app.repository.select('@' + listType).filter(function (e) {
            return e.constructor.name === listType
        })

        let filtered = elements
        // Filter by diagramId if provided
        if (query && query.diagramId) {
            const diagram = h.findById(query.diagramId)
            if (!diagram || !diagram.ownedViews) {
                return { success: false, error: 'Diagram not found: ' + query.diagramId, request: reqInfo }
            }
            const modelIdsOnDiagram = {}
            diagram.ownedViews.forEach(function (v) {
                if (v.model) {
                    modelIdsOnDiagram[v.model._id] = true
                }
            })
            filtered = elements.filter(function (e) {
                return modelIdsOnDiagram[e._id]
            })
        }

        const relSerializer = rel.serialize || function (e) { return defaultSerializeRelation(e, rel) }
        return {
            success: true,
            message: 'Retrieved ' + filtered.length + ' ' + rel.name,
            request: reqInfo,
            data: filtered.map(function (e) { return relSerializer(e) })
        }
    }
}

function makeCreateRelation(config, rel) {
    const allowedFields = ['diagramId', 'sourceId', 'targetId', 'name', 'x1', 'y1', 'x2', 'y2', 'lineColor', 'fillColor', 'fontColor']
    // Add end1/end2 fields if applicable
    if (rel.hasEnds) {
        allowedFields.push('end1')
        allowedFields.push('end2')
    }
    if (rel.createFields) {
        rel.createFields.forEach(function (f) {
            const entry = parseFieldEntry(f)
            if (allowedFields.indexOf(entry.param) === -1) allowedFields.push(entry.param)
        })
    }

    return function (params, query, body, reqInfo) {
        const err = h.validate([
            h.checkUnknownFields(body, allowedFields),
            h.checkFieldType(body, 'diagramId', 'string'),
            h.checkFieldType(body, 'sourceId', 'string'),
            h.checkFieldType(body, 'targetId', 'string'),
            h.checkFieldType(body, 'name', 'string')
        ])
        if (err) return h.validationError(err, reqInfo, body)

        if (rel.createFields) {
            const valErr = checkFieldValues(body, rel.createFields.map(parseFieldEntry))
            if (valErr) return h.validationError(valErr, reqInfo, body)
        }

        if (!body.diagramId) {
            return h.validationError('Field "diagramId" is required', reqInfo, body)
        }
        if (!body.sourceId) {
            return h.validationError('Field "sourceId" is required', reqInfo, body)
        }
        if (!body.targetId && !rel.targetOptional) {
            return h.validationError('Field "targetId" is required', reqInfo, body)
        }

        const diagram = h.findById(body.diagramId)
        if (!diagram || !diagram.ownedViews) {
            return { success: false, error: 'Diagram not found: ' + body.diagramId, request: Object.assign({}, reqInfo, { body: body }) }
        }

        const tailView = h.findViewOnDiagramByAnyId(diagram, body.sourceId)
        if (!tailView) {
            return h.validationError('Source element not found on diagram: ' + body.sourceId, reqInfo, body)
        }

        let headView = null
        if (body.targetId) {
            headView = h.findViewOnDiagramByAnyId(diagram, body.targetId)
            if (!headView) {
                return h.validationError('Target element not found on diagram: ' + body.targetId, reqInfo, body)
            }
        }

        let parent = diagram._parent
        if (!parent) {
            return h.validationError('Diagram has no parent model', Object.assign({}, reqInfo, { body: body }))
        }

        try {
            const options = {
                id: rel.type,
                parent: parent,
                diagram: diagram,
                tailView: tailView,
                headView: headView
            }
            if (tailView.model) options.tailModel = tailView.model
            if (headView && headView.model) options.headModel = headView.model

            // Pass coordinates to factory (required by UMLTimeSegment and similar)
            if (body.x1 !== undefined) options.x1 = body.x1
            if (body.y1 !== undefined) options.y1 = body.y1
            if (body.x2 !== undefined) options.x2 = body.x2
            if (body.y2 !== undefined) options.y2 = body.y2

            // Some factory functions (e.g. UMLTimeSegment) access options.editor.canvas.
            // Provide the current diagram editor if available.
            const editor = app.diagrams ? app.diagrams.getEditor() : null
            if (editor) {
                options.editor = editor
            }

            const view = app.factory.createModelAndView(options)
            const model = view.model || view

            const report = h.createWriteReport()
            const hasModel = model && typeof model._id === 'string'

            if (body.name && hasModel) {
                h.applyProperty(report, model, 'name', body.name)
            }

            // Apply end1/end2 updates
            if (rel.hasEnds && model) {
                ['end1', 'end2'].forEach(function (endName) {
                    if (!body[endName]) {
                        return
                    }
                    if (model[endName]) {
                        applyEndFields(model[endName], body[endName], rel.endFields, report, endName)
                    } else {
                        h.reportIgnoredWrite(report, endName, JSON.stringify(body[endName]), undefined,
                            'the created ' + rel.type + ' has no ' + endName)
                    }
                })
            } else if (model) {
                ['end1', 'end2'].forEach(function (endName) {
                    if (body[endName] !== undefined) {
                        h.reportIgnoredWrite(report, endName, JSON.stringify(body[endName]), undefined,
                            'this relation type has no ends')
                    }
                })
            }

            // Apply extra fields
            if (rel.createFields) {
                rel.createFields.forEach(function (f) {
                    const entry = parseFieldEntry(f)
                    if (body[entry.param] !== undefined && entry.param !== 'name' && entry.param !== 'diagramId' && entry.param !== 'sourceId' && entry.param !== 'targetId' && entry.param !== 'end1' && entry.param !== 'end2') {
                        if (hasModel) {
                            h.applyProperty(report, model, entry.prop, body[entry.param], entry.param)
                        } else {
                            h.reportIgnoredWrite(report, entry.param, body[entry.param], undefined,
                                'the created ' + rel.type + ' has no model element to store it on')
                        }
                    }
                })
            }

            // Apply style properties to the view (not the model)
            const styleProps = ['lineColor', 'fillColor', 'fontColor']
            styleProps.forEach(function (prop) {
                if (body[prop] !== undefined) {
                    h.applyProperty(report, view, prop, body[prop])
                }
            })

            // Auto-expand frame to contain newly created relation
            h.autoExpandFrame(diagram)

            const relSerializer = rel.serialize || function (e) { return defaultSerializeRelation(e, rel) }
            return h.attachWriteReport({
                success: true,
                message: h.appendWriteWarnings('Created ' + rel.name.replace(/-/g, ' ') + ' "' + (model ? model.name || rel.type : rel.type) + '"', report),
                request: Object.assign({}, reqInfo, { body: body }),
                data: relSerializer(model)
            }, report)
        } catch (e) {
            return { success: false, error: 'Failed to create relation: ' + (e.message || String(e)), request: Object.assign({}, reqInfo, { body: body }) }
        }
    }
}

function applyEndFields(end, values, endFields, report, endName) {
    const fields = endFields || ['name', 'navigable', 'aggregation', 'multiplicity']
    fields.forEach(function (f) {
        if (values[f] !== undefined) {
            if (report) {
                h.applyProperty(report, end, f, values[f], (endName || 'end') + '.' + f)
            } else {
                app.engine.setProperty(end, f, values[f])
            }
        }
    })
    // A field the caller sent that this relation's end does not accept would
    // otherwise vanish without a word.
    if (report) {
        Object.keys(values).forEach(function (f) {
            if (fields.indexOf(f) === -1) {
                h.reportIgnoredWrite(report, (endName || 'end') + '.' + f, values[f], undefined,
                    'not a settable field on this relation end; settable: ' + fields.join(', '))
            }
        })
    }
}

function makeGetRelation(config, rel) {
    const checkType = rel.modelType || rel.type
    return function (params, query, body, reqInfo) {
        const elem = h.findById(params.id)
        if (!elem || elem.constructor.name !== checkType) {
            return { success: false, error: rel.name.replace(/-/g, ' ') + ' not found: ' + params.id, request: reqInfo }
        }
        const relSerializer = rel.serialize || function (e) { return defaultSerializeRelation(e, rel) }
        return {
            success: true,
            message: 'Retrieved ' + rel.name.replace(/-/g, ' ') + ' "' + (elem.name || params.id) + '"',
            request: reqInfo,
            data: relSerializer(elem)
        }
    }
}

function makeUpdateRelation(config, rel) {
    const updateFields = rel.updateFields || ['name', 'documentation']
    const fieldDefs = updateFields.map(resolveFieldDef)
    const fieldNames = fieldDefs.map(function (d) { return d.name })
    const checkType = rel.modelType || rel.type
    // Add end1/end2 if applicable
    const allFieldNames = fieldNames.slice()
    if (rel.hasEnds) {
        if (allFieldNames.indexOf('end1') === -1) allFieldNames.push('end1')
        if (allFieldNames.indexOf('end2') === -1) allFieldNames.push('end2')
    }

    return function (params, query, body, reqInfo) {
        const checks = [h.checkUnknownFields(body, allFieldNames)]
        fieldDefs.forEach(function (d) {
            checks.push(h.checkFieldType(body, d.name, d.type))
        })
        const err = h.validate(checks)
        if (err) return h.validationError(err, reqInfo, body)

        const valErr = checkFieldValues(body, fieldDefs)
        if (valErr) return h.validationError(valErr, reqInfo, body)

        if (Object.keys(body).length === 0) {
            return h.validationError('At least one field must be provided. Allowed fields: ' + allFieldNames.join(', '), reqInfo, body)
        }

        const elem = h.findById(params.id)
        if (!elem || elem.constructor.name !== checkType) {
            return { success: false, error: rel.name.replace(/-/g, ' ') + ' not found: ' + params.id, request: Object.assign({}, reqInfo, { body: body }) }
        }

        const report = h.createWriteReport()
        // Write to d.prop, not d.name: a field may expose a different parameter
        // name than the model property it sets. makeUpdateResource already does
        // this; this path used to ignore prop, which silently wrote nothing.
        fieldDefs.forEach(function (d) {
            if (body[d.name] !== undefined && d.name !== 'end1' && d.name !== 'end2') {
                h.applyProperty(report, elem, d.prop, body[d.name], d.name)
            }
        })

        if (rel.hasEnds) {
            ['end1', 'end2'].forEach(function (endName) {
                if (!body[endName]) {
                    return
                }
                if (elem[endName]) {
                    applyEndFields(elem[endName], body[endName], rel.endFields, report, endName)
                } else {
                    h.reportIgnoredWrite(report, endName, JSON.stringify(body[endName]), undefined,
                        'this relation has no ' + endName + ' to write to')
                }
            })
        } else {
            ['end1', 'end2'].forEach(function (endName) {
                if (body[endName] !== undefined) {
                    h.reportIgnoredWrite(report, endName, JSON.stringify(body[endName]), undefined,
                        'this relation type has no ends')
                }
            })
        }

        const relSerializer = rel.serialize || function (e) { return defaultSerializeRelation(e, rel) }
        return h.attachWriteReport({
            success: true,
            message: h.writeReportMessage('Updated ' + rel.name.replace(/-/g, ' ') + ' "' + (elem.name || params.id) + '"', report),
            request: Object.assign({}, reqInfo, { body: body }),
            data: relSerializer(elem)
        }, report)
    }
}

function makeDeleteRelation(config, rel) {
    const checkType = rel.modelType || rel.type
    return function (params, query, body, reqInfo) {
        const elem = h.findById(params.id)
        if (!elem || elem.constructor.name !== checkType) {
            return { success: false, error: rel.name.replace(/-/g, ' ') + ' not found: ' + params.id, request: reqInfo }
        }

        const name = elem.name || params.id

        const views = []
        const allDiagrams = app.repository.select('@Diagram')
        allDiagrams.forEach(function (d) {
            if (d.ownedViews) {
                d.ownedViews.forEach(function (v) {
                    if (v.model && v.model._id === params.id) {
                        views.push(v)
                    }
                })
            }
        })

        app.engine.deleteElements([elem], views)
        return {
            success: true,
            message: 'Deleted ' + rel.name.replace(/-/g, ' ') + ' "' + name + '"',
            request: reqInfo,
            data: { deleted: params.id, name: name }
        }
    }
}

// ============================================================
// Router builder
// ============================================================

/**
 * Build a routing function from a family config.
 * Returns a function(method, path, body, reqInfo) that either returns
 * a response object or null (if the route doesn't match).
 */
function createRouter(config) {
    const routes = createFamilyHandlers(config)
    const compiledRoutes = routes.map(function (r) {
        return {
            method: r.method,
            regex: patternToRegex(r.pattern),
            paramNames: extractParamNames(r.pattern),
            handler: r.handler,
            pattern: r.pattern
        }
    })

    return function routeFamily(method, path, query, body, reqInfo) {
        for (let i = 0; i < compiledRoutes.length; i++) {
            const route = compiledRoutes[i]
            if (route.method !== method) continue
            const match = path.match(route.regex)
            if (match) {
                const params = {}
                for (let j = 0; j < route.paramNames.length; j++) {
                    try {
                        params[route.paramNames[j]] = decodeURIComponent(match[j + 1])
                    } catch (e) {
                        params[route.paramNames[j]] = match[j + 1]
                    }
                }
                return route.handler(params, query, body, reqInfo)
            }
        }
        return null
    }
}

function patternToRegex(pattern) {
    // Escape special regex chars, then replace :param with capture groups
    const escaped = pattern.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
    const withParams = escaped.replace(/:(\w+)/g, '([^/]+)')
    return new RegExp('^' + withParams + '$')
}

function extractParamNames(pattern) {
    const names = []
    const re = /:(\w+)/g
    let m
    while ((m = re.exec(pattern)) !== null) {
        names.push(m[1])
    }
    return names
}

/**
 * Generate endpoint list strings for GET /api/status
 */
function getEndpointList(config) {
    const routes = createFamilyHandlers(config)
    return routes.map(function (r) {
        const methodPad = r.method + ' '.repeat(Math.max(0, 6 - r.method.length))
        return methodPad + ' ' + r.pattern
    })
}

// ============================================================
// Exports
// ============================================================

module.exports = {
    createFamilyHandlers: createFamilyHandlers,
    createRouter: createRouter,
    getEndpointList: getEndpointList,
    // Expose for custom serializers in family configs
    defaultSerializeNode: defaultSerializeNode,
    defaultSerializeRelation: defaultSerializeRelation,
    defaultSerializeChild: defaultSerializeChild,
    serializeEnd: serializeEnd
}
