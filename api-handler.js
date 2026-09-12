/**
 * REST API Handler for StarUML Controller
 *
 * Provides CRUD operations for ERD elements with input validation
 * and detailed request/response logging.
 */

const ddlGenerator = require('./ddl-generator')
const crudFactory = require('./handlers/crud-factory')
const edgeRouting = require('./handlers/edge-routing')
const {
    autoExpandFrame, fitFrameToViews, clearEdgeWaypoints,
    createWriteReport, applyProperty, reportIgnoredWrite,
    writeReportMessage, appendWriteWarnings, attachWriteReport, writeValuesEqual,
    diagramOfView, editorForDiagram, arrangeDiagram, pointsToArray
} = require('./handlers/shared-helpers')

// ============================================================
// Family Configs & Routers
// ============================================================

const familyConfigs = [
    require('./handlers/family-class'),
    require('./handlers/family-usecase'),
    require('./handlers/family-activity'),
    require('./handlers/family-statemachine'),
    require('./handlers/family-component'),
    require('./handlers/family-deployment'),
    require('./handlers/family-object'),
    require('./handlers/family-communication'),
    require('./handlers/family-composite'),
    require('./handlers/family-infoflow'),
    require('./handlers/family-profile'),
    require('./handlers/family-timing'),
    require('./handlers/family-overview'),
    require('./handlers/family-flowchart'),
    require('./handlers/family-dfd'),
    require('./handlers/family-bpmn'),
    require('./handlers/family-c4'),
    require('./handlers/family-sysml'),
    require('./handlers/family-wireframe'),
    require('./handlers/family-mindmap'),
    require('./handlers/family-aws'),
    require('./handlers/family-azure'),
    require('./handlers/family-gcp')
]

const familyRouters = familyConfigs.map(function (config) {
    return crudFactory.createRouter(config)
})

// Collect all family endpoints for /api/status
const familyEndpoints = []
familyConfigs.forEach(function (config) {
    const eps = crudFactory.getEndpointList(config)
    eps.forEach(function (ep) {
        familyEndpoints.push(ep)
    })
})

// ============================================================
// Constants
// ============================================================

// --- Sequence Diagram Constants ---

const VALID_MESSAGE_SORTS = [
    'synchCall', 'asynchCall', 'asynchSignal', 'createMessage', 'deleteMessage', 'reply'
]

const VALID_INTERACTION_OPERATORS = [
    'alt', 'opt', 'par', 'loop', 'critical', 'neg', 'assert', 'strict', 'seq', 'ignore', 'consider', 'break'
]

// --- ERD Constants ---

const ALLOWED_COLUMN_TYPES = [
    'CHAR', 'VARCHAR', 'TEXT', 'CLOB',
    'BOOLEAN',
    'SMALLINT', 'INTEGER', 'INT', 'BIGINT', 'TINYINT',
    'FLOAT', 'DOUBLE', 'REAL', 'DECIMAL', 'NUMERIC',
    'DATE', 'TIME', 'DATETIME', 'TIMESTAMP',
    'BLOB', 'BINARY', 'VARBINARY',
    'UUID', 'JSON', 'JSONB', 'XML',
    'SERIAL', 'BIGSERIAL'
]

const VALID_TAG_KINDS = [0, 1, 2, 3, 4]
const TAG_KIND_LABELS = {
    0: 'string', 1: 'boolean', 2: 'number', 3: 'reference', 4: 'hidden'
}

const SEQUENCE_PREFIX = 'sequence#'
const INDEX_PREFIX = 'index#'
const SEQUENCE_ALLOWED_FIELDS = ['name']
const INDEX_ALLOWED_FIELDS = ['name', 'definition']

// --- Generic Diagram Constants ---

const ALLOWED_DIAGRAM_TYPES = [
    // UML
    'UMLClassDiagram', 'UMLPackageDiagram', 'UMLObjectDiagram',
    'UMLComponentDiagram', 'UMLDeploymentDiagram', 'UMLUseCaseDiagram',
    'UMLStatechartDiagram', 'UMLActivityDiagram', 'UMLCommunicationDiagram',
    'UMLCompositeStructureDiagram', 'UMLProfileDiagram',
    'UMLTimingDiagram', 'UMLInteractionOverviewDiagram', 'UMLInformationFlowDiagram',
    // Flowchart / DFD
    'FCFlowchartDiagram', 'DFDDiagram',
    // BPMN / C4
    'BPMNDiagram', 'C4Diagram',
    // SysML
    'SysMLRequirementDiagram', 'SysMLBlockDefinitionDiagram',
    'SysMLInternalBlockDiagram', 'SysMLParametricDiagram',
    // Wireframe / MindMap
    'WFWireframeDiagram', 'MMMindmapDiagram',
    // Cloud
    'AWSDiagram', 'AzureDiagram', 'GCPDiagram'
]

const ALLOWED_NODE_TYPES = [
    // Class diagram
    'UMLClass', 'UMLInterface', 'UMLSignal', 'UMLDataType', 'UMLPrimitiveType',
    'UMLEnumeration', 'UMLPackage', 'UMLModel', 'UMLSubsystem', 'UMLNaryAssociationNode',
    // Use case diagram
    'UMLActor', 'UMLUseCase', 'UMLUseCaseSubject',
    // Activity diagram
    'UMLAction', 'UMLObjectNode', 'UMLCentralBufferNode', 'UMLDataStoreNode',
    'UMLInitialNode',
    'UMLActivityFinalNode', 'UMLFlowFinalNode', 'UMLForkNode', 'UMLJoinNode',
    'UMLMergeNode', 'UMLDecisionNode', 'UMLActivityPartition', 'UMLExpansionRegion',
    'UMLActivityParameterNode', 'UMLInputPin', 'UMLOutputPin',
    'UMLInputExpansionNode', 'UMLOutputExpansionNode', 'UMLInterruptibleActivityRegion',
    'UMLStructuredActivityNode', 'UMLActivityEdgeConnector',
    // State machine diagram
    'UMLState', 'UMLSubmachineState', 'UMLPseudostate', 'UMLFinalState',
    'UMLConnectionPointReference',
    // Composite structure diagram
    'UMLPort', 'UMLPart', 'UMLCollaboration', 'UMLCollaborationUse', 'UMLAssociationClass',
    // Information flow diagram
    'UMLInformationItem',
    // Profile diagram
    'UMLProfile', 'UMLStereotype', 'UMLMetaClass',
    // Timing diagram
    'UMLTimingState', 'UMLDurationConstraint', 'UMLTimeTick', 'UMLTimeConstraint',
    // Interaction overview diagram
    'UMLInteractionUseInOverview', 'UMLInteractionInOverview',
    // Sequence diagram additional
    'UMLEndpoint', 'UMLGate', 'UMLContinuation',
    // Component diagram
    'UMLComponent', 'UMLArtifact',
    // Deployment diagram
    'UMLNode', 'UMLArtifactInstance', 'UMLComponentInstance', 'UMLNodeInstance',
    // Object diagram
    'UMLObject',
    // Communication diagram
    'UMLLifeline',
    // Flowchart
    'FCProcess', 'FCTerminator', 'FCDecision', 'FCDelay', 'FCPredefinedProcess',
    'FCAlternateProcess', 'FCData', 'FCDocument', 'FCMultiDocument', 'FCPreparation',
    'FCDisplay', 'FCManualInput', 'FCManualOperation', 'FCCard', 'FCPunchedTape',
    'FCConnector', 'FCOffPageConnector', 'FCOr', 'FCSummingJunction', 'FCCollate',
    'FCSort', 'FCMerge', 'FCExtract', 'FCStoredData', 'FCDatabase',
    'FCDirectAccessStorage', 'FCInternalStorage',
    // DFD
    'DFDExternalEntity', 'DFDProcess', 'DFDDataStore',
    // BPMN
    'BPMNParticipant', 'BPMNLane',
    'BPMNCallActivity', 'BPMNTask', 'BPMNSendTask', 'BPMNReceiveTask', 'BPMNServiceTask',
    'BPMNUserTask', 'BPMNManualTask', 'BPMNBusinessRuleTask', 'BPMNScriptTask',
    'BPMNSubProcess', 'BPMNAdHocSubProcess', 'BPMNTransaction',
    'BPMNChoreographyTask', 'BPMNSubChoreography',
    'BPMNStartEvent', 'BPMNIntermediateThrowEvent', 'BPMNIntermediateCatchEvent',
    'BPMNBoundaryEvent', 'BPMNEndEvent',
    'BPMNExclusiveGateway', 'BPMNInclusiveGateway', 'BPMNComplexGateway',
    'BPMNParallelGateway', 'BPMNEventBasedGateway',
    'BPMNDataObject', 'BPMNDataStore', 'BPMNDataInput', 'BPMNDataOutput', 'BPMNMessage',
    'BPMNConversation', 'BPMNSubConversation', 'BPMNCallConversation',
    'BPMNTextAnnotation', 'BPMNGroup',
    // C4
    'C4Person', 'C4SoftwareSystem', 'C4Container', 'C4ContainerDatabase',
    'C4ContainerWebApp', 'C4ContainerDesktopApp', 'C4ContainerMobileApp', 'C4Component', 'C4Element',
    // SysML
    'SysMLStakeholder', 'SysMLView', 'SysMLViewpoint', 'SysMLRequirement',
    'SysMLBlock', 'SysMLValueType', 'SysMLInterfaceBlock', 'SysMLConstraintBlock',
    'SysMLPart', 'SysMLReference', 'SysMLValue', 'SysMLPort', 'SysMLConstraintProperty', 'SysMLConstraintParameter',
    // Wireframe
    'WFFrame', 'WFMobileFrame', 'WFWebFrame', 'WFDesktopFrame',
    'WFButton', 'WFText', 'WFRadio', 'WFCheckbox', 'WFSwitch', 'WFLink',
    'WFTabList', 'WFTab', 'WFInput', 'WFDropdown', 'WFPanel', 'WFImage', 'WFSeparator', 'WFAvatar', 'WFSlider',
    // MindMap
    'MMNode',
    // AWS
    'AWSElement', 'AWSGroup', 'AWSGenericGroup', 'AWSAvailabilityZone',
    'AWSSecurityGroup', 'AWSService', 'AWSResource', 'AWSGeneralResource', 'AWSCallout',
    // Azure
    'AzureElement', 'AzureGroup', 'AzureService', 'AzureCallout',
    // GCP
    'GCPElement', 'GCPUser', 'GCPZone', 'GCPProduct', 'GCPService'
]

const ALLOWED_RELATION_TYPES = [
    // Class diagram
    'UMLAssociation', 'UMLDependency', 'UMLGeneralization', 'UMLInterfaceRealization',
    'UMLTemplateBinding', 'UMLContainment', 'UMLRealization',
    // Use case diagram
    'UMLInclude', 'UMLExtend',
    // Activity diagram
    'UMLControlFlow', 'UMLObjectFlow', 'UMLExceptionHandler', 'UMLActivityInterrupt',
    // State machine diagram
    'UMLTransition',
    // Composite structure / Information flow
    'UMLRoleBinding', 'UMLInformationFlow',
    // Profile
    'UMLExtension',
    // Timing
    'UMLTimeSegment',
    // Component diagram
    'UMLComponentRealization',
    // Deployment diagram
    'UMLDeployment', 'UMLCommunicationPath',
    // Object diagram
    'UMLLink',
    // Communication diagram
    'UMLConnector',
    // Flowchart
    'FCFlow',
    // DFD
    'DFDDataFlow',
    // BPMN
    'BPMNSequenceFlow', 'BPMNMessageFlow', 'BPMNAssociation',
    'BPMNDataAssociation', 'BPMNMessageLink', 'BPMNConversationLink',
    // C4
    'C4Relationship',
    // SysML
    'SysMLConform', 'SysMLExpose', 'SysMLCopy', 'SysMLDeriveReqt',
    'SysMLVerify', 'SysMLSatisfy', 'SysMLRefine', 'SysMLConnector',
    // MindMap
    'MMEdge',
    // AWS
    'AWSArrow',
    // Azure
    'AzureConnector',
    // GCP
    'GCPPath'
]

const ALLOWED_CHILD_TYPES = [
    'UMLAttribute', 'UMLOperation', 'UMLParameter', 'UMLEnumerationLiteral',
    'UMLPort', 'UMLReception', 'UMLExtensionPoint', 'UMLSlot',
    'UMLTemplateParameter', 'UMLRegion', 'UMLConstraint',
    'UMLInteractionOperand',
    // Classifiers and packages, so a model element can be created without also
    // deciding which diagram draws it. POST /api/elements/:id creates a model
    // AND a view, which forces that decision at creation time; these go into
    // the parent's ownedElements with no view at all. Add a view later with
    // POST /api/diagrams/:id/views.
    'UMLClass', 'UMLInterface', 'UMLEnumeration', 'UMLDataType',
    'UMLPrimitiveType', 'UMLSignal', 'UMLActor', 'UMLUseCase',
    'UMLComponent', 'UMLNode', 'UMLArtifact', 'UMLCollaboration',
    'UMLPackage', 'UMLModel', 'UMLSubsystem',
    'SysMLProperty', 'SysMLFlowProperty', 'SysMLPort',
    'UMLInputPin', 'UMLOutputPin',
    // Trigger events on transitions (UMLTransition.triggers) and actions (UMLAction.triggers)
    'UMLEvent',
    // BPMN Event Definitions
    'BPMNCompensateEventDefinition', 'BPMNCancelEventDefinition',
    'BPMNErrorEventDefinition', 'BPMNLinkEventDefinition',
    'BPMNSignalEventDefinition', 'BPMNTimerEventDefinition',
    'BPMNEscalationEventDefinition', 'BPMNMessageEventDefinition',
    'BPMNTerminateEventDefinition', 'BPMNConditionalEventDefinition'
]

// Which collection on the parent each child type is created into.
//
// Every entry here is checked against StarUML's own metamodel (the class
// definitions inside app.asar): the named field must be declared somewhere as
// an `objs`/`refs` collection whose element type the child type descends from.
// Three entries used to fail that check and wrote nowhere:
//
//   UMLConstraint -> 'constraints'  no UML class declares `constraints`; the
//                                   only one in the metamodel is SysMLBlock's,
//                                   and it holds SysMLProperty. A UMLConstraint
//                                   belongs in the generic `ownedElements`.
//   UMLPort       -> 'ports'        same: `ports` is SysMLBlock's and holds
//                                   SysMLPort. UMLPort descends from
//                                   UMLAttribute, so it goes in `attributes`.
//   SysMLOperation                  not a class in the metamodel at all.
//                                   Removed from ALLOWED_CHILD_TYPES.
//
// A wrong field here is silent: Factory.defaultModelFn calls
// engine.addModel(parent, field, model), which does nothing when parent[field]
// is not an array, and then reads the model back out of the repository — where
// it was never registered. The caller gets data: null and an empty model.
// createChildElement now rejects such a field before creating anything.
const CHILD_TYPE_DEFAULT_FIELDS = {
    'UMLAttribute': 'attributes',
    'UMLOperation': 'operations',
    'UMLParameter': 'parameters',
    'UMLEnumerationLiteral': 'literals',
    'UMLPort': 'attributes',
    'UMLReception': 'receptions',
    'UMLExtensionPoint': 'extensionPoints',
    'UMLSlot': 'slots',
    'UMLTemplateParameter': 'templateParameters',
    'UMLRegion': 'regions',
    'UMLConstraint': 'ownedElements',
    'UMLInteractionOperand': 'operands',
    'UMLClass': 'ownedElements',
    'UMLInterface': 'ownedElements',
    'UMLEnumeration': 'ownedElements',
    'UMLDataType': 'ownedElements',
    'UMLPrimitiveType': 'ownedElements',
    'UMLSignal': 'ownedElements',
    'UMLActor': 'ownedElements',
    'UMLUseCase': 'ownedElements',
    'UMLComponent': 'ownedElements',
    'UMLNode': 'ownedElements',
    'UMLArtifact': 'ownedElements',
    'UMLCollaboration': 'ownedElements',
    'UMLPackage': 'ownedElements',
    'UMLModel': 'ownedElements',
    'UMLSubsystem': 'ownedElements',
    'SysMLProperty': 'properties',
    'SysMLPort': 'ports',
    'SysMLFlowProperty': 'flowProperties',
    'UMLInputPin': 'inputs',
    'UMLOutputPin': 'outputs',
    'UMLEvent': 'triggers',
    'BPMNCompensateEventDefinition': 'eventDefinitions',
    'BPMNCancelEventDefinition': 'eventDefinitions',
    'BPMNErrorEventDefinition': 'eventDefinitions',
    'BPMNLinkEventDefinition': 'eventDefinitions',
    'BPMNSignalEventDefinition': 'eventDefinitions',
    'BPMNTimerEventDefinition': 'eventDefinitions',
    'BPMNEscalationEventDefinition': 'eventDefinitions',
    'BPMNMessageEventDefinition': 'eventDefinitions',
    'BPMNTerminateEventDefinition': 'eventDefinitions',
    'BPMNConditionalEventDefinition': 'eventDefinitions'
}

const VALID_PSEUDOSTATE_KINDS = [
    'initial', 'deepHistory', 'shallowHistory', 'join', 'fork',
    'junction', 'choice', 'entryPoint', 'exitPoint'
]

const STYLE_ALLOWED_FIELDS = [
    'fillColor', 'lineColor', 'fontColor', 'fontFace', 'fontSize',
    'fontStyle', 'lineStyle', 'showShadow', 'autoResize', 'stereotypeDisplay',
    'suppressAttributes', 'suppressOperations', 'suppressReceptions',
    'suppressProperties'
]

const GENERIC_DIAGRAM_CREATE_FIELDS = ['type', 'name', 'parentId']
const GENERIC_ELEMENT_CREATE_FIELDS = ['type', 'name', 'x1', 'y1', 'x2', 'y2', 'pseudostateKind', 'attachToViewId']
const GENERIC_RELATION_CREATE_FIELDS = ['type', 'sourceId', 'targetId', 'name']
// Types whose factory functions expect the diagram itself as parent (not diagram._parent).
// These factory functions internally resolve the actual parent from the diagram.
const DIAGRAM_AS_PARENT_TYPES = ['SysMLConstraintParameter']
// `type` here is the element class to create (e.g. 'UMLParameter'). The type a
// structural feature *has* is a separate concept and goes in typeId/typeName.
const GENERIC_CHILD_CREATE_FIELDS = ['type', 'name', 'field', 'typeId', 'typeName', 'direction', 'specification']
// Which classes carry a `direction`, and what each one accepts. Both lists come
// from StarUML's metamodel, and they are NOT the same set: UMLParameter uses
// UMLDirectionKind ("in", "inout", "out", "return") while SysMLFlowProperty uses
// SysMLFlowDirectionKind ("in", "out", "inout"). `return` is meaningless on a
// flow property. One shared list would have to either refuse a legal value or
// admit one the engine rejects, so each class gets its own domain.
// Nothing else in the metamodel declares a model-level `direction`; LabelView
// has one, but it is a transient view integer, not a property this API writes.
const DIRECTION_DOMAINS = {
    // UMLParameter.DK_IN / DK_INOUT / DK_OUT / DK_RETURN. An operation's return
    // type is a parameter with direction 'return'.
    UMLParameter: ['in', 'inout', 'out', 'return'],
    // SysMLFlowProperty.FD_IN / FD_OUT / FD_INOUT, default 'inout'.
    SysMLFlowProperty: ['in', 'out', 'inout']
}
// UMLConstraint and everything the metamodel derives from it. `specification`
// and `constrainedElements` are declared on UMLConstraint, so the subtypes carry
// them too.
const CONSTRAINT_TYPES = ['UMLConstraint', 'UMLIntervalConstraint', 'UMLTimeConstraint', 'UMLDurationConstraint']

function isConstraintType(typeName) {
    return CONSTRAINT_TYPES.indexOf(typeName) !== -1
}

// Every value some class accepts. Used only to reject nonsense early, before the
// element's class is known; checkFeatureFieldsSupported then checks the value
// against the domain of the class actually being written.
const ALL_DIRECTION_VALUES = Object.keys(DIRECTION_DOMAINS).reduce(function (acc, k) {
    DIRECTION_DOMAINS[k].forEach(function (v) {
        if (acc.indexOf(v) === -1) acc.push(v)
    })
    return acc
}, [])
// Every container field POST /api/elements/:id/children can create into, so the
// matching GET can read the same children back without being told where to look.
const CHILD_CONTAINER_FIELDS = (function () {
    const fields = []
    Object.keys(CHILD_TYPE_DEFAULT_FIELDS).forEach(function (t) {
        const f = CHILD_TYPE_DEFAULT_FIELDS[t]
        if (fields.indexOf(f) === -1) {
            fields.push(f)
        }
    })
    return fields
})()
const LAYOUT_ALLOWED_FIELDS = ['direction', 'separations', 'edgeLineStyle']
const IMPORT_ALLOWED_FIELDS = ['path', 'parentId']
const VALID_LAYOUT_DIRECTIONS = ['TB', 'BT', 'LR', 'RL']

// ============================================================
// Validation Helpers
// ============================================================

/**
 * Check for unknown fields in body. Returns error string or null.
 */
function checkUnknownFields(body, allowedFields) {
    const unknown = Object.keys(body).filter(function (k) {
        return allowedFields.indexOf(k) === -1
    })
    if (unknown.length > 0) {
        return 'Unknown field(s): ' + unknown.join(', ') + '. Allowed fields: ' + allowedFields.join(', ')
    }
    return null
}

/**
 * Validate field type. Returns error string or null.
 */
function checkFieldType(body, field, expectedType) {
    if (body[field] === undefined) {
        return null
    }
    const val = body[field]
    if (expectedType === 'string' && typeof val !== 'string') {
        return 'Field "' + field + '" must be a string, got ' + typeof val
    }
    if (expectedType === 'boolean' && typeof val !== 'boolean') {
        return 'Field "' + field + '" must be a boolean, got ' + typeof val
    }
    if (expectedType === 'number' && typeof val !== 'number') {
        return 'Field "' + field + '" must be a number, got ' + typeof val
    }
    if (expectedType === 'object' && (typeof val !== 'object' || val === null || Array.isArray(val))) {
        return 'Field "' + field + '" must be an object'
    }
    if (expectedType === 'string|null' && val !== null && typeof val !== 'string') {
        return 'Field "' + field + '" must be a string or null, got ' + typeof val
    }
    return null
}

/**
 * Validate column type value against ALLOWED_COLUMN_TYPES.
 */
function checkColumnType(value) {
    if (value === undefined) {
        return null
    }
    const upper = String(value).toUpperCase()
    if (ALLOWED_COLUMN_TYPES.indexOf(upper) === -1) {
        return 'Invalid column type "' + value + '". Allowed types: ' + ALLOWED_COLUMN_TYPES.join(', ')
    }
    return null
}

/**
 * Validate tag kind value.
 */
function checkTagKind(value) {
    if (value === undefined) {
        return null
    }
    if (VALID_TAG_KINDS.indexOf(value) === -1) {
        const labels = VALID_TAG_KINDS.map(function (k) { return k + '=' + TAG_KIND_LABELS[k] })
        return 'Invalid tag kind ' + value + '. Allowed values: ' + labels.join(', ')
    }
    return null
}

/**
 * Validate tag value type (string, number, or boolean).
 */
function checkTagValue(value) {
    if (value === undefined) {
        return null
    }
    if (typeof value !== 'string' && typeof value !== 'number' && typeof value !== 'boolean') {
        return 'Field "value" must be a string, number, or boolean, got ' + typeof value
    }
    return null
}

/**
 * Validate non-empty string.
 */
function checkNonEmptyString(body, field) {
    if (body[field] === undefined) {
        return null
    }
    if (typeof body[field] !== 'string' || body[field].trim() === '') {
        return 'Field "' + field + '" must be a non-empty string'
    }
    return null
}

/**
 * Run multiple validations. Returns first error or null.
 */
function validate(checks) {
    for (let i = 0; i < checks.length; i++) {
        if (checks[i]) {
            return checks[i]
        }
    }
    return null
}

/**
 * Build a 400 error response with request context.
 */
function validationError(error, requestInfo, body) {
    const result = { success: false, error: error, request: requestInfo }
    if (body && Object.keys(body).length > 0) {
        result.request = Object.assign({}, requestInfo, { body: body })
    }
    return result
}

// ============================================================
// Serialization
// ============================================================

function serializeElement(elem) {
    if (!elem) {
        return null
    }
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
    if (elem.reference !== undefined) {
        result.referenceId = elem.reference ? elem.reference._id : null
        if (elem.reference && elem.reference.name !== undefined) {
            result.referenceName = elem.reference.name
        }
    }
    // Structural features (UMLAttribute, UMLParameter, UMLPort, ...) keep the
    // type they have in `type`, which holds either a Model reference or a plain
    // string. Report both shapes under the same names the writes take.
    if (elem instanceof type.UMLStructuralFeature && elem.type !== undefined && elem.type !== null && elem.type !== '') {
        if (typeof elem.type === 'object') {
            result.typeId = elem.type._id
            result.typeName = elem.type.name || ''
        } else if (typeof elem.type === 'string') {
            result.typeName = elem.type
        }
        // `type` is the spelling POST .../attributes takes and PUT
        // /api/elements/:id now accepts. Emitting it as well means a caller can
        // read back whichever name it wrote.
        result.type = result.typeName
    }
    // A UMLConstraint's canvas label is its specification, and constrainedElements
    // is the only machine-readable part of it. Report both so a caller can read
    // back what it wrote.
    if (typeof elem.specification === 'string') {
        result.specification = elem.specification
    }
    if (Array.isArray(elem.constrainedElements)) {
        result.constrainedElementIds = elem.constrainedElements.map(function (c) { return c._id })
        result.constrainedElementNames = elem.constrainedElements.map(function (c) { return c.name || '' })
    }
    // An operation's return type is a parameter with direction 'return', so the
    // direction has to be visible for the return type to be findable at all.
    if (elem instanceof type.UMLParameter && typeof elem.direction === 'string' && elem.direction !== '') {
        result.direction = elem.direction
    }
    if (elem.url !== undefined) {
        result.url = elem.url
    }
    return result
}

function serializeEntity(entity) {
    const result = serializeElement(entity)
    if (!result) {
        return null
    }
    result.columns = (entity.columns || []).map(function (col) {
        return serializeColumn(col)
    })
    result.tags = (entity.tags || []).filter(function (tag) {
        return !isSequenceTag(tag) && !isIndexTag(tag)
    }).map(function (tag) {
        return serializeTag(tag)
    })
    if (entity._parent) {
        result._parentId = entity._parent._id
    }
    return result
}

function serializeColumn(col) {
    if (!col) {
        return null
    }
    const result = {
        _id: col._id,
        _type: col.constructor.name,
        name: col.name || '',
        type: col.type || '',
        length: col.length || '',
        primaryKey: col.primaryKey || false,
        foreignKey: col.foreignKey || false,
        nullable: col.nullable || false,
        unique: col.unique || false
    }
    if (col.documentation) {
        result.documentation = col.documentation
    }
    if (col.referenceTo) {
        result.referenceTo = col.referenceTo._id
    }
    if (col._parent) {
        result._parentId = col._parent._id
    }
    result.tags = (col.tags || []).map(function (tag) {
        return serializeTag(tag)
    })
    return result
}

function serializeTag(tag) {
    if (!tag) {
        return null
    }
    const result = {
        _id: tag._id,
        _type: tag.constructor.name,
        name: tag.name || '',
        kind: tag.kind,
        value: tag.value
    }
    if (tag._parent) {
        result._parentId = tag._parent._id
    }
    return result
}

function serializeSequence(tag) {
    if (!tag) {
        return null
    }
    return {
        _id: tag._id,
        _type: 'Sequence',
        name: sequenceNameFromTag(tag),
        value: tag.value,
        _parentId: tag._parent ? tag._parent._id : null
    }
}

function serializeIndex(tag) {
    if (!tag) {
        return null
    }
    return {
        _id: tag._id,
        _type: 'Index',
        name: indexNameFromTag(tag),
        definition: tag.value,
        _parentId: tag._parent ? tag._parent._id : null
    }
}

function serializeRelationship(rel) {
    if (!rel) {
        return null
    }
    const result = {
        _id: rel._id,
        _type: rel.constructor.name,
        name: rel.name || '',
        identifying: rel.identifying || false
    }
    if (rel.end1) {
        result.end1 = {
            name: rel.end1.name || '',
            cardinality: rel.end1.cardinality || '',
            reference: rel.end1.reference ? rel.end1.reference._id : null
        }
    }
    if (rel.end2) {
        result.end2 = {
            name: rel.end2.name || '',
            cardinality: rel.end2.cardinality || '',
            reference: rel.end2.reference ? rel.end2.reference._id : null
        }
    }
    if (rel._parent) {
        result._parentId = rel._parent._id
    }
    return result
}

function serializeDiagram(diagram) {
    if (!diagram) {
        return null
    }
    const result = serializeElement(diagram)
    const entityIds = []
    if (diagram.ownedViews) {
        diagram.ownedViews.forEach(function (view) {
            if (view.model && view.model instanceof type.ERDEntity) {
                entityIds.push(view.model._id)
            }
        })
    }
    result.entityIds = entityIds
    if (diagram._parent) {
        result._parentId = diagram._parent._id
    }
    return result
}

function serializeGenericDiagram(diagram) {
    if (!diagram) {
        return null
    }
    return {
        _id: diagram._id,
        _type: diagram.constructor.name,
        name: diagram.name || '',
        _parentId: diagram._parent ? diagram._parent._id : null
    }
}

function serializeNoteView(view) {
    if (!view) {
        return null
    }
    return {
        _id: view._id,
        _type: view.constructor.name,
        text: view.text || '',
        left: view.left !== undefined ? view.left : 0,
        top: view.top !== undefined ? view.top : 0,
        width: view.width !== undefined ? view.width : 0,
        height: view.height !== undefined ? view.height : 0
    }
}

function serializeNoteLinkView(view) {
    if (!view) {
        return null
    }
    return {
        _id: view._id,
        _type: view.constructor.name,
        noteId: view.tail ? view.tail._id : null,
        targetId: view.head ? view.head._id : null
    }
}

function serializeFreeLineView(view) {
    if (!view) {
        return null
    }
    const result = {
        _id: view._id,
        _type: view.constructor.name
    }
    // Points is a StarUML Points collection: view.points.points is the internal array
    if (view.points) {
        let pts = null
        if (typeof view.points.count === 'function' && view.points.count() >= 2) {
            const p1 = view.points.getPoint(0)
            const p2 = view.points.getPoint(view.points.count() - 1)
            pts = { p1: p1, p2: p2 }
        } else if (view.points.points && view.points.points.length >= 2) {
            pts = { p1: view.points.points[0], p2: view.points.points[view.points.points.length - 1] }
        }
        if (pts) {
            result.x1 = pts.p1.x
            result.y1 = pts.p1.y
            result.x2 = pts.p2.x
            result.y2 = pts.p2.y
        }
    }
    return result
}

function serializeViewInfo(view) {
    if (!view) {
        return null
    }
    const result = {
        _id: view._id,
        _type: view.constructor.name
    }
    if (view.model) {
        result.modelId = view.model._id
    }
    // An edge is drawn from its points, not from left/top, and its line style
    // decides how those points are recomputed on the next arrange. A caller that
    // cannot read either one cannot tell what a write to them actually did.
    if (view.lineStyle !== undefined) {
        result.lineStyle = view.lineStyle
    }
    if (view.points) {
        const pts = pointsToArray(view.points)
        if (pts) {
            result.points = pts
        }
    }
    if (view.left !== undefined) {
        result.left = view.left
    }
    if (view.top !== undefined) {
        result.top = view.top
    }
    if (view.width !== undefined) {
        result.width = view.width
    }
    if (view.height !== undefined) {
        result.height = view.height
    }
    // Parasitic views (edge labels) are positioned by angle and offset, not left/top.
    // Report them so callers can read back what a write actually produced.
    if (view.alpha !== undefined) {
        result.alpha = view.alpha
    }
    if (view.distance !== undefined) {
        result.distance = view.distance
    }
    if (view.edgePosition !== undefined) {
        result.edgePosition = view.edgePosition
    }
    if (view.hostEdge) {
        result.hostEdgeId = view.hostEdge._id
    }
    return result
}

// Write reporting helpers (createWriteReport / applyProperty / reportIgnoredWrite /
// writeReportMessage / attachWriteReport / writeValuesEqual) live in
// handlers/shared-helpers.js so the CRUD factory shares them. See the require at
// the top of this file.

// ============================================================
// Helpers
// ============================================================

function findById(id) {
    return app.repository.get(id) || null
}

function isSequenceTag(tag) {
    return tag && tag.name && tag.name.indexOf(SEQUENCE_PREFIX) === 0
}

function isIndexTag(tag) {
    return tag && tag.name && tag.name.indexOf(INDEX_PREFIX) === 0
}

function sequenceNameFromTag(tag) {
    return tag.name.substring(SEQUENCE_PREFIX.length)
}

function indexNameFromTag(tag) {
    return tag.name.substring(INDEX_PREFIX.length)
}

/**
 * Find columns in other entities that reference the given column via referenceTo.
 */
function findColumnsReferencingColumn(columnId) {
    const allColumns = app.repository.select('@ERDColumn')
    const result = []
    for (let i = 0; i < allColumns.length; i++) {
        const col = allColumns[i]
        if (col.referenceTo && col.referenceTo._id === columnId) {
            result.push({
                columnId: col._id,
                columnName: col.name,
                entityId: col._parent ? col._parent._id : null,
                entityName: col._parent ? col._parent.name : ''
            })
        }
    }
    return result
}

/**
 * Find columns in other entities that reference any column of the given entity via referenceTo.
 */
function findColumnsReferencingEntity(entityId) {
    const entity = findById(entityId)
    if (!entity) {
        return []
    }
    const entityColumnIds = {}
    const entityColumnNames = {}
    const columns = entity.columns || []
    for (let i = 0; i < columns.length; i++) {
        entityColumnIds[columns[i]._id] = true
        entityColumnNames[columns[i]._id] = columns[i].name
    }
    const allColumns = app.repository.select('@ERDColumn')
    const result = []
    for (let j = 0; j < allColumns.length; j++) {
        const col = allColumns[j]
        if (col.referenceTo && entityColumnIds[col.referenceTo._id]) {
            if (col._parent && col._parent._id === entityId) {
                continue
            }
            result.push({
                columnId: col._id,
                columnName: col.name,
                entityId: col._parent ? col._parent._id : null,
                entityName: col._parent ? col._parent.name : '',
                referencedColumnId: col.referenceTo._id,
                referencedColumnName: entityColumnNames[col.referenceTo._id] || ''
            })
        }
    }
    return result
}

/**
 * Find relationships that reference the given entity via end1 or end2.
 */
function findRelationshipsReferencingEntity(entityId) {
    const allRels = app.repository.select('@ERDRelationship')
    const result = []
    for (let i = 0; i < allRels.length; i++) {
        const rel = allRels[i]
        const ends = []
        if (rel.end1 && rel.end1.reference && rel.end1.reference._id === entityId) {
            ends.push('end1')
        }
        if (rel.end2 && rel.end2.reference && rel.end2.reference._id === entityId) {
            ends.push('end2')
        }
        if (ends.length > 0) {
            result.push({
                relationshipId: rel._id,
                relationshipName: rel.name || rel._id,
                ends: ends
            })
        }
    }
    return result
}

// ============================================================
// Route Handlers
// ============================================================

const ENTITY_ALLOWED_FIELDS = ['parentId', 'name', 'documentation', 'diagramId', 'x1', 'y1', 'x2', 'y2']
const ENTITY_UPDATE_FIELDS = ['name', 'documentation']
const COLUMN_ALLOWED_FIELDS = ['name', 'type', 'length', 'primaryKey', 'foreignKey', 'nullable', 'unique', 'documentation', 'referenceToId']
const TAG_ALLOWED_FIELDS = ['name', 'kind', 'value']
const RELATIONSHIP_ALLOWED_FIELDS = ['parentId', 'name', 'identifying', 'end1', 'end2', 'diagramId']
const RELATIONSHIP_UPDATE_FIELDS = ['name', 'identifying', 'end1', 'end2']
const RELATIONSHIP_END_CREATE_FIELDS = ['reference', 'name', 'cardinality']
const RELATIONSHIP_END_FIELDS = ['name', 'cardinality', 'reference']
const DATA_MODEL_ALLOWED_FIELDS = ['name']
const DATA_MODEL_UPDATE_FIELDS = ['name']
const DIAGRAM_ALLOWED_FIELDS = ['parentId', 'name']
const DIAGRAM_UPDATE_FIELDS = ['name']
const PROJECT_SAVE_ALLOWED_FIELDS = ['path']
const PROJECT_OPEN_ALLOWED_FIELDS = ['path']

// --- Generic / Cross-diagram Constants ---
const NOTE_ALLOWED_FIELDS = ['text', 'x1', 'y1', 'x2', 'y2']
const NOTE_UPDATE_FIELDS = ['text']
const NOTE_LINK_ALLOWED_FIELDS = ['noteId', 'targetId']
const FREE_LINE_ALLOWED_FIELDS = ['x1', 'y1', 'x2', 'y2']
// alpha/distance/edgePosition position a parasitic view (edge labels). They are
// rejected for other view types by the guard in updateView.
const VIEW_UPDATE_FIELDS = ['left', 'top', 'width', 'height', 'alpha', 'distance', 'edgePosition', 'keepEdgeWaypoints']
// EdgeParasiticView.EP_HEAD / EP_MIDDLE / EP_TAIL
const VALID_EDGE_POSITIONS = [0, 1, 2]
const EDGE_POSITION_LABELS = { 0: 'EP_HEAD', 1: 'EP_MIDDLE', 2: 'EP_TAIL' }
// EdgeView.LS_RECTILINEAR / LS_OBLIQUE / LS_ROUNDRECT / LS_CURVE / LS_DIRECT.
// The Format menu offers the first four. LS_DIRECT has no menu command, so an
// edge set to it cannot be changed back from StarUML's own user interface —
// it is accepted here because the engine draws it, not because the UI does.
const VALID_LINE_STYLES = [0, 1, 2, 3, 4]
const LINE_STYLE_LABELS = {
    0: 'LS_RECTILINEAR',
    1: 'LS_OBLIQUE',
    2: 'LS_ROUNDRECT',
    3: 'LS_CURVE',
    4: 'LS_DIRECT'
}
const VIEW_POINTS_FIELDS = ['points']
const EDGE_ROUTE_FIELDS = ['margin', 'grid']
// `type` is accepted here as an alias of `typeName`, because POST
// .../attributes has always taken `type` and both write the same property. The
// two endpoints disagreeing on the spelling once produced a verification script
// that read `type` off an updated attribute, got nothing, and reported 24
// correct writes as failures.
//
// Note the collision this alias does NOT create: on POST /api/elements/:id/children,
// `type` names the element CLASS to build (UMLParameter), while `typeName` /
// `typeId` name the type that element HAS (Money). That endpoint keeps both and
// no alias.
const GENERIC_ELEMENT_UPDATE_FIELDS = ['name', 'stereotype', 'documentation', 'referenceId',
    'typeId', 'typeName', 'type', 'direction', 'specification', 'constrainedElementIds']
const EXPORT_ALLOWED_FIELDS = ['path', 'format']
const VALID_EXPORT_FORMATS = ['png', 'jpeg', 'svg', 'pdf']

// --- Shape (view-only) Constants ---
const ALLOWED_SHAPE_TYPES = ['Text', 'TextBox', 'Rect', 'RoundRect', 'Ellipse', 'Hyperlink', 'Image', 'UMLFrame']
const SHAPE_CREATE_FIELDS = ['type', 'text', 'url', 'referenceId', 'imageFile', 'x1', 'y1', 'x2', 'y2']
const SHAPE_UPDATE_FIELDS = ['text', 'url', 'referenceId', 'imageFile']
const SHAPE_VIEW_TYPE_MAP = {
    'UMLTextView': 'Text',
    'UMLTextBoxView': 'TextBox',
    'RectangleView': 'Rect',
    'RoundRectView': 'RoundRect',
    'EllipseView': 'Ellipse',
    'HyperlinkView': 'Hyperlink',
    'ImageView': 'Image',
    'UMLFrameView': 'UMLFrame'
}
const SHAPE_VIEW_TYPES = Object.keys(SHAPE_VIEW_TYPE_MAP)

// --- Diagrams ---

function getDiagrams(reqInfo) {
    const diagrams = app.repository.select('@ERDDiagram')
    return {
        success: true,
        message: 'Retrieved ' + diagrams.length + ' diagram(s)',
        request: reqInfo,
        data: diagrams.map(function (d) { return serializeDiagram(d) })
    }
}

function getDiagram(id, reqInfo) {
    const diagram = findById(id)
    if (!diagram || !(diagram instanceof type.ERDDiagram)) {
        return { success: false, error: 'Diagram not found: ' + id, request: reqInfo }
    }
    return {
        success: true,
        message: 'Retrieved diagram "' + diagram.name + '"',
        request: reqInfo,
        data: serializeDiagram(diagram)
    }
}

function createDiagram(body, reqInfo) {
    const err = validate([
        checkUnknownFields(body, DIAGRAM_ALLOWED_FIELDS),
        checkFieldType(body, 'parentId', 'string'),
        checkFieldType(body, 'name', 'string')
    ])
    if (err) {
        return validationError(err, reqInfo, body)
    }

    if (!body.parentId) {
        return validationError('Field "parentId" is required', reqInfo, body)
    }

    if (body.name !== undefined) {
        const nameErr = checkNonEmptyString(body, 'name')
        if (nameErr) {
            return validationError(nameErr, reqInfo, body)
        }
    }

    const parent = findById(body.parentId)
    if (!parent || !(parent instanceof type.ERDDataModel)) {
        return validationError('parentId must refer to an ERDDataModel. Not found or wrong type: ' + body.parentId, reqInfo, body)
    }

    const diagram = app.factory.createDiagram({
        id: 'ERDDiagram',
        parent: parent,
        diagramInitializer: function (d) {
            d.name = body.name || 'ERDDiagram1'
        }
    })

    return {
        success: true,
        message: 'Created diagram "' + diagram.name + '"',
        request: Object.assign({}, reqInfo, { body: body }),
        data: serializeDiagram(diagram)
    }
}

function updateDiagram(id, body, reqInfo) {
    const err = validate([
        checkUnknownFields(body, DIAGRAM_UPDATE_FIELDS),
        checkFieldType(body, 'name', 'string')
    ])
    if (err) {
        return validationError(err, reqInfo, body)
    }

    if (Object.keys(body).length === 0) {
        return validationError('At least one field must be provided. Allowed fields: ' + DIAGRAM_UPDATE_FIELDS.join(', '), reqInfo, body)
    }

    if (body.name !== undefined) {
        const nameErr = checkNonEmptyString(body, 'name')
        if (nameErr) {
            return validationError(nameErr, reqInfo, body)
        }
    }

    const diagram = findById(id)
    if (!diagram || !(diagram instanceof type.ERDDiagram)) {
        return { success: false, error: 'Diagram not found: ' + id, request: Object.assign({}, reqInfo, { body: body }) }
    }

    const report = createWriteReport()
    if (body.name !== undefined) {
        applyProperty(report, diagram, 'name', body.name)
    }

    return attachWriteReport({
        success: true,
        message: writeReportMessage('Updated diagram "' + diagram.name + '"', report),
        request: Object.assign({}, reqInfo, { body: body }),
        data: serializeDiagram(diagram)
    }, report)
}

function deleteDiagram(id, reqInfo) {
    const diagram = findById(id)
    if (!diagram || !(diagram instanceof type.ERDDiagram)) {
        return { success: false, error: 'Diagram not found: ' + id, request: reqInfo }
    }
    const name = diagram.name
    app.engine.deleteElements([diagram], [])
    return {
        success: true,
        message: 'Deleted diagram "' + name + '"',
        request: reqInfo,
        data: { deleted: id, name: name }
    }
}

// --- Data Models ---

function getDataModels(reqInfo) {
    const models = app.repository.select('@ERDDataModel')
    return {
        success: true,
        message: 'Retrieved ' + models.length + ' data model(s)',
        request: reqInfo,
        data: models.map(function (m) { return serializeElement(m) })
    }
}

function getDataModel(id, reqInfo) {
    const dm = findById(id)
    if (!dm || !(dm instanceof type.ERDDataModel)) {
        return { success: false, error: 'Data model not found: ' + id, request: reqInfo }
    }
    return {
        success: true,
        message: 'Retrieved data model "' + dm.name + '"',
        request: reqInfo,
        data: serializeElement(dm)
    }
}

function createDataModel(body, reqInfo) {
    const err = validate([
        checkUnknownFields(body, DATA_MODEL_ALLOWED_FIELDS),
        checkFieldType(body, 'name', 'string')
    ])
    if (err) {
        return validationError(err, reqInfo, body)
    }

    if (body.name !== undefined) {
        const nameErr = checkNonEmptyString(body, 'name')
        if (nameErr) {
            return validationError(nameErr, reqInfo, body)
        }
    }

    const project = app.repository.select('@Project')[0]
    if (!project) {
        return validationError('No project found. Open a project first.', reqInfo, body)
    }

    const dm = app.factory.createModel({
        id: 'ERDDataModel',
        parent: project,
        modelInitializer: function (m) {
            m.name = body.name || 'ERDDataModel1'
        }
    })

    return {
        success: true,
        message: 'Created data model "' + dm.name + '"',
        request: Object.assign({}, reqInfo, { body: body }),
        data: serializeElement(dm)
    }
}

function updateDataModel(id, body, reqInfo) {
    const err = validate([
        checkUnknownFields(body, DATA_MODEL_UPDATE_FIELDS),
        checkFieldType(body, 'name', 'string')
    ])
    if (err) {
        return validationError(err, reqInfo, body)
    }

    if (Object.keys(body).length === 0) {
        return validationError('At least one field must be provided. Allowed fields: ' + DATA_MODEL_UPDATE_FIELDS.join(', '), reqInfo, body)
    }

    if (body.name !== undefined) {
        const nameErr = checkNonEmptyString(body, 'name')
        if (nameErr) {
            return validationError(nameErr, reqInfo, body)
        }
    }

    const dm = findById(id)
    if (!dm || !(dm instanceof type.ERDDataModel)) {
        return { success: false, error: 'Data model not found: ' + id, request: Object.assign({}, reqInfo, { body: body }) }
    }

    const report = createWriteReport()
    if (body.name !== undefined) {
        applyProperty(report, dm, 'name', body.name)
    }

    return attachWriteReport({
        success: true,
        message: writeReportMessage('Updated data model "' + dm.name + '"', report),
        request: Object.assign({}, reqInfo, { body: body }),
        data: serializeElement(dm)
    }, report)
}

function deleteDataModel(id, reqInfo) {
    const dm = findById(id)
    if (!dm || !(dm instanceof type.ERDDataModel)) {
        return { success: false, error: 'Data model not found: ' + id, request: reqInfo }
    }
    const name = dm.name

    // Safety check: block deletion if entities, relationships, or diagrams exist under this data model
    const entities = app.repository.select('@ERDEntity').filter(function (e) {
        return e._parent && e._parent._id === id
    })
    const relationships = app.repository.select('@ERDRelationship').filter(function (r) {
        // ERDRelationship's _parent is set to an Entity, not the DataModel.
        // Walk up the parent chain to find if this relationship belongs to this data model.
        let p = r._parent
        while (p) {
            if (p._id === id) {
                return true
            }
            p = p._parent
        }
        return false
    })
    const diagrams = app.repository.select('@ERDDiagram').filter(function (d) {
        return d._parent && d._parent._id === id
    })

    if (entities.length > 0 || relationships.length > 0 || diagrams.length > 0) {
        return validationError(
            'Cannot delete data model "' + name + '": ' + entities.length + ' entity(ies), ' + relationships.length + ' relationship(s), and ' + diagrams.length + ' diagram(s) exist under it. Delete them first.',
            reqInfo
        )
    }

    app.engine.deleteElements([dm], [])
    return {
        success: true,
        message: 'Deleted data model "' + name + '"',
        request: reqInfo,
        data: { deleted: id, name: name }
    }
}

// --- Entities ---

function getEntities(query, reqInfo) {
    const allowedParams = ['dataModelId', 'diagramId']
    const unknownParams = Object.keys(query).filter(function (k) {
        return allowedParams.indexOf(k) === -1
    })
    if (unknownParams.length > 0) {
        return validationError('Unknown query parameter(s): ' + unknownParams.join(', ') + '. Allowed: ' + allowedParams.join(', '), reqInfo)
    }

    let entities = app.repository.select('@ERDEntity')

    if (query.dataModelId) {
        const dm = findById(query.dataModelId)
        if (!dm || !(dm instanceof type.ERDDataModel)) {
            return { success: false, error: 'Data model not found: ' + query.dataModelId, request: reqInfo }
        }
        entities = entities.filter(function (e) {
            return e._parent && e._parent._id === query.dataModelId
        })
    }
    if (query.diagramId) {
        const diagram = findById(query.diagramId)
        if (!diagram || !(diagram instanceof type.ERDDiagram)) {
            return { success: false, error: 'Diagram not found: ' + query.diagramId, request: reqInfo }
        }
        const entityIdSet = {}
        const views = diagram.ownedViews || []
        views.forEach(function (view) {
            if (view.model && view.model instanceof type.ERDEntity) {
                entityIdSet[view.model._id] = true
            }
        })
        entities = entities.filter(function (e) {
            return entityIdSet[e._id]
        })
    }

    return {
        success: true,
        message: 'Retrieved ' + entities.length + ' entity(ies)',
        request: reqInfo,
        data: entities.map(function (e) { return serializeEntity(e) })
    }
}

function getEntity(id, reqInfo) {
    const entity = findById(id)
    if (!entity || !(entity instanceof type.ERDEntity)) {
        return { success: false, error: 'Entity not found: ' + id, request: reqInfo }
    }
    return {
        success: true,
        message: 'Retrieved entity "' + entity.name + '"',
        request: reqInfo,
        data: serializeEntity(entity)
    }
}

function createEntity(body, reqInfo) {
    const err = validate([
        checkUnknownFields(body, ENTITY_ALLOWED_FIELDS),
        checkFieldType(body, 'parentId', 'string'),
        checkFieldType(body, 'name', 'string'),
        checkFieldType(body, 'documentation', 'string'),
        checkFieldType(body, 'diagramId', 'string'),
        checkFieldType(body, 'x1', 'number'),
        checkFieldType(body, 'y1', 'number'),
        checkFieldType(body, 'x2', 'number'),
        checkFieldType(body, 'y2', 'number')
    ])
    if (err) {
        return validationError(err, reqInfo, body)
    }

    if (!body.parentId) {
        return validationError('Field "parentId" is required', reqInfo, body)
    }

    if (body.name !== undefined) {
        const nameErr = checkNonEmptyString(body, 'name')
        if (nameErr) {
            return validationError(nameErr, reqInfo, body)
        }
    }

    const parent = findById(body.parentId)
    if (!parent || !(parent instanceof type.ERDDataModel)) {
        return validationError('parentId must refer to an ERDDataModel. Not found or wrong type: ' + body.parentId, reqInfo, body)
    }

    const options = {
        id: 'ERDEntity',
        parent: parent,
        modelInitializer: function (elem) {
            elem.name = body.name || 'NewEntity'
            if (body.documentation !== undefined) {
                elem.documentation = body.documentation
            }
        }
    }

    if (body.diagramId) {
        const diagram = findById(body.diagramId)
        if (!diagram || !(diagram instanceof type.ERDDiagram)) {
            return validationError('diagramId must refer to an ERDDiagram. Not found or wrong type: ' + body.diagramId, reqInfo, body)
        }
        options.diagram = diagram
        // x2/y2 default to a size measured from x1/y1. See createDiagramElement.
        options.x1 = body.x1 !== undefined ? body.x1 : 100
        options.y1 = body.y1 !== undefined ? body.y1 : 100
        options.x2 = body.x2 !== undefined ? body.x2 : options.x1 + 200
        options.y2 = body.y2 !== undefined ? body.y2 : options.y1 + 100
        const view = app.factory.createModelAndView(options)
        autoExpandFrame(diagram)
        return {
            success: true,
            message: 'Created entity "' + view.model.name + '" with view on diagram "' + diagram.name + '"',
            request: Object.assign({}, reqInfo, { body: body }),
            data: serializeEntity(view.model)
        }
    }

    const entity = app.factory.createModel(options)
    return {
        success: true,
        message: 'Created entity "' + entity.name + '"',
        request: Object.assign({}, reqInfo, { body: body }),
        data: serializeEntity(entity)
    }
}

function updateEntity(id, body, reqInfo) {
    const err = validate([
        checkUnknownFields(body, ENTITY_UPDATE_FIELDS),
        checkFieldType(body, 'name', 'string'),
        checkFieldType(body, 'documentation', 'string')
    ])
    if (err) {
        return validationError(err, reqInfo, body)
    }

    if (Object.keys(body).length === 0) {
        return validationError('At least one field must be provided. Allowed fields: ' + ENTITY_UPDATE_FIELDS.join(', '), reqInfo, body)
    }

    if (body.name !== undefined) {
        const nameErr = checkNonEmptyString(body, 'name')
        if (nameErr) {
            return validationError(nameErr, reqInfo, body)
        }
    }

    const entity = findById(id)
    if (!entity || !(entity instanceof type.ERDEntity)) {
        return { success: false, error: 'Entity not found: ' + id, request: Object.assign({}, reqInfo, { body: body }) }
    }

    const report = createWriteReport()
    if (body.name !== undefined) {
        applyProperty(report, entity, 'name', body.name)
    }
    if (body.documentation !== undefined) {
        applyProperty(report, entity, 'documentation', body.documentation)
    }

    return attachWriteReport({
        success: true,
        message: writeReportMessage('Updated entity "' + entity.name + '"', report),
        request: Object.assign({}, reqInfo, { body: body }),
        data: serializeEntity(entity)
    }, report)
}

function deleteEntity(id, reqInfo) {
    const entity = findById(id)
    if (!entity || !(entity instanceof type.ERDEntity)) {
        return { success: false, error: 'Entity not found: ' + id, request: reqInfo }
    }
    const name = entity.name

    // Check referential integrity: columns in other entities referencing this entity's columns
    const referencingCols = findColumnsReferencingEntity(id)
    if (referencingCols.length > 0) {
        const colDetails = referencingCols.map(function (ref) {
            return ref.entityName + '.' + ref.columnName + ' (column ' + ref.columnId + ') references ' + name + '.' + ref.referencedColumnName + ' (column ' + ref.referencedColumnId + ')'
        })
        return validationError(
            'Cannot delete entity "' + name + '": ' + referencingCols.length + ' column(s) in other entities reference columns of this entity. ' + colDetails.join(', '),
            reqInfo
        )
    }

    // Check referential integrity: relationships referencing this entity
    const referencingRels = findRelationshipsReferencingEntity(id)
    if (referencingRels.length > 0) {
        const relDetails = referencingRels.map(function (ref) {
            return ref.relationshipName + ' (relationship ' + ref.relationshipId + ') references via ' + ref.ends.join(', ')
        })
        return validationError(
            'Cannot delete entity "' + name + '": ' + referencingRels.length + ' relationship(s) reference this entity. ' + relDetails.join(', '),
            reqInfo
        )
    }

    app.engine.deleteElements([entity], [])
    return {
        success: true,
        message: 'Deleted entity "' + name + '"',
        request: reqInfo,
        data: { deleted: id, name: name }
    }
}

// --- Columns ---

function getColumns(entityId, reqInfo) {
    const entity = findById(entityId)
    if (!entity || !(entity instanceof type.ERDEntity)) {
        return { success: false, error: 'Entity not found: ' + entityId, request: reqInfo }
    }
    const cols = entity.columns || []
    return {
        success: true,
        message: 'Retrieved ' + cols.length + ' column(s) from entity "' + entity.name + '"',
        request: reqInfo,
        data: cols.map(function (c) { return serializeColumn(c) })
    }
}

function createColumn(entityId, body, reqInfo) {
    const err = validate([
        checkUnknownFields(body, COLUMN_ALLOWED_FIELDS),
        checkFieldType(body, 'name', 'string'),
        checkFieldType(body, 'type', 'string'),
        checkFieldType(body, 'length', 'string'),
        checkFieldType(body, 'primaryKey', 'boolean'),
        checkFieldType(body, 'foreignKey', 'boolean'),
        checkFieldType(body, 'nullable', 'boolean'),
        checkFieldType(body, 'unique', 'boolean'),
        checkFieldType(body, 'documentation', 'string'),
        checkFieldType(body, 'referenceToId', 'string'),
        checkColumnType(body.type)
    ])
    if (err) {
        return validationError(err, reqInfo, body)
    }

    if (body.name !== undefined) {
        const nameErr = checkNonEmptyString(body, 'name')
        if (nameErr) {
            return validationError(nameErr, reqInfo, body)
        }
    }

    const entity = findById(entityId)
    if (!entity || !(entity instanceof type.ERDEntity)) {
        return { success: false, error: 'Entity not found: ' + entityId, request: Object.assign({}, reqInfo, { body: body }) }
    }

    if (body.referenceToId) {
        const refCol = findById(body.referenceToId)
        if (!refCol || !(refCol instanceof type.ERDColumn)) {
            return validationError('referenceToId must refer to an ERDColumn. Not found or wrong type: ' + body.referenceToId, reqInfo, body)
        }
    }

    const col = app.factory.createModel({
        id: 'ERDColumn',
        parent: entity,
        field: 'columns',
        modelInitializer: function (c) {
            c.name = body.name || 'new_column'
            if (body.type !== undefined) {
                c.type = body.type.toUpperCase()
            }
            if (body.length !== undefined) {
                c.length = body.length
            }
            if (body.primaryKey !== undefined) {
                c.primaryKey = body.primaryKey
            }
            if (body.foreignKey !== undefined) {
                c.foreignKey = body.foreignKey
            }
            if (body.nullable !== undefined) {
                c.nullable = body.nullable
            }
            if (body.unique !== undefined) {
                c.unique = body.unique
            }
            if (body.documentation !== undefined) {
                c.documentation = body.documentation
            }
            if (body.referenceToId) {
                const ref = findById(body.referenceToId)
                if (ref) {
                    c.referenceTo = ref
                }
            }
        }
    })

    return {
        success: true,
        message: 'Created column "' + col.name + '" in entity "' + entity.name + '"',
        request: Object.assign({}, reqInfo, { body: body }),
        data: serializeColumn(col)
    }
}

function getColumn(id, reqInfo) {
    const col = findById(id)
    if (!col || !(col instanceof type.ERDColumn)) {
        return { success: false, error: 'Column not found: ' + id, request: reqInfo }
    }
    return {
        success: true,
        message: 'Retrieved column "' + col.name + '"',
        request: reqInfo,
        data: serializeColumn(col)
    }
}

function updateColumn(id, body, reqInfo) {
    const err = validate([
        checkUnknownFields(body, COLUMN_ALLOWED_FIELDS),
        checkFieldType(body, 'name', 'string'),
        checkFieldType(body, 'type', 'string'),
        checkFieldType(body, 'length', 'string'),
        checkFieldType(body, 'primaryKey', 'boolean'),
        checkFieldType(body, 'foreignKey', 'boolean'),
        checkFieldType(body, 'nullable', 'boolean'),
        checkFieldType(body, 'unique', 'boolean'),
        checkFieldType(body, 'documentation', 'string'),
        checkFieldType(body, 'referenceToId', 'string|null'),
        checkColumnType(body.type)
    ])
    if (err) {
        return validationError(err, reqInfo, body)
    }

    if (Object.keys(body).length === 0) {
        return validationError('At least one field must be provided. Allowed fields: ' + COLUMN_ALLOWED_FIELDS.join(', '), reqInfo, body)
    }

    if (body.name !== undefined) {
        const nameErr = checkNonEmptyString(body, 'name')
        if (nameErr) {
            return validationError(nameErr, reqInfo, body)
        }
    }

    const col = findById(id)
    if (!col || !(col instanceof type.ERDColumn)) {
        return { success: false, error: 'Column not found: ' + id, request: Object.assign({}, reqInfo, { body: body }) }
    }

    if (body.referenceToId !== undefined && body.referenceToId !== null) {
        if (body.referenceToId === id) {
            return validationError('A column cannot reference itself via referenceToId', reqInfo, body)
        }
        const refCol = findById(body.referenceToId)
        if (!refCol || !(refCol instanceof type.ERDColumn)) {
            return validationError('referenceToId must refer to an ERDColumn. Not found or wrong type: ' + body.referenceToId, reqInfo, body)
        }
    }

    const report = createWriteReport()
    const simpleProps = ['name', 'length', 'primaryKey', 'foreignKey', 'nullable', 'unique', 'documentation']
    simpleProps.forEach(function (prop) {
        if (body[prop] !== undefined) {
            applyProperty(report, col, prop, body[prop])
        }
    })
    if (body.type !== undefined) {
        applyProperty(report, col, 'type', body.type.toUpperCase(), 'type')
    }
    if (body.referenceToId !== undefined) {
        if (body.referenceToId === null) {
            applyProperty(report, col, 'referenceTo', null, 'referenceTo')
        } else {
            const ref = findById(body.referenceToId)
            if (ref) {
                applyProperty(report, col, 'referenceTo', ref, 'referenceTo')
            } else {
                // Used to report referenceTo as updated even though nothing was set.
                reportIgnoredWrite(report, 'referenceTo', body.referenceToId,
                    col.referenceTo ? col.referenceTo._id : null,
                    'referenceToId does not match any element')
            }
        }
    }

    return attachWriteReport({
        success: true,
        message: writeReportMessage('Updated column "' + col.name + '"', report),
        request: Object.assign({}, reqInfo, { body: body }),
        data: serializeColumn(col)
    }, report)
}

function deleteColumn(id, reqInfo) {
    const col = findById(id)
    if (!col || !(col instanceof type.ERDColumn)) {
        return { success: false, error: 'Column not found: ' + id, request: reqInfo }
    }
    const name = col.name

    // Check referential integrity: other columns referencing this column via referenceTo
    const referencingCols = findColumnsReferencingColumn(id)
    if (referencingCols.length > 0) {
        const colDetails = referencingCols.map(function (ref) {
            return ref.entityName + '.' + ref.columnName + ' (column ' + ref.columnId + ')'
        })
        return validationError(
            'Cannot delete column "' + name + '": ' + referencingCols.length + ' column(s) reference this column via referenceTo. ' + colDetails.join(', '),
            reqInfo
        )
    }

    app.engine.deleteElements([col], [])
    return {
        success: true,
        message: 'Deleted column "' + name + '"',
        request: reqInfo,
        data: { deleted: id, name: name }
    }
}

// --- Tags ---

function getTags(elementId, reqInfo) {
    const elem = findById(elementId)
    if (!elem) {
        return { success: false, error: 'Element not found: ' + elementId, request: reqInfo }
    }
    const tags = elem.tags || []
    return {
        success: true,
        message: 'Retrieved ' + tags.length + ' tag(s) from "' + (elem.name || elementId) + '"',
        request: reqInfo,
        data: tags.map(function (t) { return serializeTag(t) })
    }
}

function createTag(elementId, body, reqInfo) {
    const err = validate([
        checkUnknownFields(body, TAG_ALLOWED_FIELDS),
        checkFieldType(body, 'name', 'string'),
        checkFieldType(body, 'kind', 'number'),
        checkTagKind(body.kind),
        checkTagValue(body.value)
    ])
    if (err) {
        return validationError(err, reqInfo, body)
    }

    if (body.name !== undefined) {
        const nameErr = checkNonEmptyString(body, 'name')
        if (nameErr) {
            return validationError(nameErr, reqInfo, body)
        }
    }

    const elem = findById(elementId)
    if (!elem) {
        return { success: false, error: 'Element not found: ' + elementId, request: Object.assign({}, reqInfo, { body: body }) }
    }

    const tag = app.factory.createModel({
        id: 'Tag',
        parent: elem,
        field: 'tags',
        modelInitializer: function (t) {
            t.name = body.name || 'new_tag'
            if (body.kind !== undefined) {
                t.kind = body.kind
            }
            if (body.value !== undefined) {
                t.value = body.value
            }
        }
    })

    return {
        success: true,
        message: 'Created tag "' + tag.name + '" on "' + (elem.name || elementId) + '"',
        request: Object.assign({}, reqInfo, { body: body }),
        data: serializeTag(tag)
    }
}

function getTag(id, reqInfo) {
    const tag = findById(id)
    if (!tag || !(tag instanceof type.Tag)) {
        return { success: false, error: 'Tag not found: ' + id, request: reqInfo }
    }
    return {
        success: true,
        message: 'Retrieved tag "' + tag.name + '"',
        request: reqInfo,
        data: serializeTag(tag)
    }
}

function updateTag(id, body, reqInfo) {
    const err = validate([
        checkUnknownFields(body, TAG_ALLOWED_FIELDS),
        checkFieldType(body, 'name', 'string'),
        checkFieldType(body, 'kind', 'number'),
        checkTagKind(body.kind),
        checkTagValue(body.value)
    ])
    if (err) {
        return validationError(err, reqInfo, body)
    }

    if (Object.keys(body).length === 0) {
        return validationError('At least one field must be provided. Allowed fields: ' + TAG_ALLOWED_FIELDS.join(', '), reqInfo, body)
    }

    if (body.name !== undefined) {
        const nameErr = checkNonEmptyString(body, 'name')
        if (nameErr) {
            return validationError(nameErr, reqInfo, body)
        }
    }

    const tag = findById(id)
    if (!tag || !(tag instanceof type.Tag)) {
        return { success: false, error: 'Tag not found: ' + id, request: Object.assign({}, reqInfo, { body: body }) }
    }

    const report = createWriteReport()
    if (body.name !== undefined) {
        applyProperty(report, tag, 'name', body.name)
    }
    if (body.kind !== undefined) {
        applyProperty(report, tag, 'kind', body.kind)
    }
    if (body.value !== undefined) {
        applyProperty(report, tag, 'value', body.value)
    }

    return attachWriteReport({
        success: true,
        message: writeReportMessage('Updated tag "' + tag.name + '"', report),
        request: Object.assign({}, reqInfo, { body: body }),
        data: serializeTag(tag)
    }, report)
}

function deleteTag(id, reqInfo) {
    const tag = findById(id)
    if (!tag || !(tag instanceof type.Tag)) {
        return { success: false, error: 'Tag not found: ' + id, request: reqInfo }
    }
    const name = tag.name
    app.engine.deleteElements([tag], [])
    return {
        success: true,
        message: 'Deleted tag "' + name + '"',
        request: reqInfo,
        data: { deleted: id, name: name }
    }
}

// --- Sequences ---

function getSequences(entityId, reqInfo) {
    const entity = findById(entityId)
    if (!entity || !(entity instanceof type.ERDEntity)) {
        return { success: false, error: 'Entity not found: ' + entityId, request: reqInfo }
    }
    const tags = entity.tags || []
    const sequences = tags.filter(isSequenceTag)
    return {
        success: true,
        message: 'Retrieved ' + sequences.length + ' sequence(s) from entity "' + entity.name + '"',
        request: reqInfo,
        data: sequences.map(function (t) { return serializeSequence(t) })
    }
}

function createSequence(entityId, body, reqInfo) {
    const err = validate([
        checkUnknownFields(body, SEQUENCE_ALLOWED_FIELDS),
        checkFieldType(body, 'name', 'string'),
        checkNonEmptyString(body, 'name')
    ])
    if (err) {
        return validationError(err, reqInfo, body)
    }

    if (!body.name) {
        return validationError('Field "name" is required', reqInfo, body)
    }

    const entity = findById(entityId)
    if (!entity || !(entity instanceof type.ERDEntity)) {
        return { success: false, error: 'Entity not found: ' + entityId, request: Object.assign({}, reqInfo, { body: body }) }
    }

    // Check for duplicate sequence name on same entity
    const existing = (entity.tags || []).filter(isSequenceTag)
    for (let i = 0; i < existing.length; i++) {
        if (sequenceNameFromTag(existing[i]) === body.name) {
            return validationError('Sequence "' + body.name + '" already exists on entity "' + entity.name + '"', reqInfo, body)
        }
    }

    const tagName = SEQUENCE_PREFIX + body.name
    const tagValue = 'CREATE SEQUENCE ' + body.name

    const tag = app.factory.createModel({
        id: 'Tag',
        parent: entity,
        field: 'tags',
        modelInitializer: function (t) {
            t.name = tagName
            t.kind = 0
            t.value = tagValue
        }
    })

    return {
        success: true,
        message: 'Created sequence "' + body.name + '" on entity "' + entity.name + '"',
        request: Object.assign({}, reqInfo, { body: body }),
        data: serializeSequence(tag)
    }
}

function getSequence(id, reqInfo) {
    const tag = findById(id)
    if (!tag || !(tag instanceof type.Tag) || !isSequenceTag(tag)) {
        return { success: false, error: 'Sequence not found: ' + id, request: reqInfo }
    }
    return {
        success: true,
        message: 'Retrieved sequence "' + sequenceNameFromTag(tag) + '"',
        request: reqInfo,
        data: serializeSequence(tag)
    }
}

function updateSequence(id, body, reqInfo) {
    const err = validate([
        checkUnknownFields(body, SEQUENCE_ALLOWED_FIELDS),
        checkFieldType(body, 'name', 'string'),
        checkNonEmptyString(body, 'name')
    ])
    if (err) {
        return validationError(err, reqInfo, body)
    }

    if (Object.keys(body).length === 0) {
        return validationError('At least one field must be provided. Allowed fields: ' + SEQUENCE_ALLOWED_FIELDS.join(', '), reqInfo, body)
    }

    const tag = findById(id)
    if (!tag || !(tag instanceof type.Tag) || !isSequenceTag(tag)) {
        return { success: false, error: 'Sequence not found: ' + id, request: Object.assign({}, reqInfo, { body: body }) }
    }

    const report = createWriteReport()
    if (body.name !== undefined) {
        // Check for duplicate on same entity
        const parent = tag._parent
        if (parent) {
            const existing = (parent.tags || []).filter(isSequenceTag)
            for (let i = 0; i < existing.length; i++) {
                if (existing[i]._id !== id && sequenceNameFromTag(existing[i]) === body.name) {
                    return validationError('Sequence "' + body.name + '" already exists on entity "' + parent.name + '"', reqInfo, body)
                }
            }
        }

        const newTagName = SEQUENCE_PREFIX + body.name
        const newTagValue = 'CREATE SEQUENCE ' + body.name
        applyProperty(report, tag, 'name', newTagName, 'name')
        applyProperty(report, tag, 'value', newTagValue, 'value')
    }

    return attachWriteReport({
        success: true,
        message: writeReportMessage('Updated sequence "' + sequenceNameFromTag(tag) + '"', report),
        request: Object.assign({}, reqInfo, { body: body }),
        data: serializeSequence(tag)
    }, report)
}

function deleteSequence(id, reqInfo) {
    const tag = findById(id)
    if (!tag || !(tag instanceof type.Tag) || !isSequenceTag(tag)) {
        return { success: false, error: 'Sequence not found: ' + id, request: reqInfo }
    }
    const name = sequenceNameFromTag(tag)
    app.engine.deleteElements([tag], [])
    return {
        success: true,
        message: 'Deleted sequence "' + name + '"',
        request: reqInfo,
        data: { deleted: id, name: name }
    }
}

// --- Indexes ---

function getIndexes(entityId, reqInfo) {
    const entity = findById(entityId)
    if (!entity || !(entity instanceof type.ERDEntity)) {
        return { success: false, error: 'Entity not found: ' + entityId, request: reqInfo }
    }
    const tags = entity.tags || []
    const indexes = tags.filter(isIndexTag)
    return {
        success: true,
        message: 'Retrieved ' + indexes.length + ' index(es) from entity "' + entity.name + '"',
        request: reqInfo,
        data: indexes.map(function (t) { return serializeIndex(t) })
    }
}

function createIndex(entityId, body, reqInfo) {
    const err = validate([
        checkUnknownFields(body, INDEX_ALLOWED_FIELDS),
        checkFieldType(body, 'name', 'string'),
        checkFieldType(body, 'definition', 'string'),
        checkNonEmptyString(body, 'name'),
        checkNonEmptyString(body, 'definition')
    ])
    if (err) {
        return validationError(err, reqInfo, body)
    }

    if (!body.name) {
        return validationError('Field "name" is required', reqInfo, body)
    }
    if (!body.definition) {
        return validationError('Field "definition" is required', reqInfo, body)
    }

    const entity = findById(entityId)
    if (!entity || !(entity instanceof type.ERDEntity)) {
        return { success: false, error: 'Entity not found: ' + entityId, request: Object.assign({}, reqInfo, { body: body }) }
    }

    // Check for duplicate index name on same entity
    const existing = (entity.tags || []).filter(isIndexTag)
    for (let i = 0; i < existing.length; i++) {
        if (indexNameFromTag(existing[i]) === body.name) {
            return validationError('Index "' + body.name + '" already exists on entity "' + entity.name + '"', reqInfo, body)
        }
    }

    const tagName = INDEX_PREFIX + body.name

    const tag = app.factory.createModel({
        id: 'Tag',
        parent: entity,
        field: 'tags',
        modelInitializer: function (t) {
            t.name = tagName
            t.kind = 0
            t.value = body.definition
        }
    })

    return {
        success: true,
        message: 'Created index "' + body.name + '" on entity "' + entity.name + '"',
        request: Object.assign({}, reqInfo, { body: body }),
        data: serializeIndex(tag)
    }
}

function getIndex(id, reqInfo) {
    const tag = findById(id)
    if (!tag || !(tag instanceof type.Tag) || !isIndexTag(tag)) {
        return { success: false, error: 'Index not found: ' + id, request: reqInfo }
    }
    return {
        success: true,
        message: 'Retrieved index "' + indexNameFromTag(tag) + '"',
        request: reqInfo,
        data: serializeIndex(tag)
    }
}

function updateIndex(id, body, reqInfo) {
    const err = validate([
        checkUnknownFields(body, INDEX_ALLOWED_FIELDS),
        checkFieldType(body, 'name', 'string'),
        checkFieldType(body, 'definition', 'string'),
        checkNonEmptyString(body, 'name'),
        checkNonEmptyString(body, 'definition')
    ])
    if (err) {
        return validationError(err, reqInfo, body)
    }

    if (Object.keys(body).length === 0) {
        return validationError('At least one field must be provided. Allowed fields: ' + INDEX_ALLOWED_FIELDS.join(', '), reqInfo, body)
    }

    const tag = findById(id)
    if (!tag || !(tag instanceof type.Tag) || !isIndexTag(tag)) {
        return { success: false, error: 'Index not found: ' + id, request: Object.assign({}, reqInfo, { body: body }) }
    }

    const report = createWriteReport()

    if (body.name !== undefined) {
        // Check for duplicate on same entity
        const parent = tag._parent
        if (parent) {
            const existing = (parent.tags || []).filter(isIndexTag)
            for (let i = 0; i < existing.length; i++) {
                if (existing[i]._id !== id && indexNameFromTag(existing[i]) === body.name) {
                    return validationError('Index "' + body.name + '" already exists on entity "' + parent.name + '"', reqInfo, body)
                }
            }
        }
        applyProperty(report, tag, 'name', INDEX_PREFIX + body.name)
    }

    if (body.definition !== undefined) {
        applyProperty(report, tag, 'value', body.definition, 'definition')
    }

    return attachWriteReport({
        success: true,
        message: writeReportMessage('Updated index "' + indexNameFromTag(tag) + '"', report),
        request: Object.assign({}, reqInfo, { body: body }),
        data: serializeIndex(tag)
    }, report)
}

function deleteIndex(id, reqInfo) {
    const tag = findById(id)
    if (!tag || !(tag instanceof type.Tag) || !isIndexTag(tag)) {
        return { success: false, error: 'Index not found: ' + id, request: reqInfo }
    }
    const name = indexNameFromTag(tag)
    app.engine.deleteElements([tag], [])
    return {
        success: true,
        message: 'Deleted index "' + name + '"',
        request: reqInfo,
        data: { deleted: id, name: name }
    }
}

// --- Relationships ---

function getRelationships(query, reqInfo) {
    const allowedParams = ['dataModelId']
    const unknownParams = Object.keys(query).filter(function (k) {
        return allowedParams.indexOf(k) === -1
    })
    if (unknownParams.length > 0) {
        return validationError('Unknown query parameter(s): ' + unknownParams.join(', ') + '. Allowed: ' + allowedParams.join(', '), reqInfo)
    }

    let rels = app.repository.select('@ERDRelationship')

    if (query.dataModelId) {
        const dm = findById(query.dataModelId)
        if (!dm || !(dm instanceof type.ERDDataModel)) {
            return { success: false, error: 'Data model not found: ' + query.dataModelId, request: reqInfo }
        }
        rels = rels.filter(function (r) {
            let current = r._parent
            while (current) {
                if (current._id === query.dataModelId) {
                    return true
                }
                current = current._parent
            }
            return false
        })
    }

    return {
        success: true,
        message: 'Retrieved ' + rels.length + ' relationship(s)',
        request: reqInfo,
        data: rels.map(function (r) { return serializeRelationship(r) })
    }
}

function createRelationship(body, reqInfo) {
    const err = validate([
        checkUnknownFields(body, RELATIONSHIP_ALLOWED_FIELDS),
        checkFieldType(body, 'parentId', 'string'),
        checkFieldType(body, 'name', 'string'),
        checkFieldType(body, 'identifying', 'boolean'),
        checkFieldType(body, 'end1', 'object'),
        checkFieldType(body, 'end2', 'object'),
        checkFieldType(body, 'diagramId', 'string')
    ])
    if (err) {
        return validationError(err, reqInfo, body)
    }

    if (!body.parentId) {
        return validationError('Field "parentId" is required', reqInfo, body)
    }
    if (!body.end1 || !body.end1.reference) {
        return validationError('Field "end1.reference" is required', reqInfo, body)
    }
    if (!body.end2 || !body.end2.reference) {
        return validationError('Field "end2.reference" is required', reqInfo, body)
    }

    // Validate end1/end2 sub-fields
    const end1Err = validate([
        checkUnknownFields(body.end1, RELATIONSHIP_END_CREATE_FIELDS),
        checkFieldType(body.end1, 'reference', 'string'),
        checkFieldType(body.end1, 'name', 'string'),
        checkFieldType(body.end1, 'cardinality', 'string')
    ])
    if (end1Err) {
        return validationError('end1: ' + end1Err, reqInfo, body)
    }
    const end2Err = validate([
        checkUnknownFields(body.end2, RELATIONSHIP_END_CREATE_FIELDS),
        checkFieldType(body.end2, 'reference', 'string'),
        checkFieldType(body.end2, 'name', 'string'),
        checkFieldType(body.end2, 'cardinality', 'string')
    ])
    if (end2Err) {
        return validationError('end2: ' + end2Err, reqInfo, body)
    }

    if (body.name !== undefined) {
        const nameErr = checkNonEmptyString(body, 'name')
        if (nameErr) {
            return validationError(nameErr, reqInfo, body)
        }
    }

    const parent = findById(body.parentId)
    if (!parent || !(parent instanceof type.ERDDataModel)) {
        return validationError('parentId must refer to an ERDDataModel. Not found or wrong type: ' + body.parentId, reqInfo, body)
    }

    const entity1 = findById(body.end1.reference)
    if (!entity1 || !(entity1 instanceof type.ERDEntity)) {
        return validationError('end1.reference must refer to an ERDEntity. Not found or wrong type: ' + body.end1.reference, reqInfo, body)
    }

    const entity2 = findById(body.end2.reference)
    if (!entity2 || !(entity2 instanceof type.ERDEntity)) {
        return validationError('end2.reference must refer to an ERDEntity. Not found or wrong type: ' + body.end2.reference, reqInfo, body)
    }

    // diagramId is required for relationship creation (StarUML requires diagram context)
    if (!body.diagramId) {
        return validationError('Field "diagramId" is required for relationship creation', reqInfo, body)
    }

    const diagram = findById(body.diagramId)
    if (!diagram || !(diagram instanceof type.ERDDiagram)) {
        return validationError('diagramId must refer to an ERDDiagram. Not found or wrong type: ' + body.diagramId, reqInfo, body)
    }

    // Find entity views on the diagram
    const tailView = findViewOnDiagram(diagram, entity1._id)
    const headView = findViewOnDiagram(diagram, entity2._id)

    if (!tailView) {
        return validationError('end1 entity "' + entity1.name + '" does not have a view on diagram "' + diagram.name + '". Add the entity to the diagram first.', reqInfo, body)
    }
    if (!headView) {
        return validationError('end2 entity "' + entity2.name + '" does not have a view on diagram "' + diagram.name + '". Add the entity to the diagram first.', reqInfo, body)
    }

    const options = {
        id: 'ERDRelationship',
        parent: parent,
        diagram: diagram,
        tailModel: entity1,
        headModel: entity2,
        tailView: tailView,
        headView: headView,
        modelInitializer: function (rel) {
            rel.name = body.name || ''
            if (body.identifying !== undefined) {
                rel.identifying = body.identifying
            }
        }
    }

    const view = app.factory.createModelAndView(options)
    if (!view || !view.model) {
        return { success: false, error: 'Failed to create relationship. StarUML factory returned null.', request: Object.assign({}, reqInfo, { body: body }) }
    }
    const rel = view.model

    const report = createWriteReport()

    // Set end1 properties
    if (rel.end1) {
        applyProperty(report, rel.end1, 'reference', entity1, 'end1.reference')
        applyProperty(report, rel.end1, 'cardinality', body.end1.cardinality || '1', 'end1.cardinality')
        if (body.end1.name !== undefined) {
            applyProperty(report, rel.end1, 'name', body.end1.name, 'end1.name')
        }
    } else {
        reportIgnoredWrite(report, 'end1', JSON.stringify(body.end1), undefined, 'the created relationship has no end1')
    }

    // Set end2 properties
    if (rel.end2) {
        applyProperty(report, rel.end2, 'reference', entity2, 'end2.reference')
        applyProperty(report, rel.end2, 'cardinality', body.end2.cardinality || '0..*', 'end2.cardinality')
        if (body.end2.name !== undefined) {
            applyProperty(report, rel.end2, 'name', body.end2.name, 'end2.name')
        }
    } else {
        reportIgnoredWrite(report, 'end2', JSON.stringify(body.end2), undefined, 'the created relationship has no end2')
    }

    autoExpandFrame(diagram)
    return attachWriteReport({
        success: true,
        message: appendWriteWarnings('Created relationship "' + (rel.name || rel._id) + '" with view on diagram "' + diagram.name + '"', report),
        request: Object.assign({}, reqInfo, { body: body }),
        data: serializeRelationship(rel)
    }, report)
}

function getRelationship(id, reqInfo) {
    const rel = findById(id)
    if (!rel || !(rel instanceof type.ERDRelationship)) {
        return { success: false, error: 'Relationship not found: ' + id, request: reqInfo }
    }
    return {
        success: true,
        message: 'Retrieved relationship "' + (rel.name || rel._id) + '"',
        request: reqInfo,
        data: serializeRelationship(rel)
    }
}

function updateRelationship(id, body, reqInfo) {
    const err = validate([
        checkUnknownFields(body, RELATIONSHIP_UPDATE_FIELDS),
        checkFieldType(body, 'name', 'string'),
        checkFieldType(body, 'identifying', 'boolean'),
        checkFieldType(body, 'end1', 'object'),
        checkFieldType(body, 'end2', 'object')
    ])
    if (err) {
        return validationError(err, reqInfo, body)
    }

    if (Object.keys(body).length === 0) {
        return validationError('At least one field must be provided. Allowed fields: ' + RELATIONSHIP_UPDATE_FIELDS.join(', '), reqInfo, body)
    }

    // Validate end1/end2 sub-fields
    if (body.end1) {
        const end1Err = validate([
            checkUnknownFields(body.end1, RELATIONSHIP_END_FIELDS),
            checkFieldType(body.end1, 'name', 'string'),
            checkFieldType(body.end1, 'cardinality', 'string'),
            checkFieldType(body.end1, 'reference', 'string')
        ])
        if (end1Err) {
            return validationError('end1: ' + end1Err, reqInfo, body)
        }
    }
    if (body.end2) {
        const end2Err = validate([
            checkUnknownFields(body.end2, RELATIONSHIP_END_FIELDS),
            checkFieldType(body.end2, 'name', 'string'),
            checkFieldType(body.end2, 'cardinality', 'string'),
            checkFieldType(body.end2, 'reference', 'string')
        ])
        if (end2Err) {
            return validationError('end2: ' + end2Err, reqInfo, body)
        }
    }

    // Reject empty end objects
    if (body.end1 && Object.keys(body.end1).length === 0) {
        return validationError('end1: At least one sub-field must be provided. Allowed fields: ' + RELATIONSHIP_END_FIELDS.join(', '), reqInfo, body)
    }
    if (body.end2 && Object.keys(body.end2).length === 0) {
        return validationError('end2: At least one sub-field must be provided. Allowed fields: ' + RELATIONSHIP_END_FIELDS.join(', '), reqInfo, body)
    }

    // Validate reference entities if provided
    if (body.end1 && body.end1.reference !== undefined) {
        const refEntity1 = findById(body.end1.reference)
        if (!refEntity1 || !(refEntity1 instanceof type.ERDEntity)) {
            return validationError('end1.reference must refer to an ERDEntity. Not found or wrong type: ' + body.end1.reference, reqInfo, body)
        }
    }
    if (body.end2 && body.end2.reference !== undefined) {
        const refEntity2 = findById(body.end2.reference)
        if (!refEntity2 || !(refEntity2 instanceof type.ERDEntity)) {
            return validationError('end2.reference must refer to an ERDEntity. Not found or wrong type: ' + body.end2.reference, reqInfo, body)
        }
    }

    const rel = findById(id)
    if (!rel || !(rel instanceof type.ERDRelationship)) {
        return { success: false, error: 'Relationship not found: ' + id, request: Object.assign({}, reqInfo, { body: body }) }
    }

    const report = createWriteReport()
    if (body.name !== undefined) {
        applyProperty(report, rel, 'name', body.name)
    }
    if (body.identifying !== undefined) {
        applyProperty(report, rel, 'identifying', body.identifying)
    }
    if (body.end1 && rel.end1) {
        if (body.end1.name !== undefined) {
            applyProperty(report, rel.end1, 'name', body.end1.name, 'end1.name')
        }
        if (body.end1.cardinality !== undefined) {
            applyProperty(report, rel.end1, 'cardinality', body.end1.cardinality, 'end1.cardinality')
        }
        if (body.end1.reference !== undefined) {
            const entity1 = findById(body.end1.reference)
            applyProperty(report, rel.end1, 'reference', entity1, 'end1.reference')
        }
    }
    if (body.end2 && rel.end2) {
        if (body.end2.name !== undefined) {
            applyProperty(report, rel.end2, 'name', body.end2.name, 'end2.name')
        }
        if (body.end2.cardinality !== undefined) {
            applyProperty(report, rel.end2, 'cardinality', body.end2.cardinality, 'end2.cardinality')
        }
        if (body.end2.reference !== undefined) {
            const entity2 = findById(body.end2.reference)
            applyProperty(report, rel.end2, 'reference', entity2, 'end2.reference')
        }
    }

    return attachWriteReport({
        success: true,
        message: writeReportMessage('Updated relationship "' + (rel.name || rel._id) + '"', report),
        request: Object.assign({}, reqInfo, { body: body }),
        data: serializeRelationship(rel)
    }, report)
}

function deleteRelationship(id, reqInfo) {
    const rel = findById(id)
    if (!rel || !(rel instanceof type.ERDRelationship)) {
        return { success: false, error: 'Relationship not found: ' + id, request: reqInfo }
    }
    const name = rel.name || rel._id
    app.engine.deleteElements([rel], [])
    return {
        success: true,
        message: 'Deleted relationship "' + name + '"',
        request: reqInfo,
        data: { deleted: id, name: name }
    }
}

// --- Project ---

function saveProject(body, reqInfo) {
    const err = validate([
        checkUnknownFields(body, PROJECT_SAVE_ALLOWED_FIELDS),
        checkFieldType(body, 'path', 'string')
    ])
    if (err) {
        return validationError(err, reqInfo, body)
    }

    if (!body.path) {
        return validationError('Field "path" is required', reqInfo, body)
    }

    const nameErr = checkNonEmptyString(body, 'path')
    if (nameErr) {
        return validationError(nameErr, reqInfo, body)
    }

    // Validate absolute path (Unix: starts with /, Windows: starts with drive letter)
    if (body.path.charAt(0) !== '/' && !/^[a-zA-Z]:[/\\]/.test(body.path)) {
        return validationError('Field "path" must be an absolute path (e.g. "/Users/.../project.mdj")', reqInfo, body)
    }

    // Validate .mdj extension
    if (!/\.mdj$/i.test(body.path)) {
        return validationError('Field "path" must have .mdj extension (e.g. "/Users/.../project.mdj")', reqInfo, body)
    }

    const reqInfoWithBody = Object.assign({}, reqInfo, { body: body })

    try {
        const result = app.project.save(body.path)

        // Handle async (Promise) return
        if (result && typeof result.then === 'function') {
            return result.then(function () {
                return {
                    success: true,
                    message: 'Project saved to "' + body.path + '"',
                    request: reqInfoWithBody,
                    data: { path: body.path }
                }
            }).catch(function (e) {
                return {
                    success: false,
                    error: 'Failed to save project: ' + (e.message || String(e)),
                    request: reqInfoWithBody
                }
            })
        }

        // Synchronous return
        return {
            success: true,
            message: 'Project saved to "' + body.path + '"',
            request: reqInfoWithBody,
            data: { path: body.path }
        }
    } catch (e) {
        return {
            success: false,
            error: 'Failed to save project: ' + (e.message || String(e)),
            request: reqInfoWithBody
        }
    }
}

/**
 * Read the modified flag, or null when this StarUML build does not expose it.
 *
 * Repository.isModified() is public API in the StarUML source, but reporting a
 * flag we did not actually read would be worse than reporting nothing, so the
 * caller gets null and skips the assertion instead of getting a made-up false.
 */
function readModifiedFlag() {
    if (app.repository && typeof app.repository.isModified === 'function') {
        return app.repository.isModified()
    }
    return null
}

/**
 * Do two paths name the same file, even through symlinks?
 *
 * A plain resolve() comparison misses a symlink that points at the project
 * file, and that is the one case the snapshot guard exists to catch. The
 * snapshot target usually does not exist yet, so realpath is tried on the file
 * first and falls back to the directory it would be created in.
 */
function isSamePath(a, b) {
    const fs = require('fs')
    const nodePath = require('path')
    const real = function (p) {
        try {
            return fs.realpathSync(p)
        } catch (e) {
            try {
                return nodePath.join(fs.realpathSync(nodePath.dirname(p)), nodePath.basename(p))
            } catch (e2) {
                return nodePath.resolve(p)
            }
        }
    }
    return real(a) === real(b)
}

const PROJECT_SNAPSHOT_ALLOWED_FIELDS = ['path']

/**
 * Write the in-memory model to a file without touching project state.
 *
 * app.project.save() does four things: serialise the model, write the file,
 * reassign this.filename, and clear the modified flag. Only the first two
 * belong in a snapshot. The last two are what make save() behave as "save as":
 * after it runs, every later save writes to the new path, and the original file
 * silently stops receiving changes. So this handler calls
 * repository.writeObject() itself and writes the bytes itself, and never goes
 * through app.project.save().
 *
 * Why writeObject() is safe to call directly: it builds a Writer, calls
 * elem.save(writer) and returns JSON.stringify(writer.current). It assigns
 * nothing and emits nothing.
 *
 * Sources (first-hand, read out of /Applications/StarUML.app app.asar):
 *   src/engine/project-manager.js  save() lines 126-145, getFilename() line 60
 *   src/core/repository.js         writeObject() line 1583, isModified() line 2066
 *
 * Every failure path returns success: false. A snapshot that reports success
 * must mean the bytes are on disk and the project state is untouched, because a
 * caller uses this endpoint to decide whether it is safe to save.
 */
function snapshotProject(body, reqInfo) {
    const err = validate([
        checkUnknownFields(body, PROJECT_SNAPSHOT_ALLOWED_FIELDS),
        checkFieldType(body, 'path', 'string')
    ])
    if (err) {
        return validationError(err, reqInfo, body)
    }

    if (!body.path) {
        return validationError('Field "path" is required', reqInfo, body)
    }

    const nameErr = checkNonEmptyString(body, 'path')
    if (nameErr) {
        return validationError(nameErr, reqInfo, body)
    }

    // Validate absolute path (Unix: starts with /, Windows: starts with drive letter)
    if (body.path.charAt(0) !== '/' && !/^[a-zA-Z]:[/\\]/.test(body.path)) {
        return validationError('Field "path" must be an absolute path (e.g. "/Users/.../snapshot.mdj")', reqInfo, body)
    }

    // Validate .mdj extension
    if (!/\.mdj$/i.test(body.path)) {
        return validationError('Field "path" must have .mdj extension (e.g. "/Users/.../snapshot.mdj")', reqInfo, body)
    }

    const reqInfoWithBody = Object.assign({}, reqInfo, { body: body })

    const project = app.project.getProject()
    if (!project) {
        return {
            success: false,
            error: 'No project is open, so there is no model to snapshot',
            request: reqInfoWithBody
        }
    }

    const fs = require('fs')
    const nodePath = require('path')
    const crypto = require('crypto')

    const filenameBefore = app.project.getFilename()

    // Report and write the same normalised path, so data.path always names the
    // file the bytes actually went to.
    const targetPath = nodePath.resolve(body.path)

    // Writing over the open project's own file would make this a save, which is
    // the single thing a snapshot must never be. The comparison follows
    // symlinks, because a path that merely looks different can still land on
    // the project file.
    if (filenameBefore && isSamePath(targetPath, filenameBefore)) {
        return {
            success: false,
            error: 'Field "path" must not be the open project file ("' + filenameBefore + '"). A snapshot writes a separate copy. Use POST /api/project/save to write the project itself.',
            request: reqInfoWithBody
        }
    }

    // Check the target directory before serialising 10+ MB of model, and report
    // which of the two problems it is.
    const dir = nodePath.dirname(targetPath)
    let dirStat = null
    try {
        dirStat = fs.statSync(dir)
    } catch (e) {
        return {
            success: false,
            error: 'Directory does not exist: "' + dir + '". Create it first, or pass a path inside an existing directory.',
            request: reqInfoWithBody
        }
    }
    if (!dirStat.isDirectory()) {
        return {
            success: false,
            error: 'Not a directory: "' + dir + '"',
            request: reqInfoWithBody
        }
    }
    try {
        fs.accessSync(dir, fs.constants.W_OK)
    } catch (e) {
        return {
            success: false,
            error: 'Directory is not writable: "' + dir + '"',
            request: reqInfoWithBody
        }
    }

    const modifiedBefore = readModifiedFlag()

    try {
        const data = app.repository.writeObject(project)
        const expectedBytes = Buffer.byteLength(data, 'utf8')
        const expectedSha = crypto.createHash('sha256').update(data, 'utf8').digest('hex')

        // 'utf8' matches what save() passes, so an unmodified project's snapshot
        // is byte-identical to the file a save would have written.
        fs.writeFileSync(targetPath, data, 'utf8')

        // Read the bytes back rather than trusting the write. Reporting a hash
        // we computed in memory would say nothing about what reached the disk.
        const written = fs.readFileSync(targetPath)
        const actualBytes = written.length
        const actualSha = crypto.createHash('sha256').update(written).digest('hex')
        if (actualBytes !== expectedBytes || actualSha !== expectedSha) {
            return {
                success: false,
                error: 'Snapshot verification failed: serialised ' + expectedBytes + ' bytes (sha256 ' + expectedSha + '), but the file on disk holds ' + actualBytes + ' bytes (sha256 ' + actualSha + '). The file at "' + targetPath + '" is not a usable snapshot.',
                request: reqInfoWithBody
            }
        }

        // The point of this endpoint is that project state does not move. Check
        // it rather than assert it.
        const filenameAfter = app.project.getFilename()
        if (filenameAfter !== filenameBefore) {
            return {
                success: false,
                error: 'Snapshot changed the open project: project.filename moved from "' + filenameBefore + '" to "' + filenameAfter + '". The snapshot file was written, but the project state is no longer what it was.',
                request: reqInfoWithBody
            }
        }
        const modifiedAfter = readModifiedFlag()
        if (modifiedBefore !== null && modifiedAfter !== modifiedBefore) {
            return {
                success: false,
                error: 'Snapshot changed the project modified flag from ' + modifiedBefore + ' to ' + modifiedAfter + '. A snapshot is not a save and must not report the model as saved.',
                request: reqInfoWithBody
            }
        }

        return {
            success: true,
            message: 'Wrote a snapshot of the in-memory model to "' + targetPath + '" (' + actualBytes + ' bytes). The open project is unchanged.',
            request: reqInfoWithBody,
            data: {
                path: targetPath,
                bytes: actualBytes,
                sha256: actualSha,
                projectFilename: filenameAfter,
                modified: modifiedAfter
            }
        }
    } catch (e) {
        return {
            success: false,
            error: 'Failed to write snapshot: ' + (e.message || String(e)),
            request: reqInfoWithBody
        }
    }
}

function openProject(body, reqInfo) {
    const err = validate([
        checkUnknownFields(body, PROJECT_OPEN_ALLOWED_FIELDS),
        checkFieldType(body, 'path', 'string')
    ])
    if (err) {
        return validationError(err, reqInfo, body)
    }

    if (!body.path) {
        return validationError('Field "path" is required', reqInfo, body)
    }

    const nameErr = checkNonEmptyString(body, 'path')
    if (nameErr) {
        return validationError(nameErr, reqInfo, body)
    }

    // Validate absolute path (Unix: starts with /, Windows: starts with drive letter)
    if (body.path.charAt(0) !== '/' && !/^[a-zA-Z]:[/\\]/.test(body.path)) {
        return validationError('Field "path" must be an absolute path (e.g. "/Users/.../project.mdj")', reqInfo, body)
    }

    // Validate .mdj extension
    if (!/\.mdj$/i.test(body.path)) {
        return validationError('Field "path" must have .mdj extension (e.g. "/Users/.../project.mdj")', reqInfo, body)
    }

    const reqInfoWithBody = Object.assign({}, reqInfo, { body: body })

    try {
        const result = app.project.load(body.path)

        // Handle async (Promise) return
        if (result && typeof result.then === 'function') {
            return result.then(function () {
                const project = app.project.getProject()
                return {
                    success: true,
                    message: 'Project opened from "' + body.path + '"',
                    request: reqInfoWithBody,
                    data: {
                        path: body.path,
                        projectName: project ? project.name : ''
                    }
                }
            }).catch(function (e) {
                return {
                    success: false,
                    error: 'Failed to open project: ' + (e.message || String(e)),
                    request: reqInfoWithBody
                }
            })
        }

        // Synchronous return
        const project = app.project.getProject()
        return {
            success: true,
            message: 'Project opened from "' + body.path + '"',
            request: reqInfoWithBody,
            data: {
                path: body.path,
                projectName: project ? project.name : ''
            }
        }
    } catch (e) {
        return {
            success: false,
            error: 'Failed to open project: ' + (e.message || String(e)),
            request: reqInfoWithBody
        }
    }
}

// ============================================================
// Sequence Diagram - Serialization
// ============================================================

function serializeInteraction(interaction) {
    if (!interaction) {
        return null
    }
    const result = serializeElement(interaction)
    result.participants = (interaction.participants || []).map(function (p) {
        return { _id: p._id, name: p.name || '' }
    })
    result.messages = (interaction.messages || []).map(function (m) {
        return { _id: m._id, name: m.name || '' }
    })
    result.fragments = (interaction.fragments || []).map(function (f) {
        return { _id: f._id, _type: f.constructor.name, name: f.name || '' }
    })
    if (interaction._parent) {
        result._parentId = interaction._parent._id
    }
    return result
}

function serializeSeqDiagram(diagram) {
    if (!diagram) {
        return null
    }
    const result = serializeElement(diagram)
    const lifelineIds = []
    if (diagram.ownedViews) {
        diagram.ownedViews.forEach(function (view) {
            if (view.model && view.model instanceof type.UMLLifeline) {
                if (lifelineIds.indexOf(view.model._id) === -1) {
                    lifelineIds.push(view.model._id)
                }
            }
        })
    }
    result.lifelineIds = lifelineIds
    if (diagram._parent) {
        result._parentId = diagram._parent._id
    }
    return result
}

function serializeLifeline(lifeline) {
    if (!lifeline) {
        return null
    }
    const result = serializeElement(lifeline)
    if (lifeline.represent) {
        result.represent = lifeline.represent._id
        // `represent` alone is the role's id, which says nothing about what the
        // lifeline stands for. The classifier lives on the role's `type` and is
        // either a Model reference or a plain string.
        const represented = lifeline.represent.type
        if (represented && typeof represented === 'object') {
            result.representTypeId = represented._id
            result.representTypeName = represented.name || ''
        } else if (typeof represented === 'string' && represented.length > 0) {
            result.representTypeName = represented
        }
    }
    if (lifeline._parent) {
        result._parentId = lifeline._parent._id
    }
    return result
}

/**
 * Work out what to store on lifeline.represent.type, before anything is built.
 *
 * representTypeId takes an element id and stores a reference; representTypeName
 * takes a bare type name and stores a string; representTypeId: null clears it.
 * Resolving up front keeps createLifeline from building a lifeline and then
 * failing validation, which would report an error for a lifeline that exists.
 * Returns { skip }, { error } or { value, field }.
 */
function resolveRepresentType(body) {
    if (body.representTypeId === undefined && body.representTypeName === undefined) {
        return { skip: true }
    }
    if (body.representTypeId !== undefined && body.representTypeName !== undefined) {
        return { error: 'Fields "representTypeId" and "representTypeName" are mutually exclusive. Provide one of them.' }
    }
    if (body.representTypeName !== undefined) {
        return { value: body.representTypeName, field: 'representTypeName' }
    }
    if (body.representTypeId === null) {
        return { value: null, field: 'representTypeId' }
    }
    const classifier = findById(body.representTypeId)
    if (!classifier) {
        return { error: 'representTypeId not found: ' + body.representTypeId }
    }
    if (!(classifier instanceof type.UMLClassifier)) {
        return { error: 'representTypeId must refer to a UMLClassifier (class, interface, actor, use case, component, ...). Got ' + classifier.constructor.name }
    }
    return { value: classifier, field: 'representTypeId' }
}

/**
 * Can this lifeline take a represent type at all?
 *
 * Call this before writing anything. applyRepresentType reports the same problem,
 * but by the time it runs an update has already applied name/stereotype/
 * documentation — so the caller would read a failure for a write that partly
 * happened, and the name really did change. Returns an error string, or null.
 */
function checkRepresentRole(lifeline, resolved) {
    if (resolved.skip || lifeline.represent) {
        return null
    }
    return 'Lifeline "' + (lifeline.name || lifeline._id) + '" has no represent role, so its type cannot be set'
}

/**
 * Write a resolved represent type onto the lifeline's role.
 * Returns an error string only when the lifeline carries no role at all; callers
 * should have ruled that out with checkRepresentRole before writing anything.
 */
function applyRepresentType(report, lifeline, resolved) {
    const roleErr = checkRepresentRole(lifeline, resolved)
    if (roleErr) {
        return roleErr
    }
    if (resolved.skip) {
        return null
    }
    applyProperty(report, lifeline.represent, 'type', resolved.value, resolved.field)
    return null
}

function serializeMessage(msg) {
    if (!msg) {
        return null
    }
    const result = {
        _id: msg._id,
        _type: msg.constructor.name,
        name: msg.name || '',
        messageSort: msg.messageSort || 'synchCall'
    }
    if (msg.source) {
        result.source = msg.source._id
    }
    if (msg.target) {
        result.target = msg.target._id
    }
    if (msg.signature) {
        result.signature = msg.signature._id
        result.signatureId = msg.signature._id
        result.signatureName = msg.signature.name || ''
        result.signatureType = msg.signature.constructor.name
        // The operation's owner, so a caller can check the message is pointed at
        // an operation of the receiving lifeline's classifier without a second
        // request.
        if (msg.signature._parent) {
            result.signatureOwnerId = msg.signature._parent._id
            result.signatureOwnerName = msg.signature._parent.name || ''
        }
        if (Array.isArray(msg.signature.parameters)) {
            // UML 2.5.1 §17.12.18.7 signature_is_operation_request compares the
            // argument count with the parameter count. Report the count so the
            // caller does not have to fetch the operation to check it.
            result.signatureParameterCount = msg.signature.parameters.filter(function (p) {
                return p.direction !== 'return'
            }).length
        }
    }
    MESSAGE_MODEL_FIELDS.forEach(function (f) {
        if (typeof msg[f] === 'string' && msg[f] !== '') {
            result[f] = msg[f]
        }
    })
    if (msg.isConcurrentIteration) {
        result.isConcurrentIteration = true
    }
    if (msg.connector) {
        result.connector = msg.connector._id
    }
    if (msg.documentation) {
        result.documentation = msg.documentation
    }
    if (msg._parent) {
        result._parentId = msg._parent._id
    }
    return result
}

function serializeCombinedFragment(fragment) {
    if (!fragment) {
        return null
    }
    const result = {
        _id: fragment._id,
        _type: fragment.constructor.name,
        name: fragment.name || '',
        interactionOperator: fragment.interactionOperator || 'alt'
    }
    result.operands = (fragment.operands || []).map(function (op) {
        return { _id: op._id, name: op.name || '', guard: op.guard || '' }
    })
    if (fragment.documentation) {
        result.documentation = fragment.documentation
    }
    if (fragment._parent) {
        result._parentId = fragment._parent._id
    }
    return result
}

function serializeInteractionOperand(operand) {
    if (!operand) {
        return null
    }
    const result = {
        _id: operand._id,
        _type: operand.constructor.name,
        name: operand.name || '',
        guard: operand.guard || ''
    }
    if (operand.documentation) {
        result.documentation = operand.documentation
    }
    if (operand._parent) {
        result._parentId = operand._parent._id
    }
    return result
}

function serializeStateInvariant(si) {
    if (!si) {
        return null
    }
    const result = {
        _id: si._id,
        _type: si.constructor.name,
        name: si.name || ''
    }
    if (si.covered) {
        result.covered = si.covered._id
    }
    if (si.invariant) {
        result.invariant = si.invariant
    }
    if (si.documentation) {
        result.documentation = si.documentation
    }
    if (si._parent) {
        result._parentId = si._parent._id
    }
    return result
}

function serializeInteractionUse(iu) {
    if (!iu) {
        return null
    }
    const result = {
        _id: iu._id,
        _type: iu.constructor.name,
        name: iu.name || ''
    }
    if (iu.refersTo) {
        result.refersTo = iu.refersTo._id
    }
    if (iu.arguments) {
        result.arguments = iu.arguments
    }
    if (iu.returnValue) {
        result.returnValue = iu.returnValue
    }
    if (iu.documentation) {
        result.documentation = iu.documentation
    }
    if (iu._parent) {
        result._parentId = iu._parent._id
    }
    return result
}

// ============================================================
// Sequence Diagram - Helpers
// ============================================================

/**
 * Find a view for a given model on a specific diagram.
 */
function findViewOnDiagram(diagram, modelId) {
    if (!diagram || !diagram.ownedViews) {
        return null
    }
    for (let i = 0; i < diagram.ownedViews.length; i++) {
        const view = diagram.ownedViews[i]
        if (view.model && view.model._id === modelId) {
            return view
        }
    }
    return null
}

/**
 * Find a view on a diagram by view _id or model _id.
 */
function findViewOnDiagramByAnyId(diagram, id) {
    if (!diagram || !diagram.ownedViews) {
        return null
    }
    for (let i = 0; i < diagram.ownedViews.length; i++) {
        const view = diagram.ownedViews[i]
        if (view._id === id) {
            return view
        }
        if (view.model && view.model._id === id) {
            return view
        }
    }
    return null
}

/**
 * Find messages that reference the given lifeline as source or target.
 */
function findMessagesReferencingLifeline(lifelineId) {
    const allMsgs = app.repository.select('@UMLMessage')
    const result = []
    for (let i = 0; i < allMsgs.length; i++) {
        const msg = allMsgs[i]
        const refs = []
        if (msg.source && msg.source._id === lifelineId) {
            refs.push('source')
        }
        if (msg.target && msg.target._id === lifelineId) {
            refs.push('target')
        }
        if (refs.length > 0) {
            result.push({
                messageId: msg._id,
                messageName: msg.name || msg._id,
                refs: refs
            })
        }
    }
    return result
}

/**
 * Find state invariants that reference the given lifeline via covered.
 */
function findStateInvariantsReferencingLifeline(lifelineId) {
    const allSI = app.repository.select('@UMLStateInvariant')
    const result = []
    for (let i = 0; i < allSI.length; i++) {
        const si = allSI[i]
        if (si.covered && si.covered._id === lifelineId) {
            result.push({
                stateInvariantId: si._id,
                stateInvariantName: si.name || si._id
            })
        }
    }
    return result
}

// ============================================================
// Sequence Diagram - Route Handlers
// ============================================================

// --- Allowed Fields ---

const INTERACTION_ALLOWED_FIELDS = ['name', 'documentation']
const INTERACTION_UPDATE_FIELDS = ['name', 'documentation']
const SEQ_DIAGRAM_ALLOWED_FIELDS = ['parentId', 'name', 'width', 'height', 'documentation']
const SEQ_DIAGRAM_UPDATE_FIELDS = ['name', 'documentation']
// representTypeId/representTypeName set the classifier a lifeline stands for.
// StarUML keeps that two levels down: UMLLifeline.represent holds a role (a
// UMLAttribute the lifeline factory creates), and the classifier sits on the
// role's `type`, which accepts either a Model reference or a plain string.
const LIFELINE_ALLOWED_FIELDS = ['name', 'stereotype', 'documentation', 'diagramId', 'x', 'y', 'height', 'representTypeId', 'representTypeName']
const LIFELINE_UPDATE_FIELDS = ['name', 'stereotype', 'documentation', 'representTypeId', 'representTypeName']
// The model-level fields of a UMLMessage, beyond name/messageSort.
//
// `signature` points a message at the UMLOperation (or UMLSignal) it invokes.
// It is what ties a sequence diagram back to the class diagram: UML 2.5.1
// §17.12.18.7 signature_refer_to expects the message name to be the operation
// name, and signature_is_operation_request expects the argument count to match
// the parameter count. Without it a sequence diagram and a class diagram are
// two unconnected pictures.
//
// serializeMessage has always reported `signature` as an id, so the write takes
// the same spelling. `signatureId` is accepted as an alias.
//
// Note for code generation: StarUML's Java and C# generators read UMLOperation
// and UMLParameter, not Message.signature. Setting signature does not change
// what they emit — it restores traceability, not codegen.
const MESSAGE_MODEL_FIELDS = ['arguments', 'guard', 'sequenceNumber', 'iteration', 'assignmentTarget']
const MESSAGE_ALLOWED_FIELDS = ['name', 'messageSort', 'source', 'target', 'diagramId', 'y', 'x', 'activationHeight', 'documentation', 'messageType',
    'signature', 'signatureId', 'isConcurrentIteration'].concat(MESSAGE_MODEL_FIELDS)
const VALID_MESSAGE_TYPES = ['UMLMessage', 'UMLFoundMessage', 'UMLLostMessage']
// y/x/activationHeight live on the message's view, not the model. y is the
// message's vertical position; x only takes effect on a found/lost message's
// free endpoint (updateMessage reports it as ignored otherwise).
const MESSAGE_UPDATE_FIELDS = ['name', 'messageSort', 'documentation', 'y', 'x', 'activationHeight',
    'signature', 'signatureId', 'isConcurrentIteration'].concat(MESSAGE_MODEL_FIELDS)
const COMBINED_FRAGMENT_ALLOWED_FIELDS = ['name', 'interactionOperator', 'diagramId', 'x', 'y', 'width', 'height', 'documentation']
const COMBINED_FRAGMENT_UPDATE_FIELDS = ['name', 'interactionOperator', 'documentation']
const OPERAND_ALLOWED_FIELDS = ['name', 'guard', 'documentation']
const OPERAND_UPDATE_FIELDS = ['name', 'guard', 'documentation']
const STATE_INVARIANT_ALLOWED_FIELDS = ['name', 'covered', 'invariant', 'diagramId', 'x', 'y', 'documentation']
const STATE_INVARIANT_UPDATE_FIELDS = ['name', 'covered', 'invariant', 'documentation']
const INTERACTION_USE_ALLOWED_FIELDS = ['name', 'refersTo', 'arguments', 'returnValue', 'diagramId', 'x', 'y', 'width', 'height', 'documentation']
const INTERACTION_USE_UPDATE_FIELDS = ['name', 'refersTo', 'arguments', 'returnValue', 'documentation']

// --- Interactions ---

function getInteractions(reqInfo) {
    const interactions = app.repository.select('@UMLInteraction')
    return {
        success: true,
        message: 'Retrieved ' + interactions.length + ' interaction(s)',
        request: reqInfo,
        data: interactions.map(function (i) { return serializeInteraction(i) })
    }
}

function getInteraction(id, reqInfo) {
    const interaction = findById(id)
    if (!interaction || !(interaction instanceof type.UMLInteraction)) {
        return { success: false, error: 'Interaction not found: ' + id, request: reqInfo }
    }
    return {
        success: true,
        message: 'Retrieved interaction "' + interaction.name + '"',
        request: reqInfo,
        data: serializeInteraction(interaction)
    }
}

function createInteraction(body, reqInfo) {
    const err = validate([
        checkUnknownFields(body, INTERACTION_ALLOWED_FIELDS),
        checkFieldType(body, 'name', 'string'),
        checkFieldType(body, 'documentation', 'string')
    ])
    if (err) {
        return validationError(err, reqInfo, body)
    }

    if (body.name !== undefined) {
        const nameErr = checkNonEmptyString(body, 'name')
        if (nameErr) {
            return validationError(nameErr, reqInfo, body)
        }
    }

    const project = app.repository.select('@Project')[0]
    if (!project) {
        return validationError('No project found. Open a project first.', reqInfo, body)
    }

    // StarUML requires UMLInteraction to be under UMLCollaboration for proper diagram support.
    // Auto-create a UMLCollaboration under Project if one doesn't exist.
    // Scope to collaborations under this project to avoid using unrelated ones.
    let collaboration = app.repository.select('@UMLCollaboration').filter(function (c) {
        return c._parent && c._parent._id === project._id
    })[0]
    if (!collaboration) {
        collaboration = app.factory.createModel({
            id: 'UMLCollaboration',
            parent: project,
            modelInitializer: function (m) {
                m.name = 'Collaborations'
            }
        })
    }

    const interaction = app.factory.createModel({
        id: 'UMLInteraction',
        parent: collaboration,
        modelInitializer: function (m) {
            m.name = body.name || 'Interaction1'
            if (body.documentation !== undefined) {
                m.documentation = body.documentation
            }
        }
    })

    return {
        success: true,
        message: 'Created interaction "' + interaction.name + '"',
        request: Object.assign({}, reqInfo, { body: body }),
        data: serializeInteraction(interaction)
    }
}

function updateInteraction(id, body, reqInfo) {
    const err = validate([
        checkUnknownFields(body, INTERACTION_UPDATE_FIELDS),
        checkFieldType(body, 'name', 'string'),
        checkFieldType(body, 'documentation', 'string')
    ])
    if (err) {
        return validationError(err, reqInfo, body)
    }

    if (Object.keys(body).length === 0) {
        return validationError('At least one field must be provided. Allowed fields: ' + INTERACTION_UPDATE_FIELDS.join(', '), reqInfo, body)
    }

    if (body.name !== undefined) {
        const nameErr = checkNonEmptyString(body, 'name')
        if (nameErr) {
            return validationError(nameErr, reqInfo, body)
        }
    }

    const interaction = findById(id)
    if (!interaction || !(interaction instanceof type.UMLInteraction)) {
        return { success: false, error: 'Interaction not found: ' + id, request: Object.assign({}, reqInfo, { body: body }) }
    }

    const report = createWriteReport()
    if (body.name !== undefined) {
        applyProperty(report, interaction, 'name', body.name)
    }
    if (body.documentation !== undefined) {
        applyProperty(report, interaction, 'documentation', body.documentation)
    }

    return attachWriteReport({
        success: true,
        message: writeReportMessage('Updated interaction "' + interaction.name + '"', report),
        request: Object.assign({}, reqInfo, { body: body }),
        data: serializeInteraction(interaction)
    }, report)
}

function deleteInteraction(id, reqInfo) {
    const interaction = findById(id)
    if (!interaction || !(interaction instanceof type.UMLInteraction)) {
        return { success: false, error: 'Interaction not found: ' + id, request: reqInfo }
    }
    const name = interaction.name

    // Auto-cleanup UMLEndpoints (auto-created by FoundMessage/LostMessage)
    const endpoints = (interaction.participants || []).filter(function (p) {
        return p instanceof type.UMLEndpoint
    })
    if (endpoints.length > 0) {
        app.engine.deleteElements(endpoints, [])
    }

    // Safety check: block deletion if lifelines, messages, fragments, or diagrams exist
    const lifelines = (interaction.participants || [])
    const messages = (interaction.messages || [])
    const fragments = (interaction.fragments || [])
    const diagrams = app.repository.select('@UMLSequenceDiagram').filter(function (d) {
        return d._parent && d._parent._id === id
    })

    if (lifelines.length > 0 || messages.length > 0 || fragments.length > 0 || diagrams.length > 0) {
        return validationError(
            'Cannot delete interaction "' + name + '": ' + lifelines.length + ' lifeline(s), ' + messages.length + ' message(s), ' + fragments.length + ' fragment(s), and ' + diagrams.length + ' diagram(s) exist under it. Delete them first.',
            reqInfo
        )
    }

    const parent = interaction._parent
    app.engine.deleteElements([interaction], [])

    // Clean up auto-created UMLCollaboration if it became empty
    if (parent && parent instanceof type.UMLCollaboration && parent._parent) {
        const remaining = (parent.ownedElements || []).length
        if (remaining === 0) {
            app.engine.deleteElements([parent], [])
        }
    }

    return {
        success: true,
        message: 'Deleted interaction "' + name + '"',
        request: reqInfo,
        data: { deleted: id, name: name }
    }
}

// --- Sequence Diagrams ---

function getSeqDiagrams(reqInfo) {
    const diagrams = app.repository.select('@UMLSequenceDiagram')
    return {
        success: true,
        message: 'Retrieved ' + diagrams.length + ' sequence diagram(s)',
        request: reqInfo,
        data: diagrams.map(function (d) { return serializeSeqDiagram(d) })
    }
}

function getSeqDiagram(id, reqInfo) {
    const diagram = findById(id)
    if (!diagram || !(diagram instanceof type.UMLSequenceDiagram)) {
        return { success: false, error: 'Sequence diagram not found: ' + id, request: reqInfo }
    }
    return {
        success: true,
        message: 'Retrieved sequence diagram "' + diagram.name + '"',
        request: reqInfo,
        data: serializeSeqDiagram(diagram)
    }
}

function createSeqDiagram(body, reqInfo) {
    const err = validate([
        checkUnknownFields(body, SEQ_DIAGRAM_ALLOWED_FIELDS),
        checkFieldType(body, 'parentId', 'string'),
        checkFieldType(body, 'name', 'string'),
        checkFieldType(body, 'width', 'number'),
        checkFieldType(body, 'height', 'number'),
        checkFieldType(body, 'documentation', 'string')
    ])
    if (err) {
        return validationError(err, reqInfo, body)
    }

    if (!body.parentId) {
        return validationError('Field "parentId" is required', reqInfo, body)
    }

    if (body.name !== undefined) {
        const nameErr = checkNonEmptyString(body, 'name')
        if (nameErr) {
            return validationError(nameErr, reqInfo, body)
        }
    }

    const parent = findById(body.parentId)
    if (!parent || !(parent instanceof type.UMLInteraction)) {
        return validationError('parentId must refer to a UMLInteraction. Not found or wrong type: ' + body.parentId, reqInfo, body)
    }

    const diagram = app.factory.createDiagram({
        id: 'UMLSequenceDiagram',
        parent: parent,
        diagramInitializer: function (d) {
            d.name = body.name || 'SequenceDiagram1'
            if (body.documentation !== undefined) {
                d.documentation = body.documentation
            }
        }
    })

    // Resize frame if width/height specified
    const report = createWriteReport()
    if (body.width !== undefined || body.height !== undefined) {
        const frameView = (diagram.ownedViews || []).filter(function (v) {
            return v.constructor && v.constructor.name === 'UMLFrameView'
        })[0]
        if (frameView) {
            if (body.width !== undefined) {
                applyProperty(report, frameView, 'width', body.width)
            }
            if (body.height !== undefined) {
                applyProperty(report, frameView, 'height', body.height)
            }
        } else {
            // The size used to be dropped without a word on a diagram with no frame.
            if (body.width !== undefined) {
                reportIgnoredWrite(report, 'width', body.width, undefined, 'this diagram has no UMLFrameView to resize')
            }
            if (body.height !== undefined) {
                reportIgnoredWrite(report, 'height', body.height, undefined, 'this diagram has no UMLFrameView to resize')
            }
        }
    }

    return attachWriteReport({
        success: true,
        message: appendWriteWarnings('Created sequence diagram "' + diagram.name + '"', report),
        request: Object.assign({}, reqInfo, { body: body }),
        data: serializeSeqDiagram(diagram)
    }, report)
}

function updateSeqDiagram(id, body, reqInfo) {
    const err = validate([
        checkUnknownFields(body, SEQ_DIAGRAM_UPDATE_FIELDS),
        checkFieldType(body, 'name', 'string'),
        checkFieldType(body, 'documentation', 'string')
    ])
    if (err) {
        return validationError(err, reqInfo, body)
    }

    if (Object.keys(body).length === 0) {
        return validationError('At least one field must be provided. Allowed fields: ' + SEQ_DIAGRAM_UPDATE_FIELDS.join(', '), reqInfo, body)
    }

    if (body.name !== undefined) {
        const nameErr = checkNonEmptyString(body, 'name')
        if (nameErr) {
            return validationError(nameErr, reqInfo, body)
        }
    }

    const diagram = findById(id)
    if (!diagram || !(diagram instanceof type.UMLSequenceDiagram)) {
        return { success: false, error: 'Sequence diagram not found: ' + id, request: Object.assign({}, reqInfo, { body: body }) }
    }

    const report = createWriteReport()
    if (body.name !== undefined) {
        applyProperty(report, diagram, 'name', body.name)
    }
    if (body.documentation !== undefined) {
        applyProperty(report, diagram, 'documentation', body.documentation)
    }

    return attachWriteReport({
        success: true,
        message: writeReportMessage('Updated sequence diagram "' + diagram.name + '"', report),
        request: Object.assign({}, reqInfo, { body: body }),
        data: serializeSeqDiagram(diagram)
    }, report)
}

function deleteSeqDiagram(id, reqInfo) {
    const diagram = findById(id)
    if (!diagram || !(diagram instanceof type.UMLSequenceDiagram)) {
        return { success: false, error: 'Sequence diagram not found: ' + id, request: reqInfo }
    }
    const name = diagram.name
    app.engine.deleteElements([diagram], [])
    return {
        success: true,
        message: 'Deleted sequence diagram "' + name + '"',
        request: reqInfo,
        data: { deleted: id, name: name }
    }
}

// --- Lifelines ---

function getLifelines(interactionId, reqInfo) {
    const interaction = findById(interactionId)
    if (!interaction || !(interaction instanceof type.UMLInteraction)) {
        return { success: false, error: 'Interaction not found: ' + interactionId, request: reqInfo }
    }
    const lifelines = interaction.participants || []
    return {
        success: true,
        message: 'Retrieved ' + lifelines.length + ' lifeline(s) from interaction "' + interaction.name + '"',
        request: reqInfo,
        data: lifelines.map(function (l) { return serializeLifeline(l) })
    }
}

function createLifeline(interactionId, body, reqInfo) {
    const err = validate([
        checkUnknownFields(body, LIFELINE_ALLOWED_FIELDS),
        checkFieldType(body, 'name', 'string'),
        checkFieldType(body, 'documentation', 'string'),
        checkFieldType(body, 'diagramId', 'string'),
        checkFieldType(body, 'x', 'number'),
        checkFieldType(body, 'y', 'number'),
        checkFieldType(body, 'height', 'number'),
        checkFieldType(body, 'representTypeId', 'string|null'),
        checkFieldType(body, 'representTypeName', 'string')
    ])
    if (err) {
        return validationError(err, reqInfo, body)
    }

    if (body.name !== undefined) {
        const nameErr = checkNonEmptyString(body, 'name')
        if (nameErr) {
            return validationError(nameErr, reqInfo, body)
        }
    }

    const represent = resolveRepresentType(body)
    if (represent.error) {
        return validationError(represent.error, reqInfo, body)
    }

    const interaction = findById(interactionId)
    if (!interaction || !(interaction instanceof type.UMLInteraction)) {
        return { success: false, error: 'Interaction not found: ' + interactionId, request: Object.assign({}, reqInfo, { body: body }) }
    }

    if (body.diagramId) {
        const diagram = findById(body.diagramId)
        if (!diagram || !(diagram instanceof type.UMLSequenceDiagram)) {
            return validationError('diagramId must refer to a UMLSequenceDiagram. Not found or wrong type: ' + body.diagramId, reqInfo, body)
        }
        const options = {
            id: 'UMLLifeline',
            parent: interaction,
            diagram: diagram,
            x1: body.x !== undefined ? body.x : 100,
            y1: body.y !== undefined ? body.y : 50,
            x2: (body.x !== undefined ? body.x : 100) + 100,
            y2: (body.y !== undefined ? body.y : 50) + (body.height !== undefined ? body.height : 200),
            modelInitializer: function (m) {
                m.name = body.name || 'Lifeline1'
                if (body.stereotype !== undefined) {
                    m.stereotype = body.stereotype
                }
                if (body.documentation !== undefined) {
                    m.documentation = body.documentation
                }
            }
        }
        const view = app.factory.createModelAndView(options)
        if (!view || !view.model) {
            return { success: false, error: 'Failed to create lifeline view on diagram. Ensure the interaction has a valid parent hierarchy (UMLCollaboration).', request: Object.assign({}, reqInfo, { body: body }) }
        }
        const viewReport = createWriteReport()
        const viewRepresentErr = applyRepresentType(viewReport, view.model, represent)
        if (viewRepresentErr) {
            return validationError(viewRepresentErr, reqInfo, body)
        }
        autoExpandFrame(diagram)
        return attachWriteReport({
            success: true,
            message: appendWriteWarnings('Created lifeline "' + view.model.name + '" with view on diagram "' + diagram.name + '"', viewReport),
            request: Object.assign({}, reqInfo, { body: body }),
            data: serializeLifeline(view.model)
        }, viewReport)
    }

    const lifeline = app.factory.createModel({
        id: 'UMLLifeline',
        parent: interaction,
        field: 'participants',
        modelInitializer: function (m) {
            m.name = body.name || 'Lifeline1'
            if (body.stereotype !== undefined) {
                m.stereotype = body.stereotype
            }
            if (body.documentation !== undefined) {
                m.documentation = body.documentation
            }
        }
    })

    if (!lifeline) {
        return { success: false, error: 'Failed to create lifeline model. Ensure the interaction has a valid parent hierarchy (UMLCollaboration).', request: Object.assign({}, reqInfo, { body: body }) }
    }

    const report = createWriteReport()
    const representErr = applyRepresentType(report, lifeline, represent)
    if (representErr) {
        return validationError(representErr, reqInfo, body)
    }

    return attachWriteReport({
        success: true,
        message: appendWriteWarnings('Created lifeline "' + lifeline.name + '"', report),
        request: Object.assign({}, reqInfo, { body: body }),
        data: serializeLifeline(lifeline)
    }, report)
}

function getLifeline(id, reqInfo) {
    const lifeline = findById(id)
    if (!lifeline || !(lifeline instanceof type.UMLLifeline)) {
        return { success: false, error: 'Lifeline not found: ' + id, request: reqInfo }
    }
    return {
        success: true,
        message: 'Retrieved lifeline "' + lifeline.name + '"',
        request: reqInfo,
        data: serializeLifeline(lifeline)
    }
}

function updateLifeline(id, body, reqInfo) {
    const err = validate([
        checkUnknownFields(body, LIFELINE_UPDATE_FIELDS),
        checkFieldType(body, 'name', 'string'),
        checkFieldType(body, 'stereotype', 'string'),
        checkFieldType(body, 'documentation', 'string'),
        checkFieldType(body, 'representTypeId', 'string|null'),
        checkFieldType(body, 'representTypeName', 'string')
    ])
    if (err) {
        return validationError(err, reqInfo, body)
    }

    if (Object.keys(body).length === 0) {
        return validationError('At least one field must be provided. Allowed fields: ' + LIFELINE_UPDATE_FIELDS.join(', '), reqInfo, body)
    }

    if (body.name !== undefined) {
        const nameErr = checkNonEmptyString(body, 'name')
        if (nameErr) {
            return validationError(nameErr, reqInfo, body)
        }
    }

    const represent = resolveRepresentType(body)
    if (represent.error) {
        return validationError(represent.error, reqInfo, body)
    }

    const lifeline = findById(id)
    if (!lifeline || !(lifeline instanceof type.UMLLifeline)) {
        return { success: false, error: 'Lifeline not found: ' + id, request: Object.assign({}, reqInfo, { body: body }) }
    }

    // Before any write: a missing role used to surface after name, stereotype and
    // documentation had already been applied, so the call reported failure for an
    // update that had partly gone through.
    const roleErr = checkRepresentRole(lifeline, represent)
    if (roleErr) {
        return validationError(roleErr, reqInfo, body)
    }

    const report = createWriteReport()
    if (body.name !== undefined) {
        applyProperty(report, lifeline, 'name', body.name)
    }
    if (body.stereotype !== undefined) {
        applyProperty(report, lifeline, 'stereotype', body.stereotype)
    }
    if (body.documentation !== undefined) {
        applyProperty(report, lifeline, 'documentation', body.documentation)
    }
    const representErr = applyRepresentType(report, lifeline, represent)
    if (representErr) {
        return validationError(representErr, reqInfo, body)
    }

    return attachWriteReport({
        success: true,
        message: writeReportMessage('Updated lifeline "' + lifeline.name + '"', report),
        request: Object.assign({}, reqInfo, { body: body }),
        data: serializeLifeline(lifeline)
    }, report)
}

function deleteLifeline(id, reqInfo) {
    const lifeline = findById(id)
    if (!lifeline || !(lifeline instanceof type.UMLLifeline)) {
        return { success: false, error: 'Lifeline not found: ' + id, request: reqInfo }
    }
    const name = lifeline.name

    // Check referential integrity: messages referencing this lifeline
    const referencingMsgs = findMessagesReferencingLifeline(id)
    if (referencingMsgs.length > 0) {
        const msgDetails = referencingMsgs.map(function (ref) {
            return ref.messageName + ' (' + ref.refs.join(', ') + ')'
        })
        return validationError(
            'Cannot delete lifeline "' + name + '": ' + referencingMsgs.length + ' message(s) reference this lifeline. ' + msgDetails.join(', '),
            reqInfo
        )
    }

    // Check referential integrity: state invariants referencing this lifeline
    const referencingSI = findStateInvariantsReferencingLifeline(id)
    if (referencingSI.length > 0) {
        const siDetails = referencingSI.map(function (ref) {
            return ref.stateInvariantName + ' (' + ref.stateInvariantId + ')'
        })
        return validationError(
            'Cannot delete lifeline "' + name + '": ' + referencingSI.length + ' state invariant(s) reference this lifeline. ' + siDetails.join(', '),
            reqInfo
        )
    }

    const elementsToDelete = [lifeline]
    if (lifeline.represent) {
        elementsToDelete.push(lifeline.represent)
    }
    app.engine.deleteElements(elementsToDelete, [])
    return {
        success: true,
        message: 'Deleted lifeline "' + name + '"',
        request: reqInfo,
        data: { deleted: id, name: name }
    }
}

// --- Messages ---

function getMessages(interactionId, reqInfo) {
    const interaction = findById(interactionId)
    if (!interaction || !(interaction instanceof type.UMLInteraction)) {
        return { success: false, error: 'Interaction not found: ' + interactionId, request: reqInfo }
    }
    const messages = interaction.messages || []
    return {
        success: true,
        message: 'Retrieved ' + messages.length + ' message(s) from interaction "' + interaction.name + '"',
        request: reqInfo,
        data: messages.map(function (m) { return serializeMessage(m) })
    }
}

/**
 * Resolve the operation or signal a message invokes.
 *
 * UML 2.5.1 constrains Message::signature to an Operation or a Signal, which is
 * tighter than StarUML's metamodel (a bare UMLModelElement ref). Enforce the
 * spec: a message pointed at a class or a package satisfies no UML rule and
 * would only look like traceability.
 *
 * Returns { skip }, { error } or { value, field }. `value` is null when the
 * caller asked to clear the signature.
 */
function resolveMessageSignature(body) {
    const spellings = ['signature', 'signatureId']
    const given = spellings.filter(function (s) { return body[s] !== undefined })
    if (given.length === 0) {
        return { skip: true }
    }
    if (given.length > 1) {
        return { error: 'Fields "signature" and "signatureId" are two names for the same property. Provide one of them.' }
    }
    const field = given[0]
    const value = body[field]
    if (value === null) {
        return { value: null, field: field }
    }
    if (typeof value !== 'string' || value.trim() === '') {
        return { error: 'Field "' + field + '" must be an element id, or null to clear it' }
    }
    const target = findById(value)
    if (!target) {
        return { error: field + ' not found: ' + value }
    }
    const isOperation = !!(type.UMLOperation && target instanceof type.UMLOperation)
    const isSignal = !!(type.UMLSignal && target instanceof type.UMLSignal)
    if (!isOperation && !isSignal) {
        return { error: field + ' must refer to a UMLOperation or a UMLSignal (UML 2.5.1 Message::signature). Got ' +
            target.constructor.name + ' (' + value + ')' }
    }
    return { value: target, field: field }
}

/**
 * Write the UMLMessage model fields shared by create and update.
 */
function applyMessageModelFields(report, msg, body, signature) {
    if (signature && !signature.skip) {
        applyProperty(report, msg, 'signature', signature.value, signature.field)
    }
    MESSAGE_MODEL_FIELDS.forEach(function (f) {
        if (body[f] !== undefined) {
            applyProperty(report, msg, f, body[f])
        }
    })
    if (body.isConcurrentIteration !== undefined) {
        applyProperty(report, msg, 'isConcurrentIteration', body.isConcurrentIteration)
    }
    return report
}

/**
 * Type checks for the message model fields, shared by create and update.
 */
function messageModelFieldChecks(body) {
    const checks = [checkFieldType(body, 'isConcurrentIteration', 'boolean')]
    MESSAGE_MODEL_FIELDS.forEach(function (f) {
        checks.push(checkFieldType(body, f, 'string'))
    })
    return checks
}

function createMessage(interactionId, body, reqInfo) {
    const err = validate([
        checkUnknownFields(body, MESSAGE_ALLOWED_FIELDS),
        checkFieldType(body, 'name', 'string'),
        checkFieldType(body, 'messageSort', 'string'),
        checkFieldType(body, 'messageType', 'string'),
        checkFieldType(body, 'source', 'string'),
        checkFieldType(body, 'target', 'string'),
        checkFieldType(body, 'diagramId', 'string'),
        checkFieldType(body, 'y', 'number'),
        checkFieldType(body, 'x', 'number'),
        checkFieldType(body, 'activationHeight', 'number'),
        checkFieldType(body, 'documentation', 'string')
    ].concat(messageModelFieldChecks(body)))
    if (err) {
        return validationError(err, reqInfo, body)
    }

    const signature = resolveMessageSignature(body)
    if (signature.error) {
        return validationError(signature.error, reqInfo, body)
    }

    const msgType = body.messageType || 'UMLMessage'
    if (VALID_MESSAGE_TYPES.indexOf(msgType) === -1) {
        return validationError('Invalid messageType "' + msgType + '". Allowed values: ' + VALID_MESSAGE_TYPES.join(', '), reqInfo, body)
    }

    if (body.messageSort !== undefined && VALID_MESSAGE_SORTS.indexOf(body.messageSort) === -1) {
        return validationError('Invalid messageSort "' + body.messageSort + '". Allowed values: ' + VALID_MESSAGE_SORTS.join(', '), reqInfo, body)
    }

    // Validate required fields based on messageType
    if (msgType === 'UMLFoundMessage') {
        if (!body.target) {
            return validationError('Field "target" is required for UMLFoundMessage (target lifeline ID)', reqInfo, body)
        }
    } else if (msgType === 'UMLLostMessage') {
        if (!body.source) {
            return validationError('Field "source" is required for UMLLostMessage (source lifeline ID)', reqInfo, body)
        }
    } else {
        if (!body.source) {
            return validationError('Field "source" is required (lifeline ID)', reqInfo, body)
        }
        if (!body.target) {
            return validationError('Field "target" is required (lifeline ID)', reqInfo, body)
        }
    }
    if (!body.diagramId) {
        return validationError('Field "diagramId" is required for message creation', reqInfo, body)
    }

    const interaction = findById(interactionId)
    if (!interaction || !(interaction instanceof type.UMLInteraction)) {
        return { success: false, error: 'Interaction not found: ' + interactionId, request: Object.assign({}, reqInfo, { body: body }) }
    }

    const diagram = findById(body.diagramId)
    if (!diagram || !(diagram instanceof type.UMLSequenceDiagram)) {
        return validationError('diagramId must refer to a UMLSequenceDiagram. Not found or wrong type: ' + body.diagramId, reqInfo, body)
    }

    const options = {
        id: msgType,
        parent: interaction,
        diagram: diagram,
        modelInitializer: function (m) {
            m.name = body.name || ''
            if (body.messageSort !== undefined) {
                m.messageSort = body.messageSort
            }
            if (body.documentation !== undefined) {
                m.documentation = body.documentation
            }
        }
    }

    // Set up source/target based on messageType
    if (msgType === 'UMLFoundMessage') {
        // FoundMessage: auto-created endpoint as source, target lifeline required
        const targetLifeline = findById(body.target)
        if (!targetLifeline || !(targetLifeline instanceof type.UMLLifeline)) {
            return validationError('target must refer to a UMLLifeline. Not found or wrong type: ' + body.target, reqInfo, body)
        }
        const headView = findViewOnDiagram(diagram, targetLifeline._id)
        if (!headView) {
            return validationError('target lifeline "' + targetLifeline.name + '" does not have a view on diagram "' + diagram.name + '"', reqInfo, body)
        }
        options.headModel = targetLifeline
        options.headView = headView
        // x1,y1 = endpoint position; x2,y2 = head position
        if (body.x !== undefined) { options.x1 = body.x }
        if (body.y !== undefined) {
            options.y1 = body.y
            options.y2 = body.y
        }
    } else if (msgType === 'UMLLostMessage') {
        // LostMessage: source lifeline required, auto-created endpoint as target
        const sourceLifeline = findById(body.source)
        if (!sourceLifeline || !(sourceLifeline instanceof type.UMLLifeline)) {
            return validationError('source must refer to a UMLLifeline. Not found or wrong type: ' + body.source, reqInfo, body)
        }
        const tailView = findViewOnDiagram(diagram, sourceLifeline._id)
        if (!tailView) {
            return validationError('source lifeline "' + sourceLifeline.name + '" does not have a view on diagram "' + diagram.name + '"', reqInfo, body)
        }
        options.tailModel = sourceLifeline
        options.tailView = tailView
        // x2,y2 = endpoint position
        if (body.x !== undefined) { options.x2 = body.x }
        if (body.y !== undefined) {
            options.y1 = body.y
            options.y2 = body.y
        }
    } else {
        // Regular UMLMessage: both source and target required
        const sourceLifeline = findById(body.source)
        if (!sourceLifeline || !(sourceLifeline instanceof type.UMLLifeline)) {
            return validationError('source must refer to a UMLLifeline. Not found or wrong type: ' + body.source, reqInfo, body)
        }
        const targetLifeline = findById(body.target)
        if (!targetLifeline || !(targetLifeline instanceof type.UMLLifeline)) {
            return validationError('target must refer to a UMLLifeline. Not found or wrong type: ' + body.target, reqInfo, body)
        }
        const tailView = findViewOnDiagram(diagram, sourceLifeline._id)
        const headView = findViewOnDiagram(diagram, targetLifeline._id)
        if (!tailView) {
            return validationError('source lifeline "' + sourceLifeline.name + '" does not have a view on diagram "' + diagram.name + '". Add the lifeline to the diagram first.', reqInfo, body)
        }
        if (!headView) {
            return validationError('target lifeline "' + targetLifeline.name + '" does not have a view on diagram "' + diagram.name + '". Add the lifeline to the diagram first.', reqInfo, body)
        }
        options.tailModel = sourceLifeline
        options.headModel = targetLifeline
        options.tailView = tailView
        options.headView = headView
        if (body.y !== undefined) {
            options.y1 = body.y
            options.y2 = body.y
        }
    }

    const view = app.factory.createModelAndView(options)
    if (!view || !view.model) {
        return { success: false, error: 'Failed to create message. StarUML factory returned null.', request: Object.assign({}, reqInfo, { body: body }) }
    }
    const msg = view.model

    const report = createWriteReport()
    applyMessageModelFields(report, msg, body, signature)

    // Resize activation bar if activationHeight is specified
    if (body.activationHeight !== undefined) {
        if (view.activation) {
            applyProperty(report, view.activation, 'height', body.activationHeight, 'activationHeight')
        } else {
            reportIgnoredWrite(report, 'activationHeight', body.activationHeight, undefined,
                'this message has no activation bar')
        }
    }

    autoExpandFrame(diagram)

    // Draw once so StarUML puts the new message at the list position its y
    // implies, rather than at the end of interaction.messages.
    arrangeDiagram(diagram)

    // Read the y back only after the frame settles, so the report describes
    // where the message actually is rather than where it was asked to go.
    if (body.y !== undefined) {
        reportMessageY(report, view, body.y)
    }

    const data = serializeMessage(msg)
    data.view = serializeMessageView(view)
    attachMessagePlace(data, msg)
    return attachWriteReport({
        success: true,
        message: appendWriteWarnings('Created ' + msgType + ' "' + (msg.name || msg._id) + '" with view on diagram "' + diagram.name + '"', report),
        request: Object.assign({}, reqInfo, { body: body }),
        data: data
    }, report)
}

/**
 * Where a message sits in its interaction's list, so a caller can check the
 * order without a second request.
 *
 * One function because three routes report it — create, update and get. Get was
 * left out at first while README's endpoint table said it was there, and the
 * live check written against that table could not compare two messages'
 * positions: one came from a PUT and the other from a GET that answered null.
 */
function attachMessagePlace(data, msg) {
    if (msg._parent && Array.isArray(msg._parent.messages)) {
        data.messageIndex = msg._parent.messages.indexOf(msg)
        data.messageCount = msg._parent.messages.length
    }
    return data
}

function getMessage(id, reqInfo) {
    const msg = findById(id)
    if (!msg || !(msg instanceof type.UMLMessage)) {
        return { success: false, error: 'Message not found: ' + id, request: reqInfo }
    }
    const data = serializeMessage(msg)
    const view = findMessageView(msg)
    if (view) {
        data.view = serializeMessageView(view)
    }
    attachMessagePlace(data, msg)
    return {
        success: true,
        message: 'Retrieved message "' + (msg.name || msg._id) + '"',
        request: reqInfo,
        data: data
    }
}

/**
 * Find the UMLSeqMessageView that draws a message. A message has one view per
 * diagram it appears on; sequence messages appear on exactly one.
 */
function findMessageView(msg) {
    const views = app.repository.getViewsOf(msg) || []
    for (let i = 0; i < views.length; i++) {
        if (typeof type !== 'undefined' && type.UMLSeqMessageView && views[i] instanceof type.UMLSeqMessageView) {
            return views[i]
        }
    }
    for (let i = 0; i < views.length; i++) {
        if (views[i].points) {
            return views[i]
        }
    }
    return null
}

/**
 * The loose end of a found or lost message. A regular message is anchored to a
 * lifeline at both ends, so it has none.
 */
function findFreeMessageEndpoint(view) {
    if (!view || typeof type === 'undefined' || !type.UMLMessageEndpointView) {
        return null
    }
    if (view.head instanceof type.UMLMessageEndpointView) {
        return view.head
    }
    if (view.tail instanceof type.UMLMessageEndpointView) {
        return view.tail
    }
    return null
}

function serializeMessageView(view) {
    if (!view) {
        return null
    }
    const result = { _id: view._id, _type: view.constructor.name }
    if (view.points && typeof view.points.count === 'function' && view.points.count() >= 2) {
        const first = view.points.getPoint(0)
        const last = view.points.getPoint(view.points.count() - 1)
        // points[0].y is the message's vertical position; every other point
        // derives from it during layout.
        result.y = first.y
        result.x1 = first.x
        result.y1 = first.y
        result.x2 = last.x
        result.y2 = last.y
    }
    if (view.activation && view.activation.height !== undefined) {
        result.activationHeight = view.activation.height
    }
    return result
}

/**
 * Move a sequence message vertically.
 *
 * UMLSeqMessageView is an EdgeView. Its arrangeObject() recomputes every point's
 * x from the lifelines and activations on each layout pass, but carries
 * points[0].y through unchanged — so y is the authoritative position and x is
 * not settable for a regular message. The whole polyline is shifted rather than
 * flattened, which keeps the shape of a self-message (4 points spanning
 * SELF_MESSAGE_HEIGHT).
 *
 * Sequence numbers need no fixing here: UMLSequenceDiagram.drawDiagram() calls
 * regulateSequenceNumber() on every message view, which reorders the model's
 * message list to match the new y.
 *
 * Returns the y actually stored, or null when the view has no usable points.
 */
function setMessageViewY(edgeView, y) {
    if (!edgeView || !edgeView.points || typeof edgeView.points.clear !== 'function') {
        return null
    }
    if (typeof edgeView.points.count !== 'function' || edgeView.points.count() < 2) {
        return null
    }

    const count = edgeView.points.count()
    const baseY = edgeView.points.getPoint(0).y
    const shifted = []
    for (let i = 0; i < count; i++) {
        const p = edgeView.points.getPoint(i)
        shifted.push(new type.Point(p.x, p.y - baseY + y))
    }

    // memento/diff/operationBuilder keeps the move on the undo stack,
    // the same pattern clearEdgeWaypoints uses.
    const memento = {}
    edgeView.assignTo(memento)

    edgeView.points.clear()
    for (let i = 0; i < shifted.length; i++) {
        edgeView.points.add(shifted[i])
    }

    const diffs = edgeView.diff(memento)
    edgeView.assignFrom(memento)

    if (diffs && diffs.length > 0) {
        const operationBuilder = app.repository.getOperationBuilder()
        operationBuilder.begin('move message')
        for (let i = 0; i < diffs.length; i++) {
            const d = diffs[i]
            operationBuilder.fieldAssign(d.elem, d.f, d.n)
        }
        operationBuilder.end()
        app.repository.doOperation(operationBuilder.getOperation())
    }

    return edgeView.points.getPoint(0).y
}

/**
 * The y a message view actually sits at, or null when it has no polyline to read.
 */
function messageViewY(edgeView) {
    if (!edgeView || !edgeView.points || typeof edgeView.points.count !== 'function') {
        return null
    }
    if (edgeView.points.count() < 1) {
        return null
    }
    return edgeView.points.getPoint(0).y
}

/**
 * Compare where a message view ended up against the y that was asked for, and
 * record the outcome. StarUML's sequence layout caps how far below the previous
 * message a new one may sit, so a requested y is often not the stored one — and
 * a create that does not check this reports success for two messages that now
 * overlap on a single line.
 */
function reportMessageY(report, edgeView, requestedY) {
    const actualY = messageViewY(edgeView)
    if (actualY === null) {
        reportIgnoredWrite(report, 'y', requestedY, null, 'message view has no polyline to read back')
    } else if (writeValuesEqual(actualY, requestedY)) {
        report.updated.push('y')
    } else {
        report.clamped.push({ field: 'y', requested: requestedY, actual: actualY })
    }
    return report
}

function updateMessage(id, body, reqInfo) {
    const err = validate([
        checkUnknownFields(body, MESSAGE_UPDATE_FIELDS),
        checkFieldType(body, 'name', 'string'),
        checkFieldType(body, 'messageSort', 'string'),
        checkFieldType(body, 'documentation', 'string'),
        checkFieldType(body, 'y', 'number'),
        checkFieldType(body, 'x', 'number'),
        checkFieldType(body, 'activationHeight', 'number')
    ].concat(messageModelFieldChecks(body)))
    if (err) {
        return validationError(err, reqInfo, body)
    }

    if (Object.keys(body).length === 0) {
        return validationError('At least one field must be provided. Allowed fields: ' + MESSAGE_UPDATE_FIELDS.join(', '), reqInfo, body)
    }

    if (body.messageSort !== undefined && VALID_MESSAGE_SORTS.indexOf(body.messageSort) === -1) {
        return validationError('Invalid messageSort "' + body.messageSort + '". Allowed values: ' + VALID_MESSAGE_SORTS.join(', '), reqInfo, body)
    }

    const signature = resolveMessageSignature(body)
    if (signature.error) {
        return validationError(signature.error, reqInfo, body)
    }

    const msg = findById(id)
    if (!msg || !(msg instanceof type.UMLMessage)) {
        return { success: false, error: 'Message not found: ' + id, request: Object.assign({}, reqInfo, { body: body }) }
    }

    const wantsGeometry = body.y !== undefined || body.x !== undefined || body.activationHeight !== undefined
    const view = wantsGeometry ? findMessageView(msg) : null
    if (wantsGeometry && !view) {
        return validationError('Message "' + (msg.name || msg._id) + '" has no view, so y, x and activationHeight cannot be set', reqInfo, body)
    }

    const report = createWriteReport()
    if (body.name !== undefined) {
        applyProperty(report, msg, 'name', body.name)
    }
    if (body.messageSort !== undefined) {
        applyProperty(report, msg, 'messageSort', body.messageSort)
    }
    if (body.documentation !== undefined) {
        applyProperty(report, msg, 'documentation', body.documentation)
    }
    applyMessageModelFields(report, msg, body, signature)

    if (body.y !== undefined) {
        const actualY = setMessageViewY(view, body.y)
        if (actualY === null) {
            reportIgnoredWrite(report, 'y', body.y, null, 'message view has no polyline to move')
        } else if (writeValuesEqual(actualY, body.y)) {
            report.updated.push('y')
        } else {
            report.clamped.push({ field: 'y', requested: body.y, actual: actualY })
        }
    }

    if (body.x !== undefined) {
        // Only a found/lost message has a free endpoint whose x survives layout.
        // For a regular message every x is recomputed from the lifelines.
        const endpoint = findFreeMessageEndpoint(view)
        if (endpoint) {
            applyProperty(report, endpoint, 'left', body.x, 'x')
        } else {
            const current = view.points && view.points.count() >= 1 ? view.points.getPoint(0).x : null
            reportIgnoredWrite(report, 'x', body.x, current,
                'a regular message takes its x from the lifelines on every layout pass; only UMLFoundMessage/UMLLostMessage have a settable endpoint x')
        }
    }

    if (body.activationHeight !== undefined) {
        if (view.activation) {
            applyProperty(report, view.activation, 'height', body.activationHeight, 'activationHeight')
        } else {
            reportIgnoredWrite(report, 'activationHeight', body.activationHeight, null, 'this message has no activation bar')
        }
    }

    // Moving a message changes where it belongs in interaction.messages, and
    // that list is what a reader of the .mdj sees as the message order.
    // UMLSequenceDiagram.drawDiagram() is what re-sorts it — nothing else does —
    // so draw the diagram before answering. Without this the API reported a
    // successful move while the saved order stayed as it was, and the caller had
    // to walk the list one PUT /api/elements/:id/reorder at a time.
    if (body.y !== undefined) {
        arrangeDiagram(diagramOfView(view))
    }

    const data = serializeMessage(msg)
    const msgView = view || findMessageView(msg)
    if (msgView) {
        data.view = serializeMessageView(msgView)
    }
    attachMessagePlace(data, msg)

    return attachWriteReport({
        success: true,
        message: writeReportMessage('Updated message "' + (msg.name || msg._id) + '"', report),
        request: Object.assign({}, reqInfo, { body: body }),
        data: data
    }, report)
}

function deleteMessage(id, reqInfo) {
    const msg = findById(id)
    if (!msg || !(msg instanceof type.UMLMessage)) {
        return { success: false, error: 'Message not found: ' + id, request: reqInfo }
    }
    const name = msg.name || msg._id
    app.engine.deleteElements([msg], [])
    return {
        success: true,
        message: 'Deleted message "' + name + '"',
        request: reqInfo,
        data: { deleted: id, name: name }
    }
}

// --- Combined Fragments ---

function getCombinedFragments(interactionId, reqInfo) {
    const interaction = findById(interactionId)
    if (!interaction || !(interaction instanceof type.UMLInteraction)) {
        return { success: false, error: 'Interaction not found: ' + interactionId, request: reqInfo }
    }
    const fragments = (interaction.fragments || []).filter(function (f) {
        return f instanceof type.UMLCombinedFragment
    })
    return {
        success: true,
        message: 'Retrieved ' + fragments.length + ' combined fragment(s) from interaction "' + interaction.name + '"',
        request: reqInfo,
        data: fragments.map(function (f) { return serializeCombinedFragment(f) })
    }
}

function createCombinedFragment(interactionId, body, reqInfo) {
    const err = validate([
        checkUnknownFields(body, COMBINED_FRAGMENT_ALLOWED_FIELDS),
        checkFieldType(body, 'name', 'string'),
        checkFieldType(body, 'interactionOperator', 'string'),
        checkFieldType(body, 'diagramId', 'string'),
        checkFieldType(body, 'x', 'number'),
        checkFieldType(body, 'y', 'number'),
        checkFieldType(body, 'width', 'number'),
        checkFieldType(body, 'height', 'number'),
        checkFieldType(body, 'documentation', 'string')
    ])
    if (err) {
        return validationError(err, reqInfo, body)
    }

    if (body.interactionOperator !== undefined && VALID_INTERACTION_OPERATORS.indexOf(body.interactionOperator) === -1) {
        return validationError('Invalid interactionOperator "' + body.interactionOperator + '". Allowed values: ' + VALID_INTERACTION_OPERATORS.join(', '), reqInfo, body)
    }

    const interaction = findById(interactionId)
    if (!interaction || !(interaction instanceof type.UMLInteraction)) {
        return { success: false, error: 'Interaction not found: ' + interactionId, request: Object.assign({}, reqInfo, { body: body }) }
    }

    if (body.diagramId) {
        const diagram = findById(body.diagramId)
        if (!diagram || !(diagram instanceof type.UMLSequenceDiagram)) {
            return validationError('diagramId must refer to a UMLSequenceDiagram. Not found or wrong type: ' + body.diagramId, reqInfo, body)
        }
        const cfX = body.x !== undefined ? body.x : 50
        const cfY = body.y !== undefined ? body.y : 100
        const cfW = body.width !== undefined ? body.width : 350
        const cfH = body.height !== undefined ? body.height : 200
        const options = {
            id: 'UMLCombinedFragment',
            parent: interaction,
            diagram: diagram,
            x1: cfX,
            y1: cfY,
            x2: cfX + cfW,
            y2: cfY + cfH,
            modelInitializer: function (m) {
                m.name = body.name || ''
                if (body.interactionOperator !== undefined) {
                    m.interactionOperator = body.interactionOperator
                }
                if (body.documentation !== undefined) {
                    m.documentation = body.documentation
                }
            }
        }
        let view
        try {
            view = app.factory.createModelAndView(options)
        } catch (e) {
            return { success: false, error: 'Failed to create combined fragment: ' + (e.message || String(e)), request: Object.assign({}, reqInfo, { body: body }) }
        }
        if (!view || !view.model) {
            return { success: false, error: 'Failed to create combined fragment view on diagram. StarUML factory returned null.', request: Object.assign({}, reqInfo, { body: body }) }
        }
        autoExpandFrame(diagram)
        return {
            success: true,
            message: 'Created combined fragment "' + (view.model.name || view.model.interactionOperator) + '" with view on diagram "' + diagram.name + '"',
            request: Object.assign({}, reqInfo, { body: body }),
            data: serializeCombinedFragment(view.model)
        }
    }

    const fragment = app.factory.createModel({
        id: 'UMLCombinedFragment',
        parent: interaction,
        field: 'fragments',
        modelInitializer: function (m) {
            m.name = body.name || ''
            if (body.interactionOperator !== undefined) {
                m.interactionOperator = body.interactionOperator
            }
            if (body.documentation !== undefined) {
                m.documentation = body.documentation
            }
        }
    })

    return {
        success: true,
        message: 'Created combined fragment "' + (fragment.name || fragment.interactionOperator) + '"',
        request: Object.assign({}, reqInfo, { body: body }),
        data: serializeCombinedFragment(fragment)
    }
}

function getCombinedFragment(id, reqInfo) {
    const fragment = findById(id)
    if (!fragment || !(fragment instanceof type.UMLCombinedFragment)) {
        return { success: false, error: 'Combined fragment not found: ' + id, request: reqInfo }
    }
    return {
        success: true,
        message: 'Retrieved combined fragment "' + (fragment.name || fragment.interactionOperator) + '"',
        request: reqInfo,
        data: serializeCombinedFragment(fragment)
    }
}

function updateCombinedFragment(id, body, reqInfo) {
    const err = validate([
        checkUnknownFields(body, COMBINED_FRAGMENT_UPDATE_FIELDS),
        checkFieldType(body, 'name', 'string'),
        checkFieldType(body, 'interactionOperator', 'string'),
        checkFieldType(body, 'documentation', 'string')
    ])
    if (err) {
        return validationError(err, reqInfo, body)
    }

    if (Object.keys(body).length === 0) {
        return validationError('At least one field must be provided. Allowed fields: ' + COMBINED_FRAGMENT_UPDATE_FIELDS.join(', '), reqInfo, body)
    }

    if (body.interactionOperator !== undefined && VALID_INTERACTION_OPERATORS.indexOf(body.interactionOperator) === -1) {
        return validationError('Invalid interactionOperator "' + body.interactionOperator + '". Allowed values: ' + VALID_INTERACTION_OPERATORS.join(', '), reqInfo, body)
    }

    const fragment = findById(id)
    if (!fragment || !(fragment instanceof type.UMLCombinedFragment)) {
        return { success: false, error: 'Combined fragment not found: ' + id, request: Object.assign({}, reqInfo, { body: body }) }
    }

    const report = createWriteReport()
    if (body.name !== undefined) {
        applyProperty(report, fragment, 'name', body.name)
    }
    if (body.interactionOperator !== undefined) {
        applyProperty(report, fragment, 'interactionOperator', body.interactionOperator)
    }
    if (body.documentation !== undefined) {
        applyProperty(report, fragment, 'documentation', body.documentation)
    }

    return attachWriteReport({
        success: true,
        message: writeReportMessage('Updated combined fragment "' + (fragment.name || fragment.interactionOperator) + '"', report),
        request: Object.assign({}, reqInfo, { body: body }),
        data: serializeCombinedFragment(fragment)
    }, report)
}

function deleteCombinedFragment(id, reqInfo) {
    const fragment = findById(id)
    if (!fragment || !(fragment instanceof type.UMLCombinedFragment)) {
        return { success: false, error: 'Combined fragment not found: ' + id, request: reqInfo }
    }
    const name = fragment.name || fragment.interactionOperator
    // Cascade delete: operands are children and will be deleted with the fragment
    app.engine.deleteElements([fragment], [])
    return {
        success: true,
        message: 'Deleted combined fragment "' + name + '" (operands cascade deleted)',
        request: reqInfo,
        data: { deleted: id, name: name }
    }
}

// --- Interaction Operands ---

function getOperands(fragmentId, reqInfo) {
    const fragment = findById(fragmentId)
    if (!fragment || !(fragment instanceof type.UMLCombinedFragment)) {
        return { success: false, error: 'Combined fragment not found: ' + fragmentId, request: reqInfo }
    }
    const operands = fragment.operands || []
    return {
        success: true,
        message: 'Retrieved ' + operands.length + ' operand(s) from combined fragment "' + (fragment.name || fragment.interactionOperator) + '"',
        request: reqInfo,
        data: operands.map(function (op) { return serializeInteractionOperand(op) })
    }
}

function createOperand(fragmentId, body, reqInfo) {
    const err = validate([
        checkUnknownFields(body, OPERAND_ALLOWED_FIELDS),
        checkFieldType(body, 'name', 'string'),
        checkFieldType(body, 'guard', 'string'),
        checkFieldType(body, 'documentation', 'string')
    ])
    if (err) {
        return validationError(err, reqInfo, body)
    }

    const fragment = findById(fragmentId)
    if (!fragment || !(fragment instanceof type.UMLCombinedFragment)) {
        return { success: false, error: 'Combined fragment not found: ' + fragmentId, request: Object.assign({}, reqInfo, { body: body }) }
    }

    const operand = app.factory.createModel({
        id: 'UMLInteractionOperand',
        parent: fragment,
        field: 'operands',
        modelInitializer: function (m) {
            m.name = body.name || ''
            if (body.guard !== undefined) {
                m.guard = body.guard
            }
            if (body.documentation !== undefined) {
                m.documentation = body.documentation
            }
        }
    })

    return {
        success: true,
        message: 'Created operand on combined fragment "' + (fragment.name || fragment.interactionOperator) + '"',
        request: Object.assign({}, reqInfo, { body: body }),
        data: serializeInteractionOperand(operand)
    }
}

function getOperand(id, reqInfo) {
    const operand = findById(id)
    if (!operand || !(operand instanceof type.UMLInteractionOperand)) {
        return { success: false, error: 'Operand not found: ' + id, request: reqInfo }
    }
    return {
        success: true,
        message: 'Retrieved operand "' + (operand.name || operand.guard || operand._id) + '"',
        request: reqInfo,
        data: serializeInteractionOperand(operand)
    }
}

function updateOperand(id, body, reqInfo) {
    const err = validate([
        checkUnknownFields(body, OPERAND_UPDATE_FIELDS),
        checkFieldType(body, 'name', 'string'),
        checkFieldType(body, 'guard', 'string'),
        checkFieldType(body, 'documentation', 'string')
    ])
    if (err) {
        return validationError(err, reqInfo, body)
    }

    if (Object.keys(body).length === 0) {
        return validationError('At least one field must be provided. Allowed fields: ' + OPERAND_UPDATE_FIELDS.join(', '), reqInfo, body)
    }

    const operand = findById(id)
    if (!operand || !(operand instanceof type.UMLInteractionOperand)) {
        return { success: false, error: 'Operand not found: ' + id, request: Object.assign({}, reqInfo, { body: body }) }
    }

    const report = createWriteReport()
    if (body.name !== undefined) {
        applyProperty(report, operand, 'name', body.name)
    }
    if (body.guard !== undefined) {
        applyProperty(report, operand, 'guard', body.guard)
    }
    if (body.documentation !== undefined) {
        applyProperty(report, operand, 'documentation', body.documentation)
    }

    return attachWriteReport({
        success: true,
        message: writeReportMessage('Updated operand "' + (operand.name || operand.guard || operand._id) + '"', report),
        request: Object.assign({}, reqInfo, { body: body }),
        data: serializeInteractionOperand(operand)
    }, report)
}

function deleteOperand(id, reqInfo) {
    const operand = findById(id)
    if (!operand || !(operand instanceof type.UMLInteractionOperand)) {
        return { success: false, error: 'Operand not found: ' + id, request: reqInfo }
    }

    // Check: parent fragment must have at least 2 operands to allow deletion
    const parent = operand._parent
    if (parent && parent.operands && parent.operands.length <= 1) {
        return validationError(
            'Cannot delete the last operand of combined fragment "' + (parent.name || parent.interactionOperator) + '". A combined fragment must have at least one operand.',
            reqInfo
        )
    }

    const name = operand.name || operand.guard || operand._id
    app.engine.deleteElements([operand], [])
    return {
        success: true,
        message: 'Deleted operand "' + name + '"',
        request: reqInfo,
        data: { deleted: id, name: name }
    }
}

// --- State Invariants ---

function getStateInvariants(interactionId, reqInfo) {
    const interaction = findById(interactionId)
    if (!interaction || !(interaction instanceof type.UMLInteraction)) {
        return { success: false, error: 'Interaction not found: ' + interactionId, request: reqInfo }
    }
    const stateInvariants = (interaction.fragments || []).filter(function (f) {
        return f instanceof type.UMLStateInvariant
    })
    return {
        success: true,
        message: 'Retrieved ' + stateInvariants.length + ' state invariant(s) from interaction "' + interaction.name + '"',
        request: reqInfo,
        data: stateInvariants.map(function (si) { return serializeStateInvariant(si) })
    }
}

function createStateInvariant(interactionId, body, reqInfo) {
    const err = validate([
        checkUnknownFields(body, STATE_INVARIANT_ALLOWED_FIELDS),
        checkFieldType(body, 'name', 'string'),
        checkFieldType(body, 'covered', 'string'),
        checkFieldType(body, 'invariant', 'string'),
        checkFieldType(body, 'diagramId', 'string'),
        checkFieldType(body, 'x', 'number'),
        checkFieldType(body, 'y', 'number'),
        checkFieldType(body, 'documentation', 'string')
    ])
    if (err) {
        return validationError(err, reqInfo, body)
    }

    const interaction = findById(interactionId)
    if (!interaction || !(interaction instanceof type.UMLInteraction)) {
        return { success: false, error: 'Interaction not found: ' + interactionId, request: Object.assign({}, reqInfo, { body: body }) }
    }

    if (body.diagramId) {
        const diagram = findById(body.diagramId)
        if (!diagram || !(diagram instanceof type.UMLSequenceDiagram)) {
            return validationError('diagramId must refer to a UMLSequenceDiagram. Not found or wrong type: ' + body.diagramId, reqInfo, body)
        }
        if (!body.covered) {
            return validationError('Field "covered" (lifeline ID) is required when creating a state invariant with a diagram view', reqInfo, body)
        }
        const coveredLifeline = findById(body.covered)
        if (!coveredLifeline || !(coveredLifeline instanceof type.UMLLifeline)) {
            return validationError('covered must refer to a UMLLifeline. Not found or wrong type: ' + body.covered, reqInfo, body)
        }
        const lifelineView = findViewOnDiagram(diagram, coveredLifeline._id)
        if (!lifelineView) {
            return validationError('Covered lifeline "' + coveredLifeline.name + '" does not have a view on diagram "' + diagram.name + '".', reqInfo, body)
        }
        const siX = body.x !== undefined ? body.x : lifelineView.left
        const siY = body.y !== undefined ? body.y : 200
        const options = {
            id: 'UMLStateInvariant',
            parent: interaction,
            diagram: diagram,
            field: 'fragments',
            headModel: coveredLifeline,
            headView: lifelineView,
            x1: siX,
            y1: siY,
            x2: siX + 100,
            y2: siY + 50,
            modelInitializer: function (m) {
                m.name = body.name || ''
                m.covered = coveredLifeline
                if (body.invariant !== undefined) {
                    m.invariant = body.invariant
                }
                if (body.documentation !== undefined) {
                    m.documentation = body.documentation
                }
            }
        }
        let view
        try {
            view = app.factory.createModelAndView(options)
        } catch (e) {
            return { success: false, error: 'Failed to create state invariant: ' + (e.message || String(e)), request: Object.assign({}, reqInfo, { body: body }) }
        }
        if (!view || !view.model) {
            return { success: false, error: 'Failed to create state invariant view on diagram. StarUML factory returned null.', request: Object.assign({}, reqInfo, { body: body }) }
        }
        autoExpandFrame(diagram)
        return {
            success: true,
            message: 'Created state invariant "' + (view.model.name || view.model._id) + '" with view on diagram',
            request: Object.assign({}, reqInfo, { body: body }),
            data: serializeStateInvariant(view.model)
        }
    }

    const si = app.factory.createModel({
        id: 'UMLStateInvariant',
        parent: interaction,
        field: 'fragments',
        modelInitializer: function (m) {
            m.name = body.name || ''
            if (body.covered) {
                m.covered = findById(body.covered)
            }
            if (body.invariant !== undefined) {
                m.invariant = body.invariant
            }
            if (body.documentation !== undefined) {
                m.documentation = body.documentation
            }
        }
    })

    if (!si) {
        return { success: false, error: 'Failed to create state invariant. Try providing diagramId to create with a diagram context.', request: Object.assign({}, reqInfo, { body: body }) }
    }

    return {
        success: true,
        message: 'Created state invariant "' + (si.name || si._id) + '"',
        request: Object.assign({}, reqInfo, { body: body }),
        data: serializeStateInvariant(si)
    }
}

function getStateInvariant(id, reqInfo) {
    const si = findById(id)
    if (!si || !(si instanceof type.UMLStateInvariant)) {
        return { success: false, error: 'State invariant not found: ' + id, request: reqInfo }
    }
    return {
        success: true,
        message: 'Retrieved state invariant "' + (si.name || si._id) + '"',
        request: reqInfo,
        data: serializeStateInvariant(si)
    }
}

function updateStateInvariant(id, body, reqInfo) {
    const err = validate([
        checkUnknownFields(body, STATE_INVARIANT_UPDATE_FIELDS),
        checkFieldType(body, 'name', 'string'),
        checkFieldType(body, 'covered', 'string'),
        checkFieldType(body, 'invariant', 'string'),
        checkFieldType(body, 'documentation', 'string')
    ])
    if (err) {
        return validationError(err, reqInfo, body)
    }

    if (Object.keys(body).length === 0) {
        return validationError('At least one field must be provided. Allowed fields: ' + STATE_INVARIANT_UPDATE_FIELDS.join(', '), reqInfo, body)
    }

    const si = findById(id)
    if (!si || !(si instanceof type.UMLStateInvariant)) {
        return { success: false, error: 'State invariant not found: ' + id, request: Object.assign({}, reqInfo, { body: body }) }
    }

    if (body.covered !== undefined) {
        const coveredLifeline = findById(body.covered)
        if (!coveredLifeline || !(coveredLifeline instanceof type.UMLLifeline)) {
            return validationError('covered must refer to a UMLLifeline. Not found or wrong type: ' + body.covered, reqInfo, body)
        }
    }

    const report = createWriteReport()
    if (body.name !== undefined) {
        applyProperty(report, si, 'name', body.name)
    }
    if (body.covered !== undefined) {
        const coveredRef = findById(body.covered)
        applyProperty(report, si, 'covered', coveredRef)
    }
    if (body.invariant !== undefined) {
        applyProperty(report, si, 'invariant', body.invariant)
    }
    if (body.documentation !== undefined) {
        applyProperty(report, si, 'documentation', body.documentation)
    }

    return attachWriteReport({
        success: true,
        message: writeReportMessage('Updated state invariant "' + (si.name || si._id) + '"', report),
        request: Object.assign({}, reqInfo, { body: body }),
        data: serializeStateInvariant(si)
    }, report)
}

function deleteStateInvariant(id, reqInfo) {
    const si = findById(id)
    if (!si || !(si instanceof type.UMLStateInvariant)) {
        return { success: false, error: 'State invariant not found: ' + id, request: reqInfo }
    }
    const name = si.name || si._id
    app.engine.deleteElements([si], [])
    return {
        success: true,
        message: 'Deleted state invariant "' + name + '"',
        request: reqInfo,
        data: { deleted: id, name: name }
    }
}

// --- Interaction Uses ---

function getInteractionUses(interactionId, reqInfo) {
    const interaction = findById(interactionId)
    if (!interaction || !(interaction instanceof type.UMLInteraction)) {
        return { success: false, error: 'Interaction not found: ' + interactionId, request: reqInfo }
    }
    const interactionUses = (interaction.fragments || []).filter(function (f) {
        return f instanceof type.UMLInteractionUse
    })
    return {
        success: true,
        message: 'Retrieved ' + interactionUses.length + ' interaction use(s) from interaction "' + interaction.name + '"',
        request: reqInfo,
        data: interactionUses.map(function (iu) { return serializeInteractionUse(iu) })
    }
}

function createInteractionUse(interactionId, body, reqInfo) {
    const err = validate([
        checkUnknownFields(body, INTERACTION_USE_ALLOWED_FIELDS),
        checkFieldType(body, 'name', 'string'),
        checkFieldType(body, 'refersTo', 'string'),
        checkFieldType(body, 'arguments', 'string'),
        checkFieldType(body, 'returnValue', 'string'),
        checkFieldType(body, 'diagramId', 'string'),
        checkFieldType(body, 'x', 'number'),
        checkFieldType(body, 'y', 'number'),
        checkFieldType(body, 'width', 'number'),
        checkFieldType(body, 'height', 'number'),
        checkFieldType(body, 'documentation', 'string')
    ])
    if (err) {
        return validationError(err, reqInfo, body)
    }

    const interaction = findById(interactionId)
    if (!interaction || !(interaction instanceof type.UMLInteraction)) {
        return { success: false, error: 'Interaction not found: ' + interactionId, request: Object.assign({}, reqInfo, { body: body }) }
    }

    if (body.refersTo) {
        const refInteraction = findById(body.refersTo)
        if (!refInteraction || !(refInteraction instanceof type.UMLInteraction)) {
            return validationError('refersTo must refer to a UMLInteraction. Not found or wrong type: ' + body.refersTo, reqInfo, body)
        }
    }

    if (body.diagramId) {
        const diagram = findById(body.diagramId)
        if (!diagram || !(diagram instanceof type.UMLSequenceDiagram)) {
            return validationError('diagramId must refer to a UMLSequenceDiagram. Not found or wrong type: ' + body.diagramId, reqInfo, body)
        }
        const iuX = body.x !== undefined ? body.x : 50
        const iuY = body.y !== undefined ? body.y : 100
        const iuW = body.width !== undefined ? body.width : 350
        const iuH = body.height !== undefined ? body.height : 100
        const options = {
            id: 'UMLInteractionUse',
            parent: interaction,
            diagram: diagram,
            x1: iuX,
            y1: iuY,
            x2: iuX + iuW,
            y2: iuY + iuH,
            modelInitializer: function (m) {
                m.name = body.name || ''
                if (body.refersTo) {
                    m.refersTo = findById(body.refersTo)
                }
                if (body.arguments !== undefined) {
                    m.arguments = body.arguments
                }
                if (body.returnValue !== undefined) {
                    m.returnValue = body.returnValue
                }
                if (body.documentation !== undefined) {
                    m.documentation = body.documentation
                }
            }
        }
        let view
        try {
            view = app.factory.createModelAndView(options)
        } catch (e) {
            return { success: false, error: 'Failed to create interaction use: ' + (e.message || String(e)), request: Object.assign({}, reqInfo, { body: body }) }
        }
        if (!view || !view.model) {
            return { success: false, error: 'Failed to create interaction use view on diagram. StarUML factory returned null.', request: Object.assign({}, reqInfo, { body: body }) }
        }
        autoExpandFrame(diagram)
        return {
            success: true,
            message: 'Created interaction use "' + (view.model.name || view.model._id) + '" with view on diagram',
            request: Object.assign({}, reqInfo, { body: body }),
            data: serializeInteractionUse(view.model)
        }
    }

    const iu = app.factory.createModel({
        id: 'UMLInteractionUse',
        parent: interaction,
        field: 'fragments',
        modelInitializer: function (m) {
            m.name = body.name || ''
            if (body.refersTo) {
                m.refersTo = findById(body.refersTo)
            }
            if (body.arguments !== undefined) {
                m.arguments = body.arguments
            }
            if (body.returnValue !== undefined) {
                m.returnValue = body.returnValue
            }
            if (body.documentation !== undefined) {
                m.documentation = body.documentation
            }
        }
    })

    if (!iu) {
        return { success: false, error: 'Failed to create interaction use. StarUML factory returned null.', request: Object.assign({}, reqInfo, { body: body }) }
    }

    return {
        success: true,
        message: 'Created interaction use "' + (iu.name || iu._id) + '"',
        request: Object.assign({}, reqInfo, { body: body }),
        data: serializeInteractionUse(iu)
    }
}

function getInteractionUse(id, reqInfo) {
    const iu = findById(id)
    if (!iu || !(iu instanceof type.UMLInteractionUse)) {
        return { success: false, error: 'Interaction use not found: ' + id, request: reqInfo }
    }
    return {
        success: true,
        message: 'Retrieved interaction use "' + (iu.name || iu._id) + '"',
        request: reqInfo,
        data: serializeInteractionUse(iu)
    }
}

function updateInteractionUse(id, body, reqInfo) {
    const err = validate([
        checkUnknownFields(body, INTERACTION_USE_UPDATE_FIELDS),
        checkFieldType(body, 'name', 'string'),
        checkFieldType(body, 'refersTo', 'string'),
        checkFieldType(body, 'arguments', 'string'),
        checkFieldType(body, 'returnValue', 'string'),
        checkFieldType(body, 'documentation', 'string')
    ])
    if (err) {
        return validationError(err, reqInfo, body)
    }

    if (Object.keys(body).length === 0) {
        return validationError('At least one field must be provided. Allowed fields: ' + INTERACTION_USE_UPDATE_FIELDS.join(', '), reqInfo, body)
    }

    const iu = findById(id)
    if (!iu || !(iu instanceof type.UMLInteractionUse)) {
        return { success: false, error: 'Interaction use not found: ' + id, request: Object.assign({}, reqInfo, { body: body }) }
    }

    if (body.refersTo !== undefined) {
        const refInteraction = findById(body.refersTo)
        if (!refInteraction || !(refInteraction instanceof type.UMLInteraction)) {
            return validationError('refersTo must refer to a UMLInteraction. Not found or wrong type: ' + body.refersTo, reqInfo, body)
        }
    }

    const report = createWriteReport()
    if (body.name !== undefined) {
        applyProperty(report, iu, 'name', body.name)
    }
    if (body.refersTo !== undefined) {
        const refTarget = findById(body.refersTo)
        applyProperty(report, iu, 'refersTo', refTarget)
    }
    if (body.arguments !== undefined) {
        applyProperty(report, iu, 'arguments', body.arguments)
    }
    if (body.returnValue !== undefined) {
        applyProperty(report, iu, 'returnValue', body.returnValue)
    }
    if (body.documentation !== undefined) {
        applyProperty(report, iu, 'documentation', body.documentation)
    }

    return attachWriteReport({
        success: true,
        message: writeReportMessage('Updated interaction use "' + (iu.name || iu._id) + '"', report),
        request: Object.assign({}, reqInfo, { body: body }),
        data: serializeInteractionUse(iu)
    }, report)
}

function deleteInteractionUse(id, reqInfo) {
    const iu = findById(id)
    if (!iu || !(iu instanceof type.UMLInteractionUse)) {
        return { success: false, error: 'Interaction use not found: ' + id, request: reqInfo }
    }
    const name = iu.name || iu._id
    app.engine.deleteElements([iu], [])
    return {
        success: true,
        message: 'Deleted interaction use "' + name + '"',
        request: reqInfo,
        data: { deleted: id, name: name }
    }
}

// --- Generic Element ---

// ============================================================
// Generic / Cross-diagram Handlers
// ============================================================

// --- All Diagrams ---

function getAllDiagrams(query, reqInfo) {
    const allowedParams = ['type']
    const unknownParams = Object.keys(query).filter(function (k) {
        return allowedParams.indexOf(k) === -1
    })
    if (unknownParams.length > 0) {
        return validationError('Unknown query parameter(s): ' + unknownParams.join(', ') + '. Allowed: ' + allowedParams.join(', '), reqInfo)
    }

    let diagrams = app.repository.select('@Diagram')

    if (query.type) {
        diagrams = diagrams.filter(function (d) {
            return d.constructor.name === query.type
        })
    }

    return {
        success: true,
        message: 'Retrieved ' + diagrams.length + ' diagram(s)',
        request: reqInfo,
        data: diagrams.map(function (d) { return serializeGenericDiagram(d) })
    }
}

// --- Diagram Image Export ---

function exportDiagramImage(id, body, reqInfo) {
    const err = validate([
        checkUnknownFields(body, EXPORT_ALLOWED_FIELDS),
        checkFieldType(body, 'path', 'string'),
        checkFieldType(body, 'format', 'string')
    ])
    if (err) {
        return validationError(err, reqInfo, body)
    }

    if (!body.path) {
        return validationError('Field "path" is required', reqInfo, body)
    }

    const pathErr = checkNonEmptyString(body, 'path')
    if (pathErr) {
        return validationError(pathErr, reqInfo, body)
    }

    if (body.path.charAt(0) !== '/' && !/^[a-zA-Z]:[/\\]/.test(body.path)) {
        return validationError('Field "path" must be an absolute path', reqInfo, body)
    }

    const format = (body.format || 'png').toLowerCase()
    if (VALID_EXPORT_FORMATS.indexOf(format) === -1) {
        return validationError('Invalid format "' + body.format + '". Allowed: ' + VALID_EXPORT_FORMATS.join(', '), reqInfo, body)
    }

    const diagram = findById(id)
    if (!diagram || !diagram.ownedViews) {
        return { success: false, error: 'Diagram not found: ' + id, request: Object.assign({}, reqInfo, { body: body }) }
    }

    const reqInfoWithBody = Object.assign({}, reqInfo, { body: body })

    try {
        const nodePath = require('path')
        const appPath = app.getAppPath()
        const diagramExport = require(nodePath.join(appPath, 'src', 'engine', 'diagram-export'))

        if (format === 'pdf') {
            diagramExport.exportToPDF([diagram], body.path, { showName: true })
        } else if (format === 'svg') {
            diagramExport.exportToSVG(diagram, body.path)
        } else if (format === 'jpeg') {
            diagramExport.exportToJPEG(diagram, body.path)
        } else {
            diagramExport.exportToPNG(diagram, body.path)
        }

        return {
            success: true,
            message: 'Exported diagram "' + (diagram.name || id) + '" as ' + format + ' to "' + body.path + '"',
            request: reqInfoWithBody,
            data: { path: body.path, format: format }
        }
    } catch (e) {
        return {
            success: false,
            error: 'Failed to export diagram: ' + (e.message || String(e)),
            request: reqInfoWithBody
        }
    }
}

// --- Notes ---

function getDiagramNotes(diagramId, reqInfo) {
    const diagram = findById(diagramId)
    if (!diagram || !diagram.ownedViews) {
        return { success: false, error: 'Diagram not found: ' + diagramId, request: reqInfo }
    }
    const notes = diagram.ownedViews.filter(function (v) {
        return v.constructor.name === 'UMLNoteView'
    })
    return {
        success: true,
        message: 'Retrieved ' + notes.length + ' note(s) from diagram "' + (diagram.name || diagramId) + '"',
        request: reqInfo,
        data: notes.map(function (v) { return serializeNoteView(v) })
    }
}

function createNote(diagramId, body, reqInfo) {
    const err = validate([
        checkUnknownFields(body, NOTE_ALLOWED_FIELDS),
        checkFieldType(body, 'text', 'string'),
        checkFieldType(body, 'x1', 'number'),
        checkFieldType(body, 'y1', 'number'),
        checkFieldType(body, 'x2', 'number'),
        checkFieldType(body, 'y2', 'number')
    ])
    if (err) {
        return validationError(err, reqInfo, body)
    }

    const diagram = findById(diagramId)
    if (!diagram || !diagram.ownedViews) {
        return { success: false, error: 'Diagram not found: ' + diagramId, request: Object.assign({}, reqInfo, { body: body }) }
    }

    try {
        const noteX1 = body.x1 !== undefined ? body.x1 : 100
        const noteY1 = body.y1 !== undefined ? body.y1 : 100
        const view = app.factory.createModelAndView({
            id: 'Note',
            diagram: diagram,
            x1: noteX1,
            y1: noteY1,
            // x2/y2 default to a size measured from x1/y1. See createDiagramElement.
            x2: body.x2 !== undefined ? body.x2 : noteX1 + 150,
            y2: body.y2 !== undefined ? body.y2 : noteY1 + 80
        })

        if (!view) {
            return { success: false, error: 'Failed to create note. StarUML factory returned null.', request: Object.assign({}, reqInfo, { body: body }) }
        }

        const report = createWriteReport()
        if (body.text !== undefined) {
            applyProperty(report, view, 'text', body.text)
        }

        // Auto-expand frame to contain newly created note
        autoExpandFrame(diagram)

        return attachWriteReport({
            success: true,
            message: appendWriteWarnings('Created note on diagram "' + (diagram.name || diagramId) + '"', report),
            request: Object.assign({}, reqInfo, { body: body }),
            data: serializeNoteView(view)
        }, report)
    } catch (e) {
        return {
            success: false,
            error: 'Failed to create note: ' + (e.message || String(e)),
            request: Object.assign({}, reqInfo, { body: body })
        }
    }
}

function getNote(id, reqInfo) {
    const view = findById(id)
    if (!view || view.constructor.name !== 'UMLNoteView') {
        return { success: false, error: 'Note not found: ' + id, request: reqInfo }
    }
    return {
        success: true,
        message: 'Retrieved note',
        request: reqInfo,
        data: serializeNoteView(view)
    }
}

function updateNote(id, body, reqInfo) {
    const err = validate([
        checkUnknownFields(body, NOTE_UPDATE_FIELDS),
        checkFieldType(body, 'text', 'string')
    ])
    if (err) {
        return validationError(err, reqInfo, body)
    }

    if (Object.keys(body).length === 0) {
        return validationError('At least one field must be provided. Allowed fields: ' + NOTE_UPDATE_FIELDS.join(', '), reqInfo, body)
    }

    const view = findById(id)
    if (!view || view.constructor.name !== 'UMLNoteView') {
        return { success: false, error: 'Note not found: ' + id, request: Object.assign({}, reqInfo, { body: body }) }
    }

    const report = createWriteReport()
    if (body.text !== undefined) {
        applyProperty(report, view, 'text', body.text)
    }

    return attachWriteReport({
        success: true,
        message: writeReportMessage('Updated note', report),
        request: Object.assign({}, reqInfo, { body: body }),
        data: serializeNoteView(view)
    }, report)
}

function deleteNote(id, reqInfo) {
    const view = findById(id)
    if (!view || view.constructor.name !== 'UMLNoteView') {
        return { success: false, error: 'Note not found: ' + id, request: reqInfo }
    }
    app.engine.deleteElements([], [view])
    return {
        success: true,
        message: 'Deleted note',
        request: reqInfo,
        data: { deleted: id }
    }
}

// --- Note Links ---

function getDiagramNoteLinks(diagramId, reqInfo) {
    const diagram = findById(diagramId)
    if (!diagram || !diagram.ownedViews) {
        return { success: false, error: 'Diagram not found: ' + diagramId, request: reqInfo }
    }
    const links = diagram.ownedViews.filter(function (v) {
        return v.constructor.name === 'UMLNoteLinkView'
    })
    return {
        success: true,
        message: 'Retrieved ' + links.length + ' note link(s) from diagram "' + (diagram.name || diagramId) + '"',
        request: reqInfo,
        data: links.map(function (v) { return serializeNoteLinkView(v) })
    }
}

function createNoteLink(diagramId, body, reqInfo) {
    const err = validate([
        checkUnknownFields(body, NOTE_LINK_ALLOWED_FIELDS),
        checkFieldType(body, 'noteId', 'string'),
        checkFieldType(body, 'targetId', 'string')
    ])
    if (err) {
        return validationError(err, reqInfo, body)
    }

    if (!body.noteId) {
        return validationError('Field "noteId" is required', reqInfo, body)
    }
    if (!body.targetId) {
        return validationError('Field "targetId" is required', reqInfo, body)
    }

    const diagram = findById(diagramId)
    if (!diagram || !diagram.ownedViews) {
        return { success: false, error: 'Diagram not found: ' + diagramId, request: Object.assign({}, reqInfo, { body: body }) }
    }

    const noteView = findViewOnDiagramByAnyId(diagram, body.noteId)
    if (!noteView || noteView.constructor.name !== 'UMLNoteView') {
        return validationError('noteId must refer to a UMLNoteView on this diagram. Not found: ' + body.noteId, reqInfo, body)
    }

    const targetView = findViewOnDiagramByAnyId(diagram, body.targetId)
    if (!targetView) {
        return validationError('targetId must refer to a view on this diagram. Not found: ' + body.targetId, reqInfo, body)
    }

    let view
    try {
        view = app.factory.createModelAndView({
            id: 'NoteLink',
            diagram: diagram,
            tailView: noteView,
            headView: targetView
        })
    } catch (e) {
        return { success: false, error: 'Failed to create note link: ' + (e.message || String(e)), request: Object.assign({}, reqInfo, { body: body }) }
    }
    if (!view) {
        return { success: false, error: 'Failed to create note link. StarUML factory returned null.', request: Object.assign({}, reqInfo, { body: body }) }
    }

    return {
        success: true,
        message: 'Created note link on diagram "' + (diagram.name || diagramId) + '"',
        request: Object.assign({}, reqInfo, { body: body }),
        data: serializeNoteLinkView(view)
    }
}

function deleteNoteLink(id, reqInfo) {
    const view = findById(id)
    if (!view || view.constructor.name !== 'UMLNoteLinkView') {
        return { success: false, error: 'Note link not found: ' + id, request: reqInfo }
    }
    app.engine.deleteElements([], [view])
    return {
        success: true,
        message: 'Deleted note link',
        request: reqInfo,
        data: { deleted: id }
    }
}

// --- Free Lines ---

function getDiagramFreeLines(diagramId, reqInfo) {
    const diagram = findById(diagramId)
    if (!diagram || !diagram.ownedViews) {
        return { success: false, error: 'Diagram not found: ' + diagramId, request: reqInfo }
    }
    const lines = diagram.ownedViews.filter(function (v) {
        return v.constructor.name === 'FreelineEdgeView'
    })
    return {
        success: true,
        message: 'Retrieved ' + lines.length + ' free line(s) from diagram "' + (diagram.name || diagramId) + '"',
        request: reqInfo,
        data: lines.map(function (v) { return serializeFreeLineView(v) })
    }
}

function createFreeLine(diagramId, body, reqInfo) {
    const err = validate([
        checkUnknownFields(body, FREE_LINE_ALLOWED_FIELDS),
        checkFieldType(body, 'x1', 'number'),
        checkFieldType(body, 'y1', 'number'),
        checkFieldType(body, 'x2', 'number'),
        checkFieldType(body, 'y2', 'number')
    ])
    if (err) {
        return validationError(err, reqInfo, body)
    }

    const diagram = findById(diagramId)
    if (!diagram || !diagram.ownedViews) {
        return { success: false, error: 'Diagram not found: ' + diagramId, request: Object.assign({}, reqInfo, { body: body }) }
    }

    try {
        const lineX1 = body.x1 !== undefined ? body.x1 : 100
        const lineY1 = body.y1 !== undefined ? body.y1 : 100
        const view = app.factory.createModelAndView({
            id: 'FreeLine',
            diagram: diagram,
            x1: lineX1,
            y1: lineY1,
            // x2/y2 are this line's far end, defaulting to a length measured from
            // its start rather than to fixed coordinates. See createDiagramElement.
            x2: body.x2 !== undefined ? body.x2 : lineX1 + 200,
            y2: body.y2 !== undefined ? body.y2 : lineY1 + 100
        })

        if (!view) {
            return { success: false, error: 'Failed to create free line. StarUML factory returned null.', request: Object.assign({}, reqInfo, { body: body }) }
        }

        // Auto-expand frame to contain newly created free line
        autoExpandFrame(diagram)

        return {
            success: true,
            message: 'Created free line on diagram "' + (diagram.name || diagramId) + '"',
            request: Object.assign({}, reqInfo, { body: body }),
            data: serializeFreeLineView(view)
        }
    } catch (e) {
        return {
            success: false,
            error: 'Failed to create free line: ' + (e.message || String(e)),
            request: Object.assign({}, reqInfo, { body: body })
        }
    }
}

function deleteFreeLine(id, reqInfo) {
    const view = findById(id)
    if (!view || view.constructor.name !== 'FreelineEdgeView') {
        return { success: false, error: 'Free line not found: ' + id, request: reqInfo }
    }
    app.engine.deleteElements([], [view])
    return {
        success: true,
        message: 'Deleted free line',
        request: reqInfo,
        data: { deleted: id }
    }
}

// --- Shapes (view-only elements) ---

function serializeShapeView(view) {
    if (!view) {
        return null
    }
    const result = {
        _id: view._id,
        _type: view.constructor.name,
        shapeType: SHAPE_VIEW_TYPE_MAP[view.constructor.name] || view.constructor.name,
        left: view.left !== undefined ? view.left : 0,
        top: view.top !== undefined ? view.top : 0,
        width: view.width !== undefined ? view.width : 0,
        height: view.height !== undefined ? view.height : 0
    }
    if (view.text !== undefined) {
        result.text = view.text
    }
    if (view.model && view.model.url !== undefined) {
        result.url = view.model.url
    }
    if (view.model && view.model.reference !== undefined) {
        result.referenceId = view.model.reference ? view.model.reference._id : null
        if (view.model.reference && view.model.reference.name !== undefined) {
            result.referenceName = view.model.reference.name
        }
    }
    if (view.model && view.model.imageFile !== undefined) {
        result.imageFile = view.model.imageFile
    }
    return result
}

function getDiagramShapes(diagramId, reqInfo) {
    const diagram = findById(diagramId)
    if (!diagram || !diagram.ownedViews) {
        return { success: false, error: 'Diagram not found: ' + diagramId, request: reqInfo }
    }
    const shapes = diagram.ownedViews.filter(function (v) {
        return SHAPE_VIEW_TYPES.indexOf(v.constructor.name) !== -1
    })
    return {
        success: true,
        message: 'Retrieved ' + shapes.length + ' shape(s) from diagram "' + (diagram.name || diagramId) + '"',
        request: reqInfo,
        data: shapes.map(function (v) { return serializeShapeView(v) })
    }
}

function createShape(diagramId, body, reqInfo) {
    const err = validate([
        checkUnknownFields(body, SHAPE_CREATE_FIELDS),
        checkFieldType(body, 'type', 'string'),
        checkFieldType(body, 'text', 'string'),
        checkFieldType(body, 'url', 'string'),
        checkFieldType(body, 'referenceId', 'string|null'),
        checkFieldType(body, 'imageFile', 'string'),
        checkFieldType(body, 'x1', 'number'),
        checkFieldType(body, 'y1', 'number'),
        checkFieldType(body, 'x2', 'number'),
        checkFieldType(body, 'y2', 'number')
    ])
    if (err) {
        return validationError(err, reqInfo, body)
    }

    if (!body.type) {
        return validationError('Field "type" is required', reqInfo, body)
    }

    if (ALLOWED_SHAPE_TYPES.indexOf(body.type) === -1) {
        return validationError('Invalid shape type "' + body.type + '". Allowed: ' + ALLOWED_SHAPE_TYPES.join(', '), reqInfo, body)
    }

    if (body.referenceId !== undefined && body.type !== 'Hyperlink') {
        return validationError('Field "referenceId" is only supported for type "Hyperlink"', reqInfo, body)
    }

    const diagram = findById(diagramId)
    if (!diagram || !diagram.ownedViews) {
        return { success: false, error: 'Diagram not found: ' + diagramId, request: Object.assign({}, reqInfo, { body: body }) }
    }

    try {
        const shapeX1 = body.x1 !== undefined ? body.x1 : 100
        const shapeY1 = body.y1 !== undefined ? body.y1 : 100
        const createOptions = {
            id: body.type,
            diagram: diagram,
            x1: shapeX1,
            y1: shapeY1,
            // x2/y2 default to a size measured from x1/y1. See createDiagramElement.
            x2: body.x2 !== undefined ? body.x2 : shapeX1 + 100,
            y2: body.y2 !== undefined ? body.y2 : shapeY1 + 50
        }
        // Hyperlink creates a model element and requires a parent Model (the diagram owner)
        if (body.type === 'Hyperlink') {
            createOptions.parent = diagram._parent
        }
        const view = app.factory.createModelAndView(createOptions)

        const report = createWriteReport()
        if (body.text !== undefined) {
            if (body.type === 'Hyperlink') {
                // HyperlinkView has no text property; label is derived from model.url
                if (body.url === undefined) {
                    applyProperty(report, view.model, 'url', body.text, 'text')
                } else {
                    reportIgnoredWrite(report, 'text', body.text, body.url,
                        'a Hyperlink shows its url; url was given, so text is unused')
                }
            } else {
                applyProperty(report, view, 'text', body.text)
            }
        }
        // url, referenceId and imageFile need a model element behind the view.
        if (!view.model) {
            ['url', 'referenceId', 'imageFile'].forEach(function (f) {
                if (body[f] !== undefined) {
                    reportIgnoredWrite(report, f, body[f], undefined,
                        'shape type "' + body.type + '" creates a view with no model element')
                }
            })
        }
        if (body.url !== undefined && view.model) {
            applyProperty(report, view.model, 'url', body.url)
        }
        if (body.referenceId !== undefined && view.model) {
            if (body.referenceId === null) {
                applyProperty(report, view.model, 'reference', null, 'reference')
            } else {
                const refTarget = findById(body.referenceId)
                if (!refTarget) {
                    return { success: false, error: 'referenceId not found: ' + body.referenceId, request: Object.assign({}, reqInfo, { body: body }) }
                }
                applyProperty(report, view.model, 'reference', refTarget, 'reference')
            }
        }
        if (body.imageFile !== undefined && view.model) {
            applyProperty(report, view.model, 'imageFile', body.imageFile)
        }

        // Auto-expand frame to contain newly created shape
        autoExpandFrame(diagram)

        return attachWriteReport({
            success: true,
            message: appendWriteWarnings('Created shape "' + body.type + '" on diagram "' + (diagram.name || diagramId) + '"', report),
            request: Object.assign({}, reqInfo, { body: body }),
            data: serializeShapeView(view)
        }, report)
    } catch (e) {
        return {
            success: false,
            error: 'Failed to create shape: ' + (e.message || String(e)),
            request: Object.assign({}, reqInfo, { body: body })
        }
    }
}

function getShape(id, reqInfo) {
    const view = findById(id)
    if (!view || SHAPE_VIEW_TYPES.indexOf(view.constructor.name) === -1) {
        return { success: false, error: 'Shape not found: ' + id, request: reqInfo }
    }
    return {
        success: true,
        message: 'Retrieved shape',
        request: reqInfo,
        data: serializeShapeView(view)
    }
}

function updateShape(id, body, reqInfo) {
    const err = validate([
        checkUnknownFields(body, SHAPE_UPDATE_FIELDS),
        checkFieldType(body, 'text', 'string'),
        checkFieldType(body, 'url', 'string'),
        checkFieldType(body, 'referenceId', 'string|null'),
        checkFieldType(body, 'imageFile', 'string')
    ])
    if (err) {
        return validationError(err, reqInfo, body)
    }

    if (Object.keys(body).length === 0) {
        return validationError('At least one field must be provided. Allowed fields: ' + SHAPE_UPDATE_FIELDS.join(', '), reqInfo, body)
    }

    const view = findById(id)
    if (!view || SHAPE_VIEW_TYPES.indexOf(view.constructor.name) === -1) {
        return { success: false, error: 'Shape not found: ' + id, request: Object.assign({}, reqInfo, { body: body }) }
    }

    if (body.referenceId !== undefined && view.constructor.name !== 'HyperlinkView') {
        return validationError('Field "referenceId" is only supported for Hyperlink shapes', reqInfo, body)
    }

    const report = createWriteReport()
    if (body.text !== undefined) {
        applyProperty(report, view, 'text', body.text)
    }
    // url, reference and imageFile live on the shape's model. A view without a
    // model used to drop them without a word.
    const modelOnlyFields = ['url', 'referenceId', 'imageFile']
    if (!view.model) {
        modelOnlyFields.forEach(function (f) {
            if (body[f] !== undefined) {
                reportIgnoredWrite(report, f, body[f], null, 'this shape view has no model to store it on')
            }
        })
    }
    if (body.url !== undefined && view.model) {
        applyProperty(report, view.model, 'url', body.url)
    }
    if (body.referenceId !== undefined && view.model) {
        if (body.referenceId === null) {
            applyProperty(report, view.model, 'reference', null, 'reference')
        } else {
            const refTarget = findById(body.referenceId)
            if (!refTarget) {
                return { success: false, error: 'referenceId not found: ' + body.referenceId, request: Object.assign({}, reqInfo, { body: body }) }
            }
            applyProperty(report, view.model, 'reference', refTarget, 'reference')
        }
    }
    if (body.imageFile !== undefined && view.model) {
        applyProperty(report, view.model, 'imageFile', body.imageFile)
    }

    return attachWriteReport({
        success: true,
        message: writeReportMessage('Updated shape', report),
        request: Object.assign({}, reqInfo, { body: body }),
        data: serializeShapeView(view)
    }, report)
}

function deleteShape(id, reqInfo) {
    const view = findById(id)
    if (!view || SHAPE_VIEW_TYPES.indexOf(view.constructor.name) === -1) {
        return { success: false, error: 'Shape not found: ' + id, request: reqInfo }
    }
    app.engine.deleteElements([], [view])
    return {
        success: true,
        message: 'Deleted shape',
        request: reqInfo,
        data: { deleted: id }
    }
}

// --- Views (Move/Resize) ---

function getDiagramViews(diagramId, reqInfo) {
    const diagram = findById(diagramId)
    if (!diagram || !diagram.ownedViews) {
        return { success: false, error: 'Diagram not found: ' + diagramId, request: reqInfo }
    }
    const views = diagram.ownedViews
    return {
        success: true,
        message: 'Retrieved ' + views.length + ' view(s) from diagram "' + (diagram.name || diagramId) + '"',
        request: reqInfo,
        data: views.map(function (v) { return serializeViewInfo(v) })
    }
}

/**
 * Describe one sub-view, adding the fields that only matter for nested views:
 * which named slot it fills on its parent, and its label text.
 */
function serializeSubView(view, parent) {
    const info = serializeViewInfo(view)
    const namedSlots = ['nameLabel', 'stereotypeLabel', 'propertyLabel', 'qualifierLabel',
        'multiplicityLabel', 'roleNameLabel', 'frameTypeLabel', 'activation']
    for (let i = 0; i < namedSlots.length; i++) {
        if (parent && parent[namedSlots[i]] === view) {
            info.role = namedSlots[i]
            break
        }
    }
    if (view.text !== undefined) {
        info.text = view.text
    }
    if (view.visible !== undefined) {
        info.visible = view.visible
    }
    if (view.model) {
        info.modelId = view.model._id
    }
    info._parentId = parent ? parent._id : null
    return info
}

/**
 * List the views nested inside a view.
 *
 * GET /api/diagrams/:id/views only returns a diagram's top-level views, so
 * nested views had to be read out of a saved .mdj file. Two kinds are needed
 * routinely: the EdgeLabelViews under an edge (their _id is required to set
 * alpha/distance/edgePosition) and the UMLRegionViews nested under a state's
 * decomposition compartment.
 */
function getSubViews(id, query, reqInfo) {
    const allowedParams = ['recursive', 'type']
    const unknownParams = Object.keys(query || {}).filter(function (k) {
        return allowedParams.indexOf(k) === -1
    })
    if (unknownParams.length > 0) {
        return validationError('Unknown query parameter(s): ' + unknownParams.join(', ') + '. Allowed: ' + allowedParams.join(', '), reqInfo)
    }

    const view = findById(id)
    if (!view) {
        return { success: false, error: 'View not found: ' + id, request: reqInfo }
    }

    const recursive = query && (query.recursive === 'true' || query.recursive === '1')
    const wantedType = query && query.type ? query.type : null

    const collected = []
    function walk(parent, depth) {
        const subViews = parent.subViews || []
        for (let i = 0; i < subViews.length; i++) {
            const sub = subViews[i]
            if (!sub) {
                continue
            }
            if (!wantedType || sub.constructor.name === wantedType) {
                const info = serializeSubView(sub, parent)
                info.depth = depth
                collected.push(info)
            }
            if (recursive) {
                walk(sub, depth + 1)
            }
        }
    }
    walk(view, 1)

    return {
        success: true,
        message: 'Retrieved ' + collected.length + ' sub-view(s) of ' + view.constructor.name + ' ' + view._id +
            (recursive ? ' (recursive)' : ' (direct children only; pass ?recursive=true to descend)'),
        request: reqInfo,
        data: collected
    }
}

/**
 * A parasitic view rides on a host view instead of holding its own position:
 * `alpha` is the angle from the host, `distance` the offset from it. Edge labels
 * are the common case. Detected by type when StarUML exposes it, otherwise by
 * the presence of both properties.
 */
function isParasiticView(view) {
    if (typeof type !== 'undefined' && type.ParasiticView) {
        return view instanceof type.ParasiticView
    }
    return !!view && view.alpha !== undefined && view.distance !== undefined
}

function isEdgeParasiticView(view) {
    if (typeof type !== 'undefined' && type.EdgeParasiticView) {
        return view instanceof type.EdgeParasiticView
    }
    return isParasiticView(view) && view.edgePosition !== undefined
}

// ============================================================
// Parasitic View Geometry
// ============================================================

// A parasitic view stores no position of its own. StarUML recomputes left/top
// on every arrange pass, from `alpha` (angle) and `distance` (offset) measured
// against an anchor on the host. Writing left/top therefore looked accepted and
// was overwritten by the next repaint.
//
// The two functions below are ports of StarUML's own geometry, so the values
// this API writes are the values a mouse drag would write:
//
//   forward   EdgeParasiticView.arrangeObject / NodeParasiticView.arrange
//             left = Coord.getPointAwayLine(p1, p2, alpha, distance).x + p1.x - floor(width/2)
//   inverse   ParasiticManipulator.endManipulate
//             Coord.getPolar(Rect(p1, p2), centreOfTheDroppedLabel)
//
// Both live in StarUML's core; an extension cannot require them, so they are
// reimplemented here. Keep them identical to the originals — a divergence
// shows up as a label that jumps on the next repaint.

/**
 * The anchor point p1 and the direction point p2 a parasitic view measures
 * from. Returns null when the host is missing or has no usable geometry.
 */
function parasiticAnchor(view) {
    if (typeof type !== 'undefined' && type.NodeParasiticView && view instanceof type.NodeParasiticView) {
        const node = view.hostNode || view._parent
        if (!node || node.left === undefined) {
            return null
        }
        const right = typeof node.getRight === 'function' ? node.getRight() : node.left + (node.width || 0)
        const bottom = typeof node.getBottom === 'function' ? node.getBottom() : node.top + (node.height || 0)
        const p = { x: (node.left + right) / 2, y: (node.top + bottom) / 2 }
        // NodeParasiticView passes the same point twice, which makes the
        // reference angle zero.
        return { p1: p, p2: p }
    }

    const edge = view.hostEdge || view._parent
    if (!edge || !edge.points || typeof edge.points.count !== 'function' || edge.points.count() < 2) {
        return null
    }
    const pts = edge.points
    const count = pts.count()
    let p1
    let p2
    switch (view.edgePosition) {
        case 0: // EP_HEAD
            p1 = pts.getPoint(count - 1)
            p2 = pts.getPoint(count - 2)
            break
        case 2: // EP_TAIL
            p1 = pts.getPoint(0)
            p2 = pts.getPoint(1)
            break
        case 1: { // EP_MIDDLE
            let mid = Math.floor(count / 2)
            if (count % 2 === 0) {
                mid -= 1
            }
            const a = pts.getPoint(mid)
            const b = pts.getPoint(mid + 1)
            p2 = { x: b.x, y: b.y }
            p1 = count % 2 === 0
                ? { x: Math.floor((a.x + b.x) / 2), y: Math.floor((a.y + b.y) / 2) }
                : { x: a.x, y: a.y }
            break
        }
        default:
            return null
    }
    return { p1: { x: p1.x, y: p1.y }, p2: { x: p2.x, y: p2.y } }
}

/**
 * Port of Coord.getPolar: the alpha/distance that put a label's centre at `p`.
 */
function polarFromAnchor(p1, p2, p) {
    function angle(dy, dx) {
        const b = dx + 0.00001
        let th = Math.atan(dy / b)
        if (b < 0) {
            th += Math.PI
        }
        return th
    }
    const th1 = angle(p2.y - p1.y, p2.x - p1.x)
    const th2 = angle(p.y - p1.y, p.x - p1.x)
    return {
        alpha: th1 - th2,
        distance: Math.sqrt((p1.x - p.x) * (p1.x - p.x) + (p1.y - p.y) * (p1.y - p.y))
    }
}

/**
 * Move a parasitic view, taking either polar (alpha/distance) or cartesian
 * (left/top) coordinates.
 *
 * Goes through app.engine.moveParasiticView, which is what a mouse drag uses:
 * it sets alpha/distance, repaints so arrange recomputes left/top, then records
 * every changed field — left and top included — as one undoable operation. The
 * recomputed left/top are therefore in the repository, and in the .mdj after a
 * save, without exporting an image to force a redraw.
 *
 * Returns an error string, or null on success. The write report says what the
 * geometry actually became.
 */
function moveParasiticGeometry(view, body, report) {
    // A left/top request needs the view's real size. arrangeObject derives the
    // label's centre from alpha/distance, then subtracts half the width and half
    // the height to reach left/top, so the conversion below has to subtract the
    // same halves going the other way.
    //
    // The catch is when those halves are not known yet. View's constructor
    // assigns neither width nor height, and a label only gets them from
    // LabelView.arrange, which measures its text on a canvas. Before the first
    // draw `view.width` is undefined, `|| 0` takes zero, and the conversion
    // quietly does nothing — arrange then subtracts the real half-width the
    // caller's number never accounted for, and the label lands half its own
    // width and height short. Measured on the live engine: a request for
    // left 900, top 40 settled at 866, 34 on a 70.2 x 13 label.
    //
    // So draw first, and let the size be the one arrange is about to use. The
    // anchor is read after the draw for the same reason: a repaint can move the
    // host edge's points.
    if ((body.left !== undefined || body.top !== undefined) &&
        !(view.width > 0 && view.height > 0)) {
        arrangeDiagram(diagramOfView(view))
    }

    const anchor = parasiticAnchor(view)
    if (!anchor) {
        return 'This ' + view.constructor.name + ' has no host geometry to measure against, so its position cannot be set. ' +
            'An edge label needs its host edge to have at least two points.'
    }

    let alpha
    let distance
    if (body.left !== undefined || body.top !== undefined) {
        // arrangeObject derives left/top from the label's centre, so convert.
        const left = body.left !== undefined ? body.left : view.left
        const top = body.top !== undefined ? body.top : view.top
        const centre = {
            x: left + Math.floor((view.width || 0) / 2),
            y: top + Math.floor((view.height || 0) / 2)
        }
        const polar = polarFromAnchor(anchor.p1, anchor.p2, centre)
        alpha = body.alpha !== undefined ? body.alpha : polar.alpha
        distance = body.distance !== undefined ? body.distance : polar.distance
    } else {
        alpha = body.alpha !== undefined ? body.alpha : view.alpha
        distance = body.distance !== undefined ? body.distance : view.distance
    }

    if (!isFinite(alpha) || !isFinite(distance)) {
        return 'Could not work out an angle and offset for that position (the requested point coincides with the anchor).'
    }

    const diagram = diagramOfView(view)
    const editor = diagram ? editorForDiagram(diagram) : null
    if (!editor) {
        return 'No diagram editor is available, so the view cannot be re-arranged.'
    }

    const before = { left: view.left, top: view.top, alpha: view.alpha, distance: view.distance }
    app.engine.moveParasiticView(editor, view, alpha, distance)

    // Report against what the caller asked for, not against what we computed:
    // arrange rounds with Math.floor, so a requested left of 900 can settle at
    // 899. The caller must be told which.
    const requested = {}
    if (body.left !== undefined) requested.left = body.left
    if (body.top !== undefined) requested.top = body.top
    if (body.alpha !== undefined) requested.alpha = body.alpha
    if (body.distance !== undefined) requested.distance = body.distance

    Object.keys(requested).forEach(function (f) {
        const actual = view[f]
        if (writeValuesEqual(actual, requested[f])) {
            report.updated.push(f)
        } else if (writeValuesEqual(actual, before[f])) {
            reportIgnoredWrite(report, f, requested[f], actual,
                'the arrange pass kept the previous value')
        } else {
            report.clamped.push({ field: f, requested: requested[f], actual: actual })
        }
    })
    return null
}

function updateView(id, body, reqInfo) {
    const err = validate([
        checkUnknownFields(body, VIEW_UPDATE_FIELDS),
        checkFieldType(body, 'left', 'number'),
        checkFieldType(body, 'top', 'number'),
        checkFieldType(body, 'width', 'number'),
        checkFieldType(body, 'height', 'number'),
        checkFieldType(body, 'alpha', 'number'),
        checkFieldType(body, 'distance', 'number'),
        checkFieldType(body, 'edgePosition', 'number'),
        checkFieldType(body, 'keepEdgeWaypoints', 'boolean')
    ])
    if (err) {
        return validationError(err, reqInfo, body)
    }

    if (Object.keys(body).length === 0) {
        return validationError('At least one field must be provided. Allowed fields: ' + VIEW_UPDATE_FIELDS.join(', '), reqInfo, body)
    }

    // keepEdgeWaypoints only says what a move should not disturb. On its own
    // there is no move, so it would report a successful write that did nothing.
    if (Object.keys(body).length === 1 && body.keepEdgeWaypoints !== undefined) {
        return validationError('Field "keepEdgeWaypoints" only applies alongside a move or resize. Send it with left, top, width or height.', reqInfo, body)
    }

    if (body.edgePosition !== undefined && VALID_EDGE_POSITIONS.indexOf(body.edgePosition) === -1) {
        const labels = VALID_EDGE_POSITIONS.map(function (p) { return p + '=' + EDGE_POSITION_LABELS[p] })
        return validationError('Invalid edgePosition ' + body.edgePosition + '. Allowed values: ' + labels.join(', '), reqInfo, body)
    }

    const view = findById(id)
    if (!view) {
        return { success: false, error: 'View not found: ' + id, request: Object.assign({}, reqInfo, { body: body }) }
    }

    // Reject parasitic geometry on views that have no host to ride on, rather
    // than accepting the write and dropping it.
    if ((body.alpha !== undefined || body.distance !== undefined) && !isParasiticView(view)) {
        return validationError('Fields "alpha" and "distance" are only supported for parasitic views such as EdgeLabelView. This view is a ' + view.constructor.name, reqInfo, body)
    }
    if (body.edgePosition !== undefined && !isEdgeParasiticView(view)) {
        return validationError('Field "edgePosition" is only supported for edge parasitic views such as EdgeLabelView. This view is a ' + view.constructor.name, reqInfo, body)
    }

    const report = createWriteReport()

    // A parasitic view's left/top are derived, not stored: every arrange pass
    // recomputes them from alpha/distance. Assigning them directly is what used
    // to report a successful write that the next repaint discarded. Convert the
    // requested position into the polar pair the engine actually keeps, then let
    // the engine arrange and record the resulting left/top itself.
    if (isParasiticView(view)) {
        if (body.edgePosition !== undefined) {
            // edgePosition changes which end of the edge the label measures
            // from, so it has to be set before the position is computed.
            applyProperty(report, view, 'edgePosition', body.edgePosition)
        }
        if (body.width !== undefined) {
            applyProperty(report, view, 'width', body.width)
        }
        if (body.height !== undefined) {
            applyProperty(report, view, 'height', body.height)
        }
        if (body.left !== undefined || body.top !== undefined ||
            body.alpha !== undefined || body.distance !== undefined) {
            const moveErr = moveParasiticGeometry(view, body, report)
            if (moveErr) {
                return validationError(moveErr, reqInfo, body)
            }
        } else if (body.width !== undefined || body.height !== undefined || body.edgePosition !== undefined) {
            // arrange derives left/top from the label's size and its position on
            // the edge, so those writes move it too. Draw once, or the geometry
            // this response reports is the geometry from before the write.
            arrangeDiagram(diagramOfView(view))
        }
        return attachWriteReport({
            success: true,
            message: writeReportMessage('Updated view', report),
            request: Object.assign({}, reqInfo, { body: body }),
            data: serializeViewInfo(view)
        }, report)
    }

    if (body.left !== undefined) {
        applyProperty(report, view, 'left', body.left)
    }
    if (body.top !== undefined) {
        applyProperty(report, view, 'top', body.top)
    }
    if (body.width !== undefined) {
        applyProperty(report, view, 'width', body.width)
    }
    if (body.height !== undefined) {
        applyProperty(report, view, 'height', body.height)
    }

    // Re-route connected edges when node position or size changes.
    // Parasitic geometry is deliberately excluded: it moves a label along its
    // host edge and must not discard hand-placed waypoints on that edge.
    //
    // `keepEdgeWaypoints` turns the clearing off. It defaults to false because
    // clearing has been this endpoint's behaviour all along and README states
    // it, but a caller that has placed a route with PUT .../points or
    // POST .../route needs a way to move a box without losing that work. The
    // engine still owns the two ends, so the route follows the box either way.
    if ((body.left !== undefined || body.top !== undefined || body.width !== undefined || body.height !== undefined) &&
        body.keepEdgeWaypoints !== true) {
        try {
            const connectedEdges = app.repository.getEdgeViewsOf(view)
            if (connectedEdges && connectedEdges.length > 0) {
                for (let i = 0; i < connectedEdges.length; i++) {
                    clearEdgeWaypoints(connectedEdges[i])
                }
            }
        } catch (e) {
            // Edge re-routing is best-effort; don't fail the view update
        }
    }

    return attachWriteReport({
        success: true,
        message: writeReportMessage('Updated view', report),
        request: Object.assign({}, reqInfo, { body: body }),
        data: serializeViewInfo(view)
    }, report)
}

// --- Generic Element Update/Delete ---

/**
 * Work out what to store on a structural feature's `type`, before anything is
 * built.
 *
 * UMLAttribute, UMLParameter and the other UMLStructuralFeature subclasses hold
 * the type they have in one `type` property that takes either a Model reference
 * or a plain string, so typeId and typeName write to the same place. Resolving
 * up front lets createChildElement reject a bad id before it creates anything.
 * Returns { skip }, { error } or { value, field }.
 *
 * `allowTypeAlias` accepts `type` as a third spelling of `typeName`. Only
 * PUT /api/elements/:id passes it: on POST .../children, `type` names the
 * element class to create, which is a different thing entirely.
 */
function resolveFeatureType(body, allowTypeAlias) {
    const spellings = ['typeId', 'typeName']
    if (allowTypeAlias) {
        spellings.push('type')
    }
    const given = spellings.filter(function (s) { return body[s] !== undefined })
    if (given.length === 0) {
        return { skip: true }
    }
    if (given.length > 1) {
        return { error: 'Fields ' + given.map(function (s) { return '"' + s + '"' }).join(' and ') +
            ' are mutually exclusive — they all write the same property. Provide one of them.' }
    }
    if (allowTypeAlias && body.type !== undefined) {
        return { value: body.type, field: 'type' }
    }
    if (body.typeName !== undefined) {
        return { value: body.typeName, field: 'typeName' }
    }
    if (body.typeId === null) {
        return { value: null, field: 'typeId' }
    }
    const target = findById(body.typeId)
    if (!target) {
        return { error: 'typeId not found: ' + body.typeId }
    }
    if (!(target instanceof type.UMLClassifier)) {
        return { error: 'typeId must refer to a UMLClassifier (class, interface, data type, enumeration, signal, ...). Got ' + target.constructor.name }
    }
    return { value: target, field: 'typeId' }
}

/**
 * Reject typeId/typeName/direction for an element class that has no such
 * property, rather than reporting a successful write the engine discarded.
 * Takes the class rather than an instance so createChildElement can check
 * before it builds anything. Returns an error string, or null when accepted.
 */
function checkFeatureFieldsSupported(typeName, isStructuralFeature, body, featureType) {
    if (!featureType.skip && !isStructuralFeature) {
        return 'Fields "typeId", "typeName" and "type" are only supported for structural features (UMLAttribute, UMLParameter, UMLPort, ...). Got ' + typeName
    }
    if (body.direction !== undefined) {
        const domain = DIRECTION_DOMAINS[typeName]
        if (!domain) {
            return 'Field "direction" is only supported for ' + Object.keys(DIRECTION_DOMAINS).join(' and ') + ' elements. Got ' + typeName
        }
        // Check the value against this class's own domain, not a shared list:
        // "return" is legal on a UMLParameter and illegal on a SysMLFlowProperty.
        if (domain.indexOf(body.direction) === -1) {
            return 'Invalid direction "' + body.direction + '" for ' + typeName + '. Allowed: ' + domain.join(', ')
        }
    }
    return null
}

/**
 * Same check against a child class named in a request. An unknown class counts
 * as "not a structural feature", so an unsupported field is refused rather than
 * waved through.
 */
function checkFeatureFieldsForChildType(className, body, featureType) {
    const childClass = type[className]
    const isStructuralFeature = !!childClass && childClass.prototype instanceof type.UMLStructuralFeature
    return checkFeatureFieldsSupported(className, isStructuralFeature, body, featureType)
}

function updateGenericElement(id, body, reqInfo) {
    const err = validate([
        checkUnknownFields(body, GENERIC_ELEMENT_UPDATE_FIELDS),
        checkFieldType(body, 'name', 'string'),
        checkFieldType(body, 'stereotype', 'string'),
        checkFieldType(body, 'documentation', 'string'),
        checkFieldType(body, 'referenceId', 'string|null'),
        checkFieldType(body, 'typeId', 'string|null'),
        checkFieldType(body, 'typeName', 'string'),
        checkFieldType(body, 'type', 'string'),
        checkFieldType(body, 'direction', 'string'),
        checkFieldType(body, 'specification', 'string')
    ])
    if (err) {
        return validationError(err, reqInfo, body)
    }

    if (body.constrainedElementIds !== undefined && !Array.isArray(body.constrainedElementIds)) {
        return validationError('Field "constrainedElementIds" must be an array of element ids', reqInfo, body)
    }

    if (body.direction !== undefined && ALL_DIRECTION_VALUES.indexOf(body.direction) === -1) {
        return validationError('Invalid direction "' + body.direction + '". Allowed: ' + ALL_DIRECTION_VALUES.join(', '), reqInfo, body)
    }

    const featureType = resolveFeatureType(body, true)
    if (featureType.error) {
        return validationError(featureType.error, reqInfo, body)
    }

    if (Object.keys(body).length === 0) {
        return validationError('At least one field must be provided. Allowed fields: ' + GENERIC_ELEMENT_UPDATE_FIELDS.join(', '), reqInfo, body)
    }

    // An empty name is a legal value here, unlike on create. An association gets
    // a generated name it may not want, and before this the only way to shrink
    // that label was to rename it to something shorter.
    if (body.name !== undefined && typeof body.name !== 'string') {
        return validationError('Field "name" must be a string', reqInfo, body)
    }

    const elem = findById(id)
    if (!elem) {
        return { success: false, error: 'Element not found: ' + id, request: Object.assign({}, reqInfo, { body: body }) }
    }

    if (body.referenceId !== undefined && !(elem instanceof type.Hyperlink)) {
        return validationError('Field "referenceId" is only supported for Hyperlink elements', reqInfo, body)
    }

    // UMLConstraintView draws `specification`, not `name`, so a constraint
    // without one is an empty {} on the canvas. `constrainedElements` is what
    // makes a constraint machine-readable: it names the elements the constraint
    // is about, instead of leaving that to whoever reads the label.
    const isConstraint = !!(type.UMLConstraint && elem instanceof type.UMLConstraint)
    if (body.specification !== undefined && !isConstraint) {
        return validationError('Field "specification" is only supported for UMLConstraint elements. Got ' + elem.constructor.name, reqInfo, body)
    }
    if (body.constrainedElementIds !== undefined && !isConstraint) {
        return validationError('Field "constrainedElementIds" is only supported for UMLConstraint elements. Got ' + elem.constructor.name, reqInfo, body)
    }

    // Resolve every id before writing any of them, so a typo in the middle of
    // the list cannot leave a half-rewritten constraint behind.
    let constrainedTargets = null
    if (body.constrainedElementIds !== undefined) {
        constrainedTargets = []
        for (let ci = 0; ci < body.constrainedElementIds.length; ci++) {
            const cid = body.constrainedElementIds[ci]
            if (typeof cid !== 'string') {
                return validationError('constrainedElementIds[' + ci + '] must be a string element id', reqInfo, body)
            }
            const target = findById(cid)
            if (!target) {
                return { success: false, error: 'constrainedElementIds[' + ci + '] not found: ' + cid, request: Object.assign({}, reqInfo, { body: body }) }
            }
            if (!(target instanceof type.UMLModelElement)) {
                return validationError('constrainedElementIds[' + ci + '] must refer to a UMLModelElement. Got ' +
                    target.constructor.name + ' (' + cid + ')', reqInfo, body)
            }
            if (constrainedTargets.indexOf(target) === -1) {
                constrainedTargets.push(target)
            }
        }
    }

    const featureErr = checkFeatureFieldsSupported(
        elem.constructor.name,
        elem instanceof type.UMLStructuralFeature,
        body,
        featureType
    )
    if (featureErr) {
        return validationError(featureErr, reqInfo, body)
    }

    const report = createWriteReport()
    if (body.name !== undefined) {
        applyProperty(report, elem, 'name', body.name)
    }
    if (body.stereotype !== undefined) {
        applyProperty(report, elem, 'stereotype', body.stereotype)
    }
    if (body.documentation !== undefined) {
        applyProperty(report, elem, 'documentation', body.documentation)
    }
    if (body.referenceId !== undefined) {
        if (body.referenceId === null) {
            applyProperty(report, elem, 'reference', null, 'reference')
        } else {
            const refTarget = findById(body.referenceId)
            if (!refTarget) {
                return { success: false, error: 'referenceId not found: ' + body.referenceId, request: Object.assign({}, reqInfo, { body: body }) }
            }
            applyProperty(report, elem, 'reference', refTarget, 'reference')
        }
    }
    if (!featureType.skip) {
        applyProperty(report, elem, 'type', featureType.value, featureType.field)
    }
    if (body.direction !== undefined) {
        applyProperty(report, elem, 'direction', body.direction)
    }
    if (body.specification !== undefined) {
        applyProperty(report, elem, 'specification', body.specification)
    }
    if (constrainedTargets) {
        setRefsCollection(report, elem, 'constrainedElements', constrainedTargets, 'constrainedElementIds')
    }

    return attachWriteReport({
        success: true,
        message: writeReportMessage('Updated element "' + (elem.name || id) + '"', report),
        request: Object.assign({}, reqInfo, { body: body }),
        data: serializeElement(elem)
    }, report)
}

/**
 * Replace the contents of a `refs` collection with `wanted`, and report the
 * result the way applyProperty does.
 *
 * Not app.engine.setProperty: that builds a FIELD_ASSIGN operation, and
 * Repository._applyOperation only updates the reverse-reference index when the
 * assigned value is a single element with an `_id`. Handing it an array assigns
 * the array and leaves the index stale, so app.repository.getRefsTo() — which
 * delete uses to find what points at an element — would not see the new
 * members. engine.addItem/removeItem go through FIELD_INSERT / FIELD_REMOVE,
 * which do maintain the index.
 */
function setRefsCollection(report, elem, prop, wanted, fieldName) {
    const name = fieldName || prop
    const before = Array.isArray(elem[prop]) ? elem[prop].slice() : null
    if (before === null) {
        reportIgnoredWrite(report, name, wanted.length + ' element(s)', undefined,
            prop + ' is not a collection on ' + elem.constructor.name)
        return report
    }

    // Clear and rebuild rather than diffing. A minimal diff appends the missing
    // members to the end, so asking for [B, A] when [A] is there yields [A, B] —
    // the right set in the wrong order, which the check below would then report
    // as a clamp on a write that was in fact honoured. The order is part of what
    // the caller asked for; rebuilding is the only way to guarantee it.
    const alreadyRight = before.length === wanted.length && wanted.every(function (target, i) {
        return before[i] === target
    })
    if (!alreadyRight) {
        before.forEach(function (existing) {
            app.engine.removeItem(elem, prop, existing)
        })
        wanted.forEach(function (target) {
            app.engine.addItem(elem, prop, target)
        })
    }

    const after = elem[prop] || []
    const matches = after.length === wanted.length && wanted.every(function (target, i) {
        return after[i] === target
    })
    if (matches) {
        report.updated.push(name)
    } else {
        report.clamped.push({
            field: name,
            requested: wanted.map(function (t) { return t._id }).join(', ') || '(empty)',
            actual: after.map(function (t) { return t._id }).join(', ') || '(empty)'
        })
    }
    return report
}

function deleteGenericElement(id, reqInfo) {
    const elem = findById(id)
    if (!elem) {
        return { success: false, error: 'Element not found: ' + id, request: reqInfo }
    }

    // Delegate to type-specific delete functions that have referential integrity checks
    if (elem instanceof type.ERDEntity) {
        return deleteEntity(id, reqInfo)
    }
    if (elem instanceof type.ERDColumn) {
        return deleteColumn(id, reqInfo)
    }
    if (elem instanceof type.ERDDataModel) {
        return deleteDataModel(id, reqInfo)
    }
    if (elem instanceof type.ERDRelationship) {
        return deleteRelationship(id, reqInfo)
    }
    if (elem instanceof type.UMLInteraction) {
        return deleteInteraction(id, reqInfo)
    }
    if (elem instanceof type.UMLLifeline) {
        return deleteLifeline(id, reqInfo)
    }
    if (elem instanceof type.UMLMessage) {
        return deleteMessage(id, reqInfo)
    }
    if (elem instanceof type.UMLCombinedFragment) {
        return deleteCombinedFragment(id, reqInfo)
    }
    if (elem instanceof type.UMLInteractionOperand) {
        return deleteOperand(id, reqInfo)
    }
    if (elem instanceof type.UMLStateInvariant) {
        return deleteStateInvariant(id, reqInfo)
    }
    if (elem instanceof type.UMLInteractionUse) {
        return deleteInteractionUse(id, reqInfo)
    }
    if (elem instanceof type.Tag) {
        return deleteTag(id, reqInfo)
    }

    const name = elem.name || id

    // Collect associated views for deletion
    const views = []
    if (elem.ownedViews) {
        // Element is a diagram; include its owned views for deletion
        elem.ownedViews.forEach(function (v) {
            views.push(v)
        })
    } else {
        // Find views that reference this element across all diagrams
        const allDiagrams = app.repository.select('@Diagram')
        allDiagrams.forEach(function (d) {
            if (d.ownedViews) {
                d.ownedViews.forEach(function (v) {
                    if (v.model && v.model._id === id) {
                        views.push(v)
                    }
                })
            }
        })
    }

    app.engine.deleteElements([elem], views)
    return {
        success: true,
        message: 'Deleted element "' + name + '"',
        request: reqInfo,
        data: { deleted: id, name: name }
    }
}

// ============================================================
// Element Lookup (generic)
// ============================================================

function getElement(id, reqInfo) {
    const elem = findById(id)
    if (!elem) {
        return { success: false, error: 'Element not found: ' + id, request: reqInfo }
    }
    let data
    if (elem instanceof type.ERDEntity) {
        data = serializeEntity(elem)
    } else if (elem instanceof type.ERDColumn) {
        data = serializeColumn(elem)
    } else if (elem instanceof type.ERDDiagram) {
        data = serializeDiagram(elem)
    } else if (elem instanceof type.ERDRelationship) {
        data = serializeRelationship(elem)
    } else if (elem instanceof type.Tag) {
        data = serializeTag(elem)
    } else if (elem instanceof type.UMLInteraction) {
        data = serializeInteraction(elem)
    } else if (elem instanceof type.UMLSequenceDiagram) {
        data = serializeSeqDiagram(elem)
    } else if (elem instanceof type.UMLLifeline) {
        data = serializeLifeline(elem)
    } else if (elem instanceof type.UMLMessage) {
        data = serializeMessage(elem)
    } else if (elem instanceof type.UMLCombinedFragment) {
        data = serializeCombinedFragment(elem)
    } else if (elem instanceof type.UMLInteractionOperand) {
        data = serializeInteractionOperand(elem)
    } else if (elem instanceof type.UMLStateInvariant) {
        data = serializeStateInvariant(elem)
    } else if (elem instanceof type.UMLInteractionUse) {
        data = serializeInteractionUse(elem)
    } else {
        data = serializeElement(elem)
    }

    return {
        success: true,
        message: 'Retrieved element "' + (elem.name || id) + '" (type: ' + elem.constructor.name + ')',
        request: reqInfo,
        data: data
    }
}

// --- DDL Generation ---

const DDL_GENERATE_ALLOWED_FIELDS = ['path', 'dataModelId']

function generatePostgresqlDDL(body, reqInfo) {
    const err = validate([
        checkUnknownFields(body, DDL_GENERATE_ALLOWED_FIELDS),
        checkFieldType(body, 'path', 'string'),
        checkFieldType(body, 'dataModelId', 'string')
    ])
    if (err) {
        return validationError(err, reqInfo, body)
    }

    if (!body.path) {
        return validationError('Field "path" is required', reqInfo, body)
    }

    const nameErr = checkNonEmptyString(body, 'path')
    if (nameErr) {
        return validationError(nameErr, reqInfo, body)
    }

    // Validate absolute path
    if (body.path.charAt(0) !== '/' && !/^[a-zA-Z]:[/\\]/.test(body.path)) {
        return validationError('Field "path" must be an absolute path (e.g. "/Users/.../output.sql")', reqInfo, body)
    }

    // Validate dataModelId if provided
    if (body.dataModelId) {
        const dm = findById(body.dataModelId)
        if (!dm || !(dm instanceof type.ERDDataModel)) {
            return validationError('dataModelId must refer to an ERDDataModel. Not found or wrong type: ' + body.dataModelId, reqInfo, body)
        }
    }

    const reqInfoWithBody = Object.assign({}, reqInfo, { body: body })

    try {
        ddlGenerator.generate(body.path, body.dataModelId || null)

        return {
            success: true,
            message: 'DDL generated to "' + body.path + '"',
            request: reqInfoWithBody,
            data: {
                path: body.path
            }
        }
    } catch (e) {
        return {
            success: false,
            error: 'Failed to generate DDL: ' + (e.message || String(e)),
            request: reqInfoWithBody
        }
    }
}

// ============================================================
// Generic Diagram API
// ============================================================

function createGenericDiagram(body, reqInfo) {
    const err = validate([
        checkUnknownFields(body, GENERIC_DIAGRAM_CREATE_FIELDS),
        checkFieldType(body, 'type', 'string'),
        checkFieldType(body, 'name', 'string'),
        checkFieldType(body, 'parentId', 'string')
    ])
    if (err) {
        return validationError(err, reqInfo, body)
    }

    if (!body.type) {
        return validationError('Field "type" is required', reqInfo, body)
    }

    if (ALLOWED_DIAGRAM_TYPES.indexOf(body.type) === -1) {
        return validationError('Invalid diagram type "' + body.type + '". Allowed: ' + ALLOWED_DIAGRAM_TYPES.join(', '), reqInfo, body)
    }

    if (body.name !== undefined) {
        const nameErr = checkNonEmptyString(body, 'name')
        if (nameErr) {
            return validationError(nameErr, reqInfo, body)
        }
    }

    let parent
    if (body.parentId) {
        parent = findById(body.parentId)
        if (!parent) {
            return validationError('Parent not found: ' + body.parentId, reqInfo, body)
        }
    } else {
        parent = app.project.getProject()
        if (!parent) {
            return validationError('No project found. Open a project first.', reqInfo, body)
        }
    }

    try {
        const diagram = app.factory.createDiagram({
            id: body.type,
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
            message: 'Created diagram "' + diagram.name + '" (' + body.type + ')',
            request: Object.assign({}, reqInfo, { body: body }),
            data: serializeGenericDiagramDetail(diagram)
        }
    } catch (e) {
        return {
            success: false,
            error: 'Failed to create diagram: ' + (e.message || String(e)),
            request: Object.assign({}, reqInfo, { body: body })
        }
    }
}

function getGenericDiagram(id, reqInfo) {
    const diagram = findById(id)
    if (!diagram || !diagram.ownedViews) {
        return { success: false, error: 'Diagram not found: ' + id, request: reqInfo }
    }
    return {
        success: true,
        message: 'Retrieved diagram "' + (diagram.name || id) + '"',
        request: reqInfo,
        data: serializeGenericDiagramDetail(diagram)
    }
}

function updateGenericDiagram(id, body, reqInfo) {
    const err = validate([
        checkUnknownFields(body, ['name']),
        checkFieldType(body, 'name', 'string')
    ])
    if (err) {
        return validationError(err, reqInfo, body)
    }

    if (Object.keys(body).length === 0) {
        return validationError('At least one field must be provided. Allowed fields: name', reqInfo, body)
    }

    if (body.name !== undefined) {
        const nameErr = checkNonEmptyString(body, 'name')
        if (nameErr) {
            return validationError(nameErr, reqInfo, body)
        }
    }

    const diagram = findById(id)
    if (!diagram || !diagram.ownedViews) {
        return { success: false, error: 'Diagram not found: ' + id, request: Object.assign({}, reqInfo, { body: body }) }
    }

    const report = createWriteReport()
    if (body.name !== undefined) {
        applyProperty(report, diagram, 'name', body.name)
    }

    return attachWriteReport({
        success: true,
        message: writeReportMessage('Updated diagram "' + diagram.name + '"', report),
        request: Object.assign({}, reqInfo, { body: body }),
        data: serializeGenericDiagramDetail(diagram)
    }, report)
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

function deleteGenericDiagram(id, reqInfo) {
    const diagram = findById(id)
    if (!diagram || !diagram.ownedViews) {
        return { success: false, error: 'Diagram not found: ' + id, request: reqInfo }
    }
    const name = diagram.name
    const parent = diagram._parent
    const viewsToDelete = diagram.ownedViews.slice()
    const modelsToDelete = [diagram]
    const modelIdSet = {}
    modelIdSet[diagram._id] = true

    // Collect model objects referenced by views on this diagram
    // Only delete if the model has no views on other diagrams
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

    // If parent is an auto-created container, collect the container chain for deletion
    // Only delete containers that have no other children besides what we're already deleting
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
        data: { deleted: id, name: name }
    }
}

function serializeGenericDiagramDetail(diagram) {
    if (!diagram) {
        return null
    }
    return {
        _id: diagram._id,
        _type: diagram.constructor.name,
        name: diagram.name || '',
        _parentId: diagram._parent ? diagram._parent._id : null,
        ownedViewsCount: diagram.ownedViews ? diagram.ownedViews.length : 0
    }
}

function getDiagramElements(diagramId, reqInfo) {
    const diagram = findById(diagramId)
    if (!diagram || !diagram.ownedViews) {
        return { success: false, error: 'Diagram not found: ' + diagramId, request: reqInfo }
    }
    const elements = diagram.ownedViews.map(function (view) {
        const result = {
            _id: view._id,
            _type: view.constructor.name
        }
        if (view.model) {
            result.modelId = view.model._id
            result.modelType = view.model.constructor.name
            result.name = view.model.name || ''
        }
        if (view.left !== undefined) {
            result.left = view.left
        }
        if (view.top !== undefined) {
            result.top = view.top
        }
        if (view.width !== undefined) {
            result.width = view.width
        }
        if (view.height !== undefined) {
            result.height = view.height
        }
        return result
    })
    return {
        success: true,
        message: 'Retrieved ' + elements.length + ' element(s) from diagram "' + (diagram.name || diagramId) + '"',
        request: reqInfo,
        data: elements
    }
}

function createDiagramElement(diagramId, body, reqInfo) {
    const err = validate([
        checkUnknownFields(body, GENERIC_ELEMENT_CREATE_FIELDS),
        checkFieldType(body, 'type', 'string'),
        checkFieldType(body, 'name', 'string'),
        checkFieldType(body, 'x1', 'number'),
        checkFieldType(body, 'y1', 'number'),
        checkFieldType(body, 'x2', 'number'),
        checkFieldType(body, 'y2', 'number'),
        checkFieldType(body, 'pseudostateKind', 'string')
    ])
    if (err) {
        return validationError(err, reqInfo, body)
    }

    if (!body.type) {
        return validationError('Field "type" is required', reqInfo, body)
    }

    if (ALLOWED_NODE_TYPES.indexOf(body.type) === -1) {
        return validationError('Invalid element type "' + body.type + '". Allowed: ' + ALLOWED_NODE_TYPES.join(', '), reqInfo, body)
    }

    if (body.pseudostateKind !== undefined && VALID_PSEUDOSTATE_KINDS.indexOf(body.pseudostateKind) === -1) {
        return validationError('Invalid pseudostateKind "' + body.pseudostateKind + '". Allowed: ' + VALID_PSEUDOSTATE_KINDS.join(', '), reqInfo, body)
    }

    const diagram = findById(diagramId)
    if (!diagram || !diagram.ownedViews) {
        return { success: false, error: 'Diagram not found: ' + diagramId, request: Object.assign({}, reqInfo, { body: body }) }
    }

    // Determine parent model based on diagram type
    let parent = diagram._parent
    if (!parent) {
        return validationError('Diagram has no parent model', Object.assign({}, reqInfo, { body: body }))
    }

    // Some factory functions (e.g. SysMLConstraintParameter's parameterFn) expect
    // the diagram itself as parent, not diagram._parent.
    if (DIAGRAM_AS_PARENT_TYPES.indexOf(body.type) !== -1) {
        parent = diagram
    }

    // x2/y2 default to a size measured from x1/y1, not to fixed coordinates.
    // Absolute defaults inverted the rectangle whenever x1/y1 exceeded them:
    // x1=680,y1=420 with no x2/y2 gave (680,420)-(200,180), which StarUML
    // normalises to left=200,top=180,width=480,height=240 — so every element
    // placed past (200,180) silently stacked in the same spot, with nothing in
    // the response to show the coordinates had been reinterpreted.
    const x1 = body.x1 !== undefined ? body.x1 : 100
    const y1 = body.y1 !== undefined ? body.y1 : 100
    const x2 = body.x2 !== undefined ? body.x2 : x1 + 100
    const y2 = body.y2 !== undefined ? body.y2 : y1 + 80

    // Build factory options
    const factoryOpts = {
        id: body.type,
        parent: parent,
        diagram: diagram,
        x1: x1,
        y1: y1,
        x2: x2,
        y2: y2
    }

    // attachToViewId: used for elements that require a tailView (e.g., UMLTimeTick, UMLTimeConstraint)
    if (body.attachToViewId) {
        const attachView = app.repository.get(body.attachToViewId)
        if (!attachView) {
            return validationError('attachToViewId not found: ' + body.attachToViewId, reqInfo, body)
        }
        factoryOpts.tailView = attachView
        if (attachView.model) {
            factoryOpts.tailModel = attachView.model
            // Frame views (UMLFrameView, UMLTimingFrameView, etc.) have model pointing
            // to the diagram itself. The parent should be diagram._parent (the owning
            // Interaction/Block/etc.), not the diagram.
            if (attachView.model === diagram && diagram._parent) {
                factoryOpts.parent = diagram._parent
            } else {
                factoryOpts.parent = attachView.model
            }
        }
    }

    // Auto-attach to timing frame when creating elements on a UMLTimingDiagram
    // without an explicit attachToViewId.
    if (!body.attachToViewId && diagram.constructor.name === 'UMLTimingDiagram') {
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

        const report = createWriteReport()
        const hasModel = model && typeof model._id === 'string'

        if (body.name) {
            if (hasModel) {
                applyProperty(report, model, 'name', body.name)
            } else {
                reportIgnoredWrite(report, 'name', body.name, undefined,
                    'type "' + body.type + '" creates a view with no model element to name')
            }
        }

        if (body.pseudostateKind) {
            if (model && model.constructor.name === 'UMLPseudostate') {
                applyProperty(report, model, 'kind', body.pseudostateKind, 'pseudostateKind')
            } else {
                // Used to be dropped without a word when the created type was not a pseudostate.
                reportIgnoredWrite(report, 'pseudostateKind', body.pseudostateKind, undefined,
                    'only a UMLPseudostate has a kind; this created a ' + (model ? model.constructor.name : view.constructor.name))
            }
        }

        const data = {
            _id: view._id,
            _type: view.constructor.name
        }
        if (model && model._id) {
            data.modelId = model._id
            data.modelType = model.constructor.name
            data.name = model.name || ''
        }
        if (view.left !== undefined) {
            data.left = view.left
        }
        if (view.top !== undefined) {
            data.top = view.top
        }
        if (view.width !== undefined) {
            data.width = view.width
        }
        if (view.height !== undefined) {
            data.height = view.height
        }

        // Auto-expand frame to contain newly created element
        autoExpandFrame(diagram)

        return attachWriteReport({
            success: true,
            message: appendWriteWarnings('Created element "' + (model ? model.name || body.type : body.type) + '" on diagram "' + (diagram.name || diagramId) + '"', report),
            request: Object.assign({}, reqInfo, { body: body }),
            data: data
        }, report)
    } catch (e) {
        return {
            success: false,
            error: 'Failed to create element: ' + (e.message || String(e)),
            request: Object.assign({}, reqInfo, { body: body })
        }
    }
}

function createDiagramRelation(diagramId, body, reqInfo) {
    const err = validate([
        checkUnknownFields(body, GENERIC_RELATION_CREATE_FIELDS),
        checkFieldType(body, 'type', 'string'),
        checkFieldType(body, 'sourceId', 'string'),
        checkFieldType(body, 'targetId', 'string'),
        checkFieldType(body, 'name', 'string')
    ])
    if (err) {
        return validationError(err, reqInfo, body)
    }

    if (!body.type) {
        return validationError('Field "type" is required', reqInfo, body)
    }
    if (!body.sourceId) {
        return validationError('Field "sourceId" is required', reqInfo, body)
    }
    if (!body.targetId) {
        return validationError('Field "targetId" is required', reqInfo, body)
    }

    if (ALLOWED_RELATION_TYPES.indexOf(body.type) === -1) {
        return validationError('Invalid relation type "' + body.type + '". Allowed: ' + ALLOWED_RELATION_TYPES.join(', '), reqInfo, body)
    }

    const diagram = findById(diagramId)
    if (!diagram || !diagram.ownedViews) {
        return { success: false, error: 'Diagram not found: ' + diagramId, request: Object.assign({}, reqInfo, { body: body }) }
    }

    const tailView = findViewOnDiagramByAnyId(diagram, body.sourceId)
    if (!tailView) {
        return validationError('Source element not found on diagram: ' + body.sourceId, reqInfo, body)
    }

    const headView = findViewOnDiagramByAnyId(diagram, body.targetId)
    if (!headView) {
        return validationError('Target element not found on diagram: ' + body.targetId, reqInfo, body)
    }

    let parent = diagram._parent
    if (!parent) {
        return validationError('Diagram has no parent model', Object.assign({}, reqInfo, { body: body }))
    }

    try {
        const options = {
            id: body.type,
            parent: parent,
            diagram: diagram,
            tailView: tailView,
            headView: headView
        }
        // Some relations need tailModel/headModel explicitly
        if (tailView.model) {
            options.tailModel = tailView.model
        }
        if (headView.model) {
            options.headModel = headView.model
        }
        const view = app.factory.createModelAndView(options)

        const model = view.model || view

        const report = createWriteReport()
        if (body.name) {
            if (model && typeof model._id === 'string') {
                applyProperty(report, model, 'name', body.name)
            } else {
                reportIgnoredWrite(report, 'name', body.name, undefined,
                    'type "' + body.type + '" creates a view with no model element to name')
            }
        }

        const data = {
            _id: view._id,
            _type: view.constructor.name
        }
        if (model && model._id) {
            data.modelId = model._id
            data.modelType = model.constructor.name
            data.name = model.name || ''
        }

        // Auto-expand frame to contain newly created relation
        autoExpandFrame(diagram)

        return attachWriteReport({
            success: true,
            message: appendWriteWarnings('Created relation "' + (model ? model.name || body.type : body.type) + '" on diagram "' + (diagram.name || diagramId) + '"', report),
            request: Object.assign({}, reqInfo, { body: body }),
            data: data
        }, report)
    } catch (e) {
        return {
            success: false,
            error: 'Failed to create relation: ' + (e.message || String(e)),
            request: Object.assign({}, reqInfo, { body: body })
        }
    }
}

/**
 * List an element's child elements.
 *
 * The family routes only reach two levels (class → operations), so an
 * operation's parameters — where a return type lives — had no listing at all.
 * Without `field` this walks every container POST .../children can write to.
 */
function listChildElements(parentId, query, reqInfo) {
    const requestedField = query && query.field ? query.field : null

    const parent = findById(parentId)
    if (!parent) {
        return { success: false, error: 'Parent element not found: ' + parentId, request: reqInfo }
    }

    // POST to this same path takes any `field`, not only the ones derived from
    // CHILD_TYPE_DEFAULT_FIELDS, so rejecting everything outside that list made a
    // write unreadable through the endpoint that wrote it: POST with
    // field "ownedElements" succeeded and the matching GET answered "Unknown child
    // field". Accept any field the parent actually carries as a collection, and
    // keep rejecting the rest so a typo still reports itself instead of quietly
    // coming back empty.
    if (requestedField &&
        CHILD_CONTAINER_FIELDS.indexOf(requestedField) === -1 &&
        !Array.isArray(parent[requestedField])) {
        return validationError('Unknown child field "' + requestedField + '" on ' +
            parent.constructor.name + '. Known fields: ' + CHILD_CONTAINER_FIELDS.join(', '), reqInfo)
    }

    const fields = requestedField ? [requestedField] : CHILD_CONTAINER_FIELDS
    const children = []
    fields.forEach(function (f) {
        const list = parent[f]
        if (!Array.isArray(list)) {
            return
        }
        list.forEach(function (c) {
            const item = serializeElement(c)
            if (item) {
                item.field = f
                children.push(item)
            }
        })
    })

    return {
        success: true,
        message: 'Retrieved ' + children.length + ' child element(s) of "' + (parent.name || parentId) + '"',
        request: reqInfo,
        data: children
    }
}

function createChildElement(parentId, body, reqInfo) {
    const err = validate([
        checkUnknownFields(body, GENERIC_CHILD_CREATE_FIELDS),
        checkFieldType(body, 'type', 'string'),
        checkFieldType(body, 'name', 'string'),
        checkFieldType(body, 'field', 'string'),
        checkFieldType(body, 'typeId', 'string|null'),
        checkFieldType(body, 'typeName', 'string'),
        checkFieldType(body, 'direction', 'string'),
        checkFieldType(body, 'specification', 'string')
    ])
    if (err) {
        return validationError(err, reqInfo, body)
    }

    if (!body.type) {
        return validationError('Field "type" is required', reqInfo, body)
    }

    // UMLConstraint draws its `specification`, not its name, so a constraint
    // created without one shows as an empty {} on the canvas.
    if (body.specification !== undefined && !isConstraintType(body.type)) {
        return validationError('Field "specification" is only supported for UMLConstraint and its subtypes (' +
            CONSTRAINT_TYPES.join(', ') + '). Got ' + body.type, reqInfo, body)
    }

    if (ALLOWED_CHILD_TYPES.indexOf(body.type) === -1) {
        return validationError('Invalid child type "' + body.type + '". Allowed: ' + ALLOWED_CHILD_TYPES.join(', '), reqInfo, body)
    }

    if (body.direction !== undefined && ALL_DIRECTION_VALUES.indexOf(body.direction) === -1) {
        return validationError('Invalid direction "' + body.direction + '". Allowed: ' + ALL_DIRECTION_VALUES.join(', '), reqInfo, body)
    }

    const featureType = resolveFeatureType(body)
    if (featureType.error) {
        return validationError(featureType.error, reqInfo, body)
    }

    const childFeatureErr = checkFeatureFieldsForChildType(body.type, body, featureType)
    if (childFeatureErr) {
        return validationError(childFeatureErr, reqInfo, body)
    }

    const parent = findById(parentId)
    if (!parent) {
        return { success: false, error: 'Parent element not found: ' + parentId, request: Object.assign({}, reqInfo, { body: body }) }
    }

    // Factory.createModel defaults an absent field to 'ownedElements', so a type
    // with no table entry still lands somewhere real.
    const field = body.field || CHILD_TYPE_DEFAULT_FIELDS[body.type] || 'ownedElements'

    // The parent must actually carry this collection. StarUML's factory writes
    // through engine.addModel, which is a no-op when parent[field] is not an
    // array — it then reports success and hands back an element the repository
    // never registered. Refuse before anything is built, and name the fields
    // that would have worked.
    if (!Array.isArray(parent[field])) {
        const usable = CHILD_CONTAINER_FIELDS.filter(function (f) {
            return Array.isArray(parent[f])
        })
        return validationError('Field "' + field + '" is not a collection on ' +
            parent.constructor.name + ' "' + (parent.name || parentId) + '", so nothing could be created there. ' +
            'Collections this parent has: ' + (usable.length > 0 ? usable.join(', ') : '(none)'), reqInfo, body)
    }

    const options = {
        id: body.type,
        parent: parent,
        field: field
    }

    try {
        const model = app.factory.createModel(options)

        // A null model means the factory discarded the write. Reporting success
        // here is what let a caller record a constraint that does not exist.
        if (!model || typeof model._id !== 'string') {
            return {
                success: false,
                error: 'StarUML created no element for type "' + body.type + '" in field "' + field +
                    '" of ' + parent.constructor.name + '. The type may not be registered with the model factory.',
                request: Object.assign({}, reqInfo, { body: body })
            }
        }
        // ...and a model that exists but is not in the collection is the same
        // failure one step later.
        if (parent[field].indexOf(model) === -1) {
            return {
                success: false,
                error: 'Created "' + body.type + '" did not land in ' + parent.constructor.name + '.' + field + '.',
                request: Object.assign({}, reqInfo, { body: body })
            }
        }

        const report = createWriteReport()
        if (body.name) {
            applyProperty(report, model, 'name', body.name)
        }
        if (!featureType.skip) {
            applyProperty(report, model, 'type', featureType.value, featureType.field)
        }
        if (body.direction !== undefined) {
            applyProperty(report, model, 'direction', body.direction)
        }
        if (body.specification !== undefined) {
            applyProperty(report, model, 'specification', body.specification)
        }

        const data = serializeElement(model)
        data.field = field
        return attachWriteReport({
            success: true,
            message: appendWriteWarnings('Created child "' + (model.name || body.type) + '" under "' + (parent.name || parentId) + '" in field "' + field + '"', report),
            request: Object.assign({}, reqInfo, { body: body }),
            data: data
        }, report)
    } catch (e) {
        return {
            success: false,
            error: 'Failed to create child: ' + (e.message || String(e)),
            request: Object.assign({}, reqInfo, { body: body })
        }
    }
}

/**
 * Compare the route a caller asked for against the route the engine kept.
 *
 * The engine changes a written route in two ways, and they need telling apart.
 *
 * Losing a waypoint is the surprising one — EdgeView.reducePoints deletes any
 * middle point that falls inside the tail or head box — so it goes in the
 * message, where a caller reading a shorter array finds out why.
 *
 * Moving the two ends is not a surprise: every arrange snaps them to where the
 * line meets the end boxes, so it happens on essentially every write. Saying so
 * in the message each time would train callers to skim past the message, taking
 * the dropped-waypoint warning with it. It goes in `endsSnappedByEngine`
 * instead, a field that is always there and can be read when it matters.
 */
function describeRouteResult(requested, stored) {
    const result = { notes: [], endsSnappedByEngine: false }
    if (!stored) {
        return result
    }
    if (stored.length !== requested.length) {
        result.notes.push('asked for ' + requested.length + ' point(s), stored ' + stored.length +
            ' — the engine drops waypoints that fall inside the tail or head view')
    }
    const endMoved = function (a, b) {
        return !a || !b || !writeValuesEqual(a.x, b.x) || !writeValuesEqual(a.y, b.y)
    }
    result.endsSnappedByEngine = endMoved(requested[0], stored[0]) ||
        endMoved(requested[requested.length - 1], stored[stored.length - 1])
    return result
}

function edgePointsOf(view) {
    return pointsToArray(view && view.points) || []
}

/**
 * PUT /api/views/:id/points — replace an edge's route.
 */
function updateViewPoints(id, body, reqInfo) {
    const err = validate([
        checkUnknownFields(body, VIEW_POINTS_FIELDS)
    ])
    if (err) {
        return validationError(err, reqInfo, body)
    }
    if (!Array.isArray(body.points)) {
        return validationError('Field "points" is required and must be an array of {x, y}.', reqInfo, body)
    }
    if (body.points.length < 2) {
        return validationError('An edge route needs at least two points: the tail end and the head end.', reqInfo, body)
    }
    for (let i = 0; i < body.points.length; i++) {
        const p = body.points[i]
        if (!p || typeof p.x !== 'number' || typeof p.y !== 'number' ||
            !isFinite(p.x) || !isFinite(p.y)) {
            return validationError('points[' + i + '] must be an object with finite numeric x and y.', reqInfo, body)
        }
    }

    const view = findById(id)
    if (!view) {
        return { success: false, error: 'View not found: ' + id, request: Object.assign({}, reqInfo, { body: body }) }
    }
    if (!isEdgeView(view)) {
        return validationError('Points are only supported for edge views. This view is a ' + view.constructor.name, reqInfo, body)
    }

    const writeErr = edgeRouting.setEdgePoints(view, body.points)
    if (writeErr) {
        return validationError(writeErr, reqInfo, body)
    }

    const stored = edgePointsOf(view)
    const outcome = describeRouteResult(body.points, stored)

    return {
        success: true,
        message: 'Updated edge route' + (outcome.notes.length > 0 ? ' (' + outcome.notes.join('; ') + ')' : ''),
        request: Object.assign({}, reqInfo, { body: body }),
        data: Object.assign(serializeViewInfo(view), {
            endsSnappedByEngine: outcome.endsSnappedByEngine
        })
    }
}

/**
 * POST /api/views/:id/route — work out a route that avoids the other views, and
 * write it.
 *
 * The line style is left alone on purpose. Both recalcOblique and
 * recalcRectilinear keep the middle points, so the right-angle route drawn here
 * survives either one, and switching to LS_RECTILINEAR would run
 * convObliqueToRectilinear over the result and rebuild it.
 */
function routeViewEdge(id, body, reqInfo) {
    const err = validate([
        checkUnknownFields(body, EDGE_ROUTE_FIELDS),
        checkFieldType(body, 'margin', 'number'),
        checkFieldType(body, 'grid', 'number')
    ])
    if (err) {
        return validationError(err, reqInfo, body)
    }
    if (body.margin !== undefined && (body.margin < 0 || !isFinite(body.margin))) {
        return validationError('Field "margin" must be zero or a positive number.', reqInfo, body)
    }
    if (body.grid !== undefined && (!(body.grid > 0) || !isFinite(body.grid))) {
        return validationError('Field "grid" must be a positive number.', reqInfo, body)
    }

    const view = findById(id)
    if (!view) {
        return { success: false, error: 'View not found: ' + id, request: Object.assign({}, reqInfo, { body: body }) }
    }
    if (!isEdgeView(view)) {
        return validationError('Routing is only supported for edge views. This view is a ' + view.constructor.name, reqInfo, body)
    }

    const routed = edgeRouting.routeEdge(view, { margin: body.margin, grid: body.grid })
    if (routed.error) {
        return {
            success: false,
            error: routed.error,
            request: Object.assign({}, reqInfo, { body: body })
        }
    }

    const writeErr = edgeRouting.setEdgePoints(view, routed.points)
    if (writeErr) {
        return validationError(writeErr, reqInfo, body)
    }

    // No arrange here. Engine.modifyEdge repaints as part of its own work, and
    // it computes the undoable operation from the state that repaint produced.
    // A second draw afterwards would change geometry the operation has already
    // been built from, leaving those changes outside undo.
    const stored = edgePointsOf(view)
    const outcome = describeRouteResult(routed.points, stored)

    return {
        success: true,
        message: 'Routed edge around ' + routed.obstacleCount + ' view(s) with ' + stored.length + ' point(s)',
        request: Object.assign({}, reqInfo, { body: body }),
        data: Object.assign(serializeViewInfo(view), {
            obstacleCount: routed.obstacleCount,
            // What the router worked out, before the engine snapped the two
            // ends to the box borders. `points` is what is stored; these two
            // differ only at the ends.
            requestedPoints: routed.points,
            endsSnappedByEngine: outcome.endsSnappedByEngine
        })
    }
}

function describeLineStyles() {
    return VALID_LINE_STYLES.map(function (v) { return v + '=' + LINE_STYLE_LABELS[v] }).join(', ')
}

function isEdgeView(view) {
    return !!(view && type.EdgeView && view instanceof type.EdgeView)
}

/**
 * Set an edge's line style the way StarUML's own Style editor does.
 *
 * Engine.setLineStyle arranges the edge after the write, so its points follow
 * the new style, repaints, and records the labels that the re-arrange moved in
 * the same undoable operation. Engine.setProperty — what the rest of this
 * handler uses — writes the field alone and leaves the route to whatever
 * redraws next, which on a diagram nobody has open is nothing at all.
 *
 * Two results are worth naming to the caller rather than reporting as a bare
 * "ignored":
 *
 *   - A self-link (both ends on the same node) is forced back to
 *     LS_RECTILINEAR by EdgeView.arrangeObject on every arrange. The value can
 *     be written, and the very next draw discards it.
 *   - With no editor to arrange against, the field is still written, but the
 *     route stays as it was until something draws that diagram.
 */
function setEdgeLineStyle(report, view, requested) {
    const before = view.lineStyle
    const diagram = diagramOfView(view)
    const editor = diagram ? editorForDiagram(diagram) : null

    if (!editor || typeof app.engine.setLineStyle !== 'function') {
        applyProperty(report, view, 'lineStyle', requested)
        if (report.updated.indexOf('lineStyle') !== -1) {
            report.updated.splice(report.updated.indexOf('lineStyle'), 1)
            report.clamped.push({
                field: 'lineStyle',
                requested: requested,
                actual: view.lineStyle,
                reason: 'no editor was available to arrange the diagram, so the field is set but the route is unchanged until something draws it'
            })
        }
        return
    }

    app.engine.setLineStyle(editor, [view], requested)
    const after = view.lineStyle

    if (writeValuesEqual(after, requested)) {
        report.updated.push('lineStyle')
        return
    }
    if (view.head && view.tail && view.head === view.tail) {
        reportIgnoredWrite(report, 'lineStyle', requested, after,
            'this edge has both ends on the same view, and EdgeView.arrangeObject forces a self-link back to ' +
            LINE_STYLE_LABELS[0] + ' on every arrange')
        return
    }
    if (writeValuesEqual(after, before)) {
        reportIgnoredWrite(report, 'lineStyle', requested, after, 'the engine kept the previous value')
        return
    }
    report.clamped.push({ field: 'lineStyle', requested: requested, actual: after })
}

function updateViewStyle(id, body, reqInfo) {
    const err = validate([
        checkUnknownFields(body, STYLE_ALLOWED_FIELDS),
        checkFieldType(body, 'fillColor', 'string'),
        checkFieldType(body, 'lineColor', 'string'),
        checkFieldType(body, 'fontColor', 'string'),
        checkFieldType(body, 'fontFace', 'string'),
        checkFieldType(body, 'fontSize', 'number'),
        checkFieldType(body, 'fontStyle', 'number'),
        checkFieldType(body, 'lineStyle', 'number'),
        checkFieldType(body, 'showShadow', 'boolean'),
        checkFieldType(body, 'autoResize', 'boolean'),
        checkFieldType(body, 'stereotypeDisplay', 'string'),
        checkFieldType(body, 'suppressAttributes', 'boolean'),
        checkFieldType(body, 'suppressOperations', 'boolean'),
        checkFieldType(body, 'suppressReceptions', 'boolean'),
        checkFieldType(body, 'suppressProperties', 'boolean')
    ])
    if (err) {
        return validationError(err, reqInfo, body)
    }

    if (Object.keys(body).length === 0) {
        return validationError('At least one field must be provided. Allowed fields: ' + STYLE_ALLOWED_FIELDS.join(', '), reqInfo, body)
    }

    if (body.lineStyle !== undefined && VALID_LINE_STYLES.indexOf(body.lineStyle) === -1) {
        return validationError('Invalid lineStyle ' + body.lineStyle + '. Allowed values: ' + describeLineStyles(), reqInfo, body)
    }

    const view = findById(id)
    if (!view) {
        return { success: false, error: 'View not found: ' + id, request: Object.assign({}, reqInfo, { body: body }) }
    }

    // lineStyle is declared on EdgeView, not on View. Engine.setProperty would
    // log its own error and write nothing, which reaches the caller as a bare
    // "ignored" with no reason; say why instead.
    if (body.lineStyle !== undefined && !isEdgeView(view)) {
        return validationError('Field "lineStyle" is only supported for edge views. This view is a ' + view.constructor.name, reqInfo, body)
    }

    const report = createWriteReport()

    const colorAndLineProps = ['fillColor', 'lineColor', 'fontColor', 'showShadow']
    colorAndLineProps.forEach(function (prop) {
        if (body[prop] !== undefined) {
            applyProperty(report, view, prop, body[prop])
        }
    })

    if (body.lineStyle !== undefined) {
        setEdgeLineStyle(report, view, body.lineStyle)
    }

    // Font properties: set together via Font object if any font field is provided
    if (body.fontFace !== undefined || body.fontSize !== undefined || body.fontStyle !== undefined) {
        const currentFont = view.font || {}
        const face = body.fontFace !== undefined ? body.fontFace : (currentFont.face || 'Arial')
        const size = body.fontSize !== undefined ? body.fontSize : (currentFont.size || 13)
        const style = body.fontStyle !== undefined ? body.fontStyle : (currentFont.style || 0)
        app.engine.setProperty(view, 'font', face + ';' + size + ';' + style)
        // view.font reads back as a Font object, not the string just written, so
        // compare its three parts rather than the value as a whole.
        const storedFont = view.font || {}
        const wanted = { fontFace: face, fontSize: size, fontStyle: style }
        const stored = { fontFace: storedFont.face, fontSize: storedFont.size, fontStyle: storedFont.style }
        Object.keys(wanted).forEach(function (f) {
            if (body[f] === undefined) {
                return
            }
            if (writeValuesEqual(stored[f], wanted[f])) {
                report.updated.push(f)
            } else {
                report.clamped.push({ field: f, requested: wanted[f], actual: stored[f] })
            }
        })
    }

    // Display control properties
    const displayProps = ['autoResize', 'stereotypeDisplay', 'suppressAttributes',
        'suppressOperations', 'suppressReceptions', 'suppressProperties']
    displayProps.forEach(function (prop) {
        if (body[prop] !== undefined) {
            applyProperty(report, view, prop, body[prop])
        }
    })

    return attachWriteReport({
        success: true,
        message: writeReportMessage('Updated style', report),
        request: Object.assign({}, reqInfo, { body: body }),
        data: serializeViewInfo(view)
    }, report)
}

/**
 * How many operations are on one of StarUML's history stacks, or null when the
 * stack cannot be read.
 *
 * Repository exposes no canUndo(); Repository.undo() checks
 * `this._undoStack.size() > 0` itself and returns silently when the stack is
 * empty. Without this count the API answered "Undo executed" to a request that
 * did nothing, which reads as "your change was reverted" when nothing was.
 */
function historyStackSize(name) {
    try {
        const stack = app.repository[name]
        if (stack && typeof stack.size === 'function') {
            return stack.size()
        }
    } catch (e) {
        // A future StarUML may rename the private stacks. Fall back to reporting
        // nothing rather than failing the request.
    }
    return null
}

function historyAction(reqInfo, verb, stackName, run) {
    const before = historyStackSize(stackName)
    if (before === 0) {
        return {
            success: false,
            error: 'Nothing to ' + verb + ': the ' + verb + ' stack is empty.',
            request: reqInfo,
            data: { stackSizeBefore: 0, stackSizeAfter: 0 }
        }
    }
    try {
        run()
    } catch (e) {
        return {
            success: false,
            error: 'Failed to ' + verb + ': ' + (e.message || String(e)),
            request: reqInfo
        }
    }
    const after = historyStackSize(stackName)
    // Repository.undo() swallows its own exceptions (it logs and returns), so a
    // stack that did not shrink is the only sign the operation did not run.
    if (before !== null && after !== null && after >= before) {
        return {
            success: false,
            error: verb.charAt(0).toUpperCase() + verb.slice(1) + ' did not run: the ' + verb +
                ' stack still holds ' + after + ' operation(s). StarUML logs the reason to its console.',
            request: reqInfo,
            data: { stackSizeBefore: before, stackSizeAfter: after }
        }
    }
    return {
        success: true,
        message: verb.charAt(0).toUpperCase() + verb.slice(1) + ' executed' +
            (after === null ? '' : ' (' + after + ' operation(s) left to ' + verb + ')'),
        request: reqInfo,
        data: { stackSizeBefore: before, stackSizeAfter: after }
    }
}

function undoAction(reqInfo) {
    return historyAction(reqInfo, 'undo', '_undoStack', function () {
        app.repository.undo()
    })
}

function redoAction(reqInfo) {
    return historyAction(reqInfo, 'redo', '_redoStack', function () {
        app.repository.redo()
    })
}

function searchElements(query, reqInfo) {
    const allowedParams = ['keyword', 'type']
    const unknownParams = Object.keys(query).filter(function (k) {
        return allowedParams.indexOf(k) === -1
    })
    if (unknownParams.length > 0) {
        return validationError('Unknown query parameter(s): ' + unknownParams.join(', ') + '. Allowed: ' + allowedParams.join(', '), reqInfo)
    }

    if (!query.keyword) {
        return validationError('Query parameter "keyword" is required', reqInfo)
    }

    let results = app.repository.search(query.keyword)

    if (query.type) {
        results = results.filter(function (elem) {
            return elem.constructor.name === query.type
        })
    }

    const data = results.map(function (elem) {
        return {
            _id: elem._id,
            _type: elem.constructor.name,
            name: elem.name || '',
            _parentId: elem._parent ? elem._parent._id : null
        }
    })

    return {
        success: true,
        message: 'Found ' + data.length + ' element(s)',
        request: reqInfo,
        data: data
    }
}

function layoutDiagram(diagramId, body, reqInfo) {
    const err = validate([
        checkUnknownFields(body, LAYOUT_ALLOWED_FIELDS),
        checkFieldType(body, 'direction', 'string'),
        checkFieldType(body, 'separations', 'object'),
        checkFieldType(body, 'edgeLineStyle', 'number')
    ])
    if (err) {
        return validationError(err, reqInfo, body)
    }

    const direction = body.direction || 'TB'
    if (VALID_LAYOUT_DIRECTIONS.indexOf(direction) === -1) {
        return validationError('Invalid direction "' + direction + '". Allowed: ' + VALID_LAYOUT_DIRECTIONS.join(', '), reqInfo, body)
    }

    const diagram = findById(diagramId)
    if (!diagram || !diagram.ownedViews) {
        return { success: false, error: 'Diagram not found: ' + diagramId, request: Object.assign({}, reqInfo, { body: body }) }
    }

    // Laying out a sequence diagram corrupts it, and not because the layout
    // algorithm is a poor fit — UMLSequenceDiagram.layout() is an empty stub, so
    // no layout is even attempted. The damage comes from Engine.layoutDiagram's
    // own bookkeeping:
    //
    //   1. it snapshots diagram.ownedViews[i] into mementoArray[i]
    //   2. it calls editor.repaint(), and UMLSequenceDiagram.drawDiagram() runs
    //      regulateSequenceNumber(), which splices ownedViews into message order
    //   3. it then diffs diagram.ownedViews[i] against mementoArray[i]
    //
    // After the splice, index i is a different view than it was in step 1, so
    // every view is diffed against another view's snapshot and assigned that
    // view's geometry. There is no direction or separation that avoids this.
    //
    // To move a message, write its y: PUT /api/seq/messages/:id { "y": ... }.
    // That reorders the interaction's message list through StarUML's own
    // regulateSequenceNumber, which is the supported path.
    if (diagram instanceof type.UMLSequenceDiagram) {
        return validationError('Layout is not supported for a UMLSequenceDiagram and would destroy its arrangement. ' +
            'Engine.layoutDiagram diffs views by index across a repaint, and a sequence diagram reorders its own views during that repaint, ' +
            'so each view is assigned another view\'s geometry. Move messages with PUT /api/seq/messages/:id { "y": ... } instead.',
            reqInfo, body)
    }

    const separations = body.separations || { node: 20, edge: 10, rank: 50 }
    const edgeLineStyle = body.edgeLineStyle !== undefined ? body.edgeLineStyle : 1

    try {
        // Certain diagram types have spatial containment semantics (groups
        // containing services, lifelines containing waveforms) that the generic
        // dagre hierarchical layout cannot handle — it treats all nodes as
        // independent and destroys the containment. Skip dagre for these types.
        const skipDagreTypes = ['UMLTimingDiagram', 'UMLUseCaseDiagram', 'AWSDiagram', 'AzureDiagram', 'GCPDiagram']
        const skipDagre = skipDagreTypes.indexOf(diagram.constructor.name) !== -1

        if (!skipDagre) {
            const editor = app.diagrams.getEditor()
            app.engine.layoutDiagram(editor, diagram, direction, separations, edgeLineStyle)
        }

        // Auto-resize frame to contain all views after layout
        fitFrameToViews(diagram)

        return {
            success: true,
            message: 'Layout applied to diagram "' + (diagram.name || diagramId) + '" (direction: ' + direction + ')',
            request: Object.assign({}, reqInfo, { body: body }),
            data: serializeGenericDiagramDetail(diagram)
        }
    } catch (e) {
        return {
            success: false,
            error: 'Failed to layout diagram: ' + (e.message || String(e)),
            request: Object.assign({}, reqInfo, { body: body })
        }
    }
}

function importProject(body, reqInfo) {
    const err = validate([
        checkUnknownFields(body, IMPORT_ALLOWED_FIELDS),
        checkFieldType(body, 'path', 'string'),
        checkFieldType(body, 'parentId', 'string')
    ])
    if (err) {
        return validationError(err, reqInfo, body)
    }

    if (!body.path) {
        return validationError('Field "path" is required', reqInfo, body)
    }

    const pathErr = checkNonEmptyString(body, 'path')
    if (pathErr) {
        return validationError(pathErr, reqInfo, body)
    }

    if (body.path.charAt(0) !== '/' && !/^[a-zA-Z]:[/\\]/.test(body.path)) {
        return validationError('Field "path" must be an absolute path', reqInfo, body)
    }

    let parent
    if (body.parentId) {
        parent = findById(body.parentId)
        if (!parent) {
            return validationError('Parent not found: ' + body.parentId, reqInfo, body)
        }
    } else {
        parent = app.project.getProject()
        if (!parent) {
            return validationError('No project found. Open a project first.', reqInfo, body)
        }
    }

    try {
        app.project.importFromFile(parent, body.path)
        return {
            success: true,
            message: 'Imported from "' + body.path + '"',
            request: Object.assign({}, reqInfo, { body: body }),
            data: { path: body.path }
        }
    } catch (e) {
        return {
            success: false,
            error: 'Failed to import: ' + (e.message || String(e)),
            request: Object.assign({}, reqInfo, { body: body })
        }
    }
}

// ============================================================
// Phase 3: New API Endpoints
// ============================================================

// --- 3B. Export All Diagrams ---

const EXPORT_ALL_ALLOWED_FIELDS = ['path', 'format']

function exportAllDiagrams(body, reqInfo) {
    const err = validate([
        checkUnknownFields(body, EXPORT_ALL_ALLOWED_FIELDS),
        checkFieldType(body, 'path', 'string'),
        checkFieldType(body, 'format', 'string')
    ])
    if (err) {
        return validationError(err, reqInfo, body)
    }

    if (!body.path) {
        return validationError('Field "path" is required', reqInfo, body)
    }

    const pathErr = checkNonEmptyString(body, 'path')
    if (pathErr) {
        return validationError(pathErr, reqInfo, body)
    }

    if (body.path.charAt(0) !== '/' && !/^[a-zA-Z]:[/\\]/.test(body.path)) {
        return validationError('Field "path" must be an absolute path', reqInfo, body)
    }

    const format = (body.format || 'png').toLowerCase()
    if (VALID_EXPORT_FORMATS.indexOf(format) === -1) {
        return validationError('Invalid format "' + body.format + '". Allowed: ' + VALID_EXPORT_FORMATS.join(', '), reqInfo, body)
    }

    const diagrams = app.repository.select('@Diagram')
    if (diagrams.length === 0) {
        return validationError('No diagrams found in project', reqInfo, body)
    }

    try {
        const nodePath = require('path')
        const appPath = app.getAppPath()
        const diagramExport = require(nodePath.join(appPath, 'src', 'engine', 'diagram-export'))

        const exported = []
        diagrams.forEach(function (diagram) {
            const fileName = (diagram.name || diagram._id).replace(/[/\\:*?"<>|]/g, '_')
            const filePath = nodePath.join(body.path, fileName + '.' + format)
            if (format === 'pdf') {
                diagramExport.exportToPDF([diagram], filePath, { showName: true })
            } else if (format === 'svg') {
                diagramExport.exportToSVG(diagram, filePath)
            } else if (format === 'jpeg') {
                diagramExport.exportToJPEG(diagram, filePath)
            } else {
                diagramExport.exportToPNG(diagram, filePath)
            }
            exported.push({ name: diagram.name, path: filePath })
        })

        return {
            success: true,
            message: 'Exported ' + exported.length + ' diagram(s) to "' + body.path + '"',
            request: Object.assign({}, reqInfo, { body: body }),
            data: { count: exported.length, format: format, files: exported }
        }
    } catch (e) {
        return {
            success: false,
            error: 'Failed to export diagrams: ' + (e.message || String(e)),
            request: Object.assign({}, reqInfo, { body: body })
        }
    }
}

// --- 3C. Project Operations ---

function newProject(reqInfo) {
    try {
        app.commands.execute('project:new')
        return {
            success: true,
            message: 'Created new project',
            request: reqInfo
        }
    } catch (e) {
        return {
            success: false,
            error: 'Failed to create new project: ' + (e.message || String(e)),
            request: reqInfo
        }
    }
}

function closeProject(reqInfo) {
    try {
        app.commands.execute('project:close')
        return {
            success: true,
            message: 'Closed project',
            request: reqInfo
        }
    } catch (e) {
        return {
            success: false,
            error: 'Failed to close project: ' + (e.message || String(e)),
            request: reqInfo
        }
    }
}

const FRAGMENT_EXPORT_ALLOWED_FIELDS = ['elementId', 'path']

function exportFragment(body, reqInfo) {
    const err = validate([
        checkUnknownFields(body, FRAGMENT_EXPORT_ALLOWED_FIELDS),
        checkFieldType(body, 'elementId', 'string'),
        checkFieldType(body, 'path', 'string')
    ])
    if (err) {
        return validationError(err, reqInfo, body)
    }

    if (!body.elementId) {
        return validationError('Field "elementId" is required', reqInfo, body)
    }
    if (!body.path) {
        return validationError('Field "path" is required', reqInfo, body)
    }

    if (body.path.charAt(0) !== '/' && !/^[a-zA-Z]:[/\\]/.test(body.path)) {
        return validationError('Field "path" must be an absolute path', reqInfo, body)
    }

    const element = findById(body.elementId)
    if (!element) {
        return validationError('Element not found: ' + body.elementId, reqInfo, body)
    }

    try {
        app.project.exportToFile(element, body.path)
        return {
            success: true,
            message: 'Exported element "' + (element.name || body.elementId) + '" to "' + body.path + '"',
            request: Object.assign({}, reqInfo, { body: body }),
            data: { elementId: body.elementId, path: body.path }
        }
    } catch (e) {
        return {
            success: false,
            error: 'Failed to export fragment: ' + (e.message || String(e)),
            request: Object.assign({}, reqInfo, { body: body })
        }
    }
}

// --- 3D. Create View Of Existing Model ---

const CREATE_VIEW_OF_ALLOWED_FIELDS = ['modelId', 'x', 'y']

function createViewOf(diagramId, body, reqInfo) {
    const err = validate([
        checkUnknownFields(body, CREATE_VIEW_OF_ALLOWED_FIELDS),
        checkFieldType(body, 'modelId', 'string'),
        checkFieldType(body, 'x', 'number'),
        checkFieldType(body, 'y', 'number')
    ])
    if (err) {
        return validationError(err, reqInfo, body)
    }

    if (!body.modelId) {
        return validationError('Field "modelId" is required', reqInfo, body)
    }

    const diagram = findById(diagramId)
    if (!diagram || !diagram.ownedViews) {
        return { success: false, error: 'Diagram not found: ' + diagramId, request: Object.assign({}, reqInfo, { body: body }) }
    }

    const model = findById(body.modelId)
    if (!model) {
        return validationError('Model not found: ' + body.modelId, reqInfo, body)
    }

    try {
        // Ensure the target diagram is the active diagram.
        // StarUML's createViewOf internally uses app.diagrams.getEditor()
        // which returns the editor for the currently active diagram.
        // Without this, views get placed on whichever diagram is currently open.
        app.diagrams.setCurrentDiagram(diagram)

        const view = app.factory.createViewOf({
            model: model,
            diagram: diagram,
            x: body.x !== undefined ? body.x : 100,
            y: body.y !== undefined ? body.y : 100
        })

        return {
            success: true,
            message: 'Created view of "' + (model.name || body.modelId) + '" on diagram "' + (diagram.name || diagramId) + '"',
            request: Object.assign({}, reqInfo, { body: body }),
            data: serializeViewInfo(view)
        }
    } catch (e) {
        return {
            success: false,
            error: 'Failed to create view: ' + (e.message || String(e)),
            request: Object.assign({}, reqInfo, { body: body })
        }
    }
}

// --- 3E. Element Relationships ---

function getElementRelationships(id, reqInfo) {
    const element = findById(id)
    if (!element) {
        return { success: false, error: 'Element not found: ' + id, request: reqInfo }
    }

    try {
        const rels = app.repository.getRelationshipsOf(element)
        const data = rels.map(function (rel) {
            const result = {
                _id: rel._id,
                _type: rel.constructor.name,
                name: rel.name || ''
            }
            if (rel.source) {
                result.sourceId = rel.source._id
            } else if (rel.end1 && rel.end1.reference) {
                result.sourceId = rel.end1.reference._id
            }
            if (rel.target) {
                result.targetId = rel.target._id
            } else if (rel.end2 && rel.end2.reference) {
                result.targetId = rel.end2.reference._id
            }
            return result
        })

        return {
            success: true,
            message: 'Retrieved ' + data.length + ' relationship(s) for "' + (element.name || id) + '"',
            request: reqInfo,
            data: data
        }
    } catch (e) {
        return {
            success: false,
            error: 'Failed to get relationships: ' + (e.message || String(e)),
            request: reqInfo
        }
    }
}

// --- 3F. Model Views ---

function getElementViews(id, reqInfo) {
    const element = findById(id)
    if (!element) {
        return { success: false, error: 'Element not found: ' + id, request: reqInfo }
    }

    try {
        const views = app.repository.getViewsOf(element)
        const data = views.map(function (view) {
            const result = {
                viewId: view._id,
                viewType: view.constructor.name
            }
            if (view._parent) {
                result.diagramId = view._parent._id
                result.diagramName = view._parent.name || ''
            }
            return result
        })

        return {
            success: true,
            message: 'Retrieved ' + data.length + ' view(s) for "' + (element.name || id) + '"',
            request: reqInfo,
            data: data
        }
    } catch (e) {
        return {
            success: false,
            error: 'Failed to get views: ' + (e.message || String(e)),
            request: reqInfo
        }
    }
}

// --- 3G. Edge Reconnect ---

const RECONNECT_ALLOWED_FIELDS = ['newSourceId', 'newTargetId']

function reconnectEdge(id, body, reqInfo) {
    const err = validate([
        checkUnknownFields(body, RECONNECT_ALLOWED_FIELDS),
        checkFieldType(body, 'newSourceId', 'string'),
        checkFieldType(body, 'newTargetId', 'string')
    ])
    if (err) {
        return validationError(err, reqInfo, body)
    }

    if (!body.newSourceId && !body.newTargetId) {
        return validationError('At least one of "newSourceId" or "newTargetId" is required', reqInfo, body)
    }

    const view = findById(id)
    if (!view) {
        return { success: false, error: 'View not found: ' + id, request: Object.assign({}, reqInfo, { body: body }) }
    }

    const diagram = view._parent
    if (!diagram || !diagram.ownedViews) {
        return validationError('View is not on a diagram', reqInfo, body)
    }

    try {
        const currentTailView = view.tail
        const currentHeadView = view.head
        const newTailView = body.newSourceId ? findViewOnDiagramByAnyId(diagram, body.newSourceId) : currentTailView
        const newHeadView = body.newTargetId ? findViewOnDiagramByAnyId(diagram, body.newTargetId) : currentHeadView

        if (body.newSourceId && !newTailView) {
            return validationError('New source not found on diagram: ' + body.newSourceId, reqInfo, body)
        }
        if (body.newTargetId && !newHeadView) {
            return validationError('New target not found on diagram: ' + body.newTargetId, reqInfo, body)
        }

        const newTailModel = newTailView.model || null
        const newHeadModel = newHeadView.model || null

        const report = createWriteReport()

        // Update model references (different relationship types use different properties).
        // If the model end cannot be rewritten, the view moves and the model does
        // not — the diagram and the model would then say different things, so say so.
        if (body.newSourceId) {
            if (view.model && newTailModel) {
                if (view.model.end1 && typeof view.model.end1.reference !== 'undefined') {
                    applyProperty(report, view.model.end1, 'reference', newTailModel, 'model.end1.reference')
                } else if (typeof view.model.source !== 'undefined') {
                    applyProperty(report, view.model, 'source', newTailModel, 'model.source')
                } else {
                    reportIgnoredWrite(report, 'model.source', body.newSourceId, undefined,
                        'this relationship type has neither end1.reference nor source; the view moved but the model did not')
                }
            } else {
                reportIgnoredWrite(report, 'model.source', body.newSourceId, undefined,
                    view.model ? 'the new source view has no model' : 'this edge view has no model')
            }
        }
        if (body.newTargetId) {
            if (view.model && newHeadModel) {
                if (view.model.end2 && typeof view.model.end2.reference !== 'undefined') {
                    applyProperty(report, view.model.end2, 'reference', newHeadModel, 'model.end2.reference')
                } else if (typeof view.model.target !== 'undefined') {
                    applyProperty(report, view.model, 'target', newHeadModel, 'model.target')
                } else {
                    reportIgnoredWrite(report, 'model.target', body.newTargetId, undefined,
                        'this relationship type has neither end2.reference nor target; the view moved but the model did not')
                }
            } else {
                reportIgnoredWrite(report, 'model.target', body.newTargetId, undefined,
                    view.model ? 'the new target view has no model' : 'this edge view has no model')
            }
        }

        // Update view connections
        if (body.newSourceId) {
            applyProperty(report, view, 'tail', newTailView, 'view.tail')
        }
        if (body.newTargetId) {
            applyProperty(report, view, 'head', newHeadView, 'view.head')
        }

        // Clear stale waypoints and re-route edge between new endpoints
        clearEdgeWaypoints(view)

        return attachWriteReport({
            success: true,
            message: writeReportMessage('Reconnected edge', report),
            request: Object.assign({}, reqInfo, { body: body }),
            data: serializeViewInfo(view)
        }, report)
    } catch (e) {
        return {
            success: false,
            error: 'Failed to reconnect edge: ' + (e.message || String(e)),
            request: Object.assign({}, reqInfo, { body: body })
        }
    }
}

// --- 3H. Element Relocate ---

const RELOCATE_ALLOWED_FIELDS = ['newParentId', 'field']

function relocateElement(id, body, reqInfo) {
    const err = validate([
        checkUnknownFields(body, RELOCATE_ALLOWED_FIELDS),
        checkFieldType(body, 'newParentId', 'string'),
        checkFieldType(body, 'field', 'string')
    ])
    if (err) {
        return validationError(err, reqInfo, body)
    }

    if (!body.newParentId) {
        return validationError('Field "newParentId" is required', reqInfo, body)
    }

    const element = findById(id)
    if (!element) {
        return { success: false, error: 'Element not found: ' + id, request: Object.assign({}, reqInfo, { body: body }) }
    }

    const newParent = findById(body.newParentId)
    if (!newParent) {
        return validationError('New parent not found: ' + body.newParentId, reqInfo, body)
    }

    try {
        const field = body.field || 'ownedElements'
        app.engine.relocate(element, newParent, field)

        return {
            success: true,
            message: 'Relocated "' + (element.name || id) + '" to "' + (newParent.name || body.newParentId) + '"',
            request: Object.assign({}, reqInfo, { body: body }),
            data: serializeElement(element)
        }
    } catch (e) {
        return {
            success: false,
            error: 'Failed to relocate element: ' + (e.message || String(e)),
            request: Object.assign({}, reqInfo, { body: body })
        }
    }
}

// --- 3I. Open Diagram ---

function openDiagram(id, reqInfo) {
    const diagram = findById(id)
    if (!diagram || !diagram.ownedViews) {
        return { success: false, error: 'Diagram not found: ' + id, request: reqInfo }
    }

    try {
        app.modelExplorer.select(diagram)
        app.diagrams.setCurrentDiagram(diagram)
        return {
            success: true,
            message: 'Opened diagram "' + (diagram.name || id) + '"',
            request: reqInfo,
            data: serializeGenericDiagramDetail(diagram)
        }
    } catch (e) {
        return {
            success: false,
            error: 'Failed to open diagram: ' + (e.message || String(e)),
            request: reqInfo
        }
    }
}

// --- 3J. Model Validation ---

function validateModel(reqInfo) {
    try {
        const results = app.commands.execute('model:validate')
        const data = []
        if (Array.isArray(results)) {
            results.forEach(function (r) {
                data.push({
                    elementId: r.element ? r.element._id : null,
                    elementName: r.element ? r.element.name || '' : '',
                    message: r.message || '',
                    severity: r.severity || 'error'
                })
            })
        }

        return {
            success: true,
            message: 'Validation completed with ' + data.length + ' result(s)',
            request: reqInfo,
            data: data
        }
    } catch (e) {
        return {
            success: false,
            error: 'Failed to validate: ' + (e.message || String(e)),
            request: reqInfo
        }
    }
}

// --- 3K. Diagram Zoom ---

const ZOOM_ALLOWED_FIELDS = ['level']

function setDiagramZoom(id, body, reqInfo) {
    const err = validate([
        checkUnknownFields(body, ZOOM_ALLOWED_FIELDS),
        checkFieldType(body, 'level', 'number')
    ])
    if (err) {
        return validationError(err, reqInfo, body)
    }

    if (body.level === undefined) {
        return validationError('Field "level" is required', reqInfo, body)
    }

    if (body.level < 0.1 || body.level > 10) {
        return validationError('Field "level" must be between 0.1 and 10', reqInfo, body)
    }

    const diagram = findById(id)
    if (!diagram || !diagram.ownedViews) {
        return { success: false, error: 'Diagram not found: ' + id, request: Object.assign({}, reqInfo, { body: body }) }
    }

    try {
        // Ensure the target diagram is active before setting zoom
        app.diagrams.setCurrentDiagram(diagram)
        app.diagrams.setZoomLevel(body.level)
        return {
            success: true,
            message: 'Set zoom level to ' + body.level + ' on diagram "' + (diagram.name || id) + '"',
            request: Object.assign({}, reqInfo, { body: body }),
            data: { level: body.level }
        }
    } catch (e) {
        return {
            success: false,
            error: 'Failed to set zoom level: ' + (e.message || String(e)),
            request: Object.assign({}, reqInfo, { body: body })
        }
    }
}

// --- #6. Alignment / Distribution ---

const VALID_ALIGNMENT_ACTIONS = [
    'align-left', 'align-right', 'align-center',
    'align-top', 'align-bottom', 'align-middle',
    'space-equally-horizontally', 'space-equally-vertically',
    'set-width-equally', 'set-height-equally', 'set-size-equally',
    'send-to-back', 'bring-to-front'
]
const ALIGN_ALLOWED_FIELDS = ['viewIds', 'action']

function alignViews(body, reqInfo) {
    const err = validate([
        checkUnknownFields(body, ALIGN_ALLOWED_FIELDS),
        checkFieldType(body, 'action', 'string')
    ])
    if (err) {
        return validationError(err, reqInfo, body)
    }

    if (!body.action) {
        return validationError('Field "action" is required. Allowed: ' + VALID_ALIGNMENT_ACTIONS.join(', '), reqInfo, body)
    }
    if (VALID_ALIGNMENT_ACTIONS.indexOf(body.action) === -1) {
        return validationError('Invalid action "' + body.action + '". Allowed: ' + VALID_ALIGNMENT_ACTIONS.join(', '), reqInfo, body)
    }
    if (!body.viewIds || !Array.isArray(body.viewIds) || body.viewIds.length < 2) {
        return validationError('Field "viewIds" is required and must be an array of at least 2 view IDs', reqInfo, body)
    }

    // Resolve views
    const views = []
    for (let i = 0; i < body.viewIds.length; i++) {
        const v = app.repository.get(body.viewIds[i])
        if (!v) {
            return validationError('View not found: ' + body.viewIds[i], reqInfo, body)
        }
        views.push(v)
    }

    try {
        // Set selection to the specified views, execute alignment command, then clear
        app.selections.deselectAll()
        app.selections.selectViews(views)
        app.commands.execute('alignment:' + body.action)
        app.selections.deselectAll()

        return {
            success: true,
            message: 'Executed alignment action "' + body.action + '" on ' + views.length + ' views',
            request: Object.assign({}, reqInfo, { body: body }),
            data: { action: body.action, viewCount: views.length }
        }
    } catch (e) {
        app.selections.deselectAll()
        return {
            success: false,
            error: 'Failed to execute alignment: ' + (e.message || String(e)),
            request: Object.assign({}, reqInfo, { body: body })
        }
    }
}

// --- #7. Mermaid Import ---

const MERMAID_ALLOWED_FIELDS = ['code', 'parentId']
const VALID_MERMAID_TYPES = ['classDiagram', 'sequenceDiagram', 'flowchart', 'erDiagram', 'mindmap', 'requirementDiagram', 'stateDiagram']

function importMermaid(body, reqInfo) {
    const err = validate([
        checkUnknownFields(body, MERMAID_ALLOWED_FIELDS),
        checkFieldType(body, 'code', 'string'),
        checkFieldType(body, 'parentId', 'string')
    ])
    if (err) {
        return validationError(err, reqInfo, body)
    }

    if (!body.code || body.code.trim() === '') {
        return validationError('Field "code" is required (Mermaid syntax text)', reqInfo, body)
    }

    let base = null
    if (body.parentId) {
        base = app.repository.get(body.parentId)
        if (!base) {
            return validationError('Parent element not found: ' + body.parentId, reqInfo, body)
        }
    } else {
        base = app.project.getProject()
    }

    try {
        app.commands.execute('mermaid:generate-diagram', body.code, base)
        return {
            success: true,
            message: 'Mermaid diagram generated successfully',
            request: Object.assign({}, reqInfo, { body: { code: body.code.substring(0, 100) + '...' } }),
            data: { supportedTypes: VALID_MERMAID_TYPES }
        }
    } catch (e) {
        return {
            success: false,
            error: 'Failed to generate Mermaid diagram: ' + (e.message || String(e)),
            request: Object.assign({}, reqInfo, { body: { code: body.code.substring(0, 100) + '...' } })
        }
    }
}

// --- #8. Diagram Generator ---

const VALID_GENERATOR_TYPES = ['overview', 'overview-expanded', 'type-hierarchy', 'package-structure']
const GENERATOR_ALLOWED_FIELDS = ['type', 'parentId']

function generateDiagram(body, reqInfo) {
    const err = validate([
        checkUnknownFields(body, GENERATOR_ALLOWED_FIELDS),
        checkFieldType(body, 'type', 'string'),
        checkFieldType(body, 'parentId', 'string')
    ])
    if (err) {
        return validationError(err, reqInfo, body)
    }

    if (!body.type) {
        return validationError('Field "type" is required. Allowed: ' + VALID_GENERATOR_TYPES.join(', '), reqInfo, body)
    }
    if (VALID_GENERATOR_TYPES.indexOf(body.type) === -1) {
        return validationError('Invalid generator type "' + body.type + '". Allowed: ' + VALID_GENERATOR_TYPES.join(', '), reqInfo, body)
    }

    let base = null
    if (body.parentId) {
        base = app.repository.get(body.parentId)
        if (!base) {
            return validationError('Parent element not found: ' + body.parentId, reqInfo, body)
        }
    } else {
        base = app.project.getProject()
    }

    try {
        app.commands.execute('diagram-generator:' + body.type, base, true)
        return {
            success: true,
            message: 'Generated "' + body.type + '" diagram',
            request: Object.assign({}, reqInfo, { body: body }),
            data: { type: body.type }
        }
    } catch (e) {
        return {
            success: false,
            error: 'Failed to generate diagram: ' + (e.message || String(e)),
            request: Object.assign({}, reqInfo, { body: body })
        }
    }
}

// --- #9. Move Up / Move Down (Reorder) ---

const REORDER_ALLOWED_FIELDS = ['direction']
const VALID_REORDER_DIRECTIONS = ['up', 'down']

function reorderElement(id, body, reqInfo) {
    const err = validate([
        checkUnknownFields(body, REORDER_ALLOWED_FIELDS),
        checkFieldType(body, 'direction', 'string')
    ])
    if (err) {
        return validationError(err, reqInfo, body)
    }

    if (!body.direction) {
        return validationError('Field "direction" is required. Allowed: ' + VALID_REORDER_DIRECTIONS.join(', '), reqInfo, body)
    }
    if (VALID_REORDER_DIRECTIONS.indexOf(body.direction) === -1) {
        return validationError('Invalid direction "' + body.direction + '". Allowed: ' + VALID_REORDER_DIRECTIONS.join(', '), reqInfo, body)
    }

    const elem = app.repository.get(id)
    if (!elem) {
        return { success: false, error: 'Element not found: ' + id, request: Object.assign({}, reqInfo, { body: body }) }
    }

    if (!elem._parent) {
        return validationError('Element has no parent and cannot be reordered', reqInfo, body)
    }

    // Find the parent field containing this element
    let parentField = null
    const parent = elem._parent
    const keys = Object.keys(parent)
    for (let i = 0; i < keys.length; i++) {
        const val = parent[keys[i]]
        if (Array.isArray(val) && val.indexOf(elem) !== -1) {
            parentField = keys[i]
            break
        }
    }

    if (!parentField) {
        return validationError('Could not determine parent field for element', reqInfo, body)
    }

    try {
        if (body.direction === 'up') {
            app.engine.moveUp(parent, parentField, elem)
        } else {
            app.engine.moveDown(parent, parentField, elem)
        }

        return {
            success: true,
            message: 'Moved element "' + (elem.name || id) + '" ' + body.direction + ' in ' + parentField,
            request: Object.assign({}, reqInfo, { body: body }),
            data: { _id: elem._id, _type: elem.constructor.name, field: parentField }
        }
    } catch (e) {
        return {
            success: false,
            error: 'Failed to reorder: ' + (e.message || String(e)),
            request: Object.assign({}, reqInfo, { body: body })
        }
    }
}

// --- #3. UMLLinkObject ---

const LINK_OBJECT_ALLOWED_FIELDS = ['name', 'sourceId', 'targetId', 'x1', 'y1', 'x2', 'y2']

function createLinkObject(diagramId, body, reqInfo) {
    const err = validate([
        checkUnknownFields(body, LINK_OBJECT_ALLOWED_FIELDS),
        checkFieldType(body, 'name', 'string'),
        checkFieldType(body, 'sourceId', 'string'),
        checkFieldType(body, 'targetId', 'string'),
        checkFieldType(body, 'x1', 'number'),
        checkFieldType(body, 'y1', 'number'),
        checkFieldType(body, 'x2', 'number'),
        checkFieldType(body, 'y2', 'number')
    ])
    if (err) {
        return validationError(err, reqInfo, body)
    }

    if (!body.sourceId || !body.targetId) {
        return validationError('Fields "sourceId" and "targetId" are required (object model IDs)', reqInfo, body)
    }

    const diagram = findById(diagramId)
    if (!diagram || !diagram.ownedViews) {
        return { success: false, error: 'Diagram not found: ' + diagramId, request: Object.assign({}, reqInfo, { body: body }) }
    }

    const sourceModel = app.repository.get(body.sourceId)
    if (!sourceModel) {
        return validationError('sourceId not found: ' + body.sourceId, reqInfo, body)
    }
    const targetModel = app.repository.get(body.targetId)
    if (!targetModel) {
        return validationError('targetId not found: ' + body.targetId, reqInfo, body)
    }

    const tailView = findViewOnDiagram(diagram, body.sourceId)
    const headView = findViewOnDiagram(diagram, body.targetId)
    if (!tailView) {
        return validationError('sourceId does not have a view on this diagram', reqInfo, body)
    }
    if (!headView) {
        return validationError('targetId does not have a view on this diagram', reqInfo, body)
    }

    // x2/y2 default to a size measured from x1/y1. See createDiagramElement.
    const x1 = body.x1 !== undefined ? body.x1 : 200
    const y1 = body.y1 !== undefined ? body.y1 : 200
    const x2 = body.x2 !== undefined ? body.x2 : x1 + 100
    const y2 = body.y2 !== undefined ? body.y2 : y1 + 50

    try {
        const view = app.factory.createModelAndView({
            id: 'UMLLinkObject',
            parent: diagram._parent,
            diagram: diagram,
            tailView: tailView,
            headView: headView,
            tailModel: sourceModel,
            headModel: targetModel,
            x1: x1,
            y1: y1,
            x2: x2,
            y2: y2
        })

        if (!view) {
            return { success: false, error: 'Failed to create UMLLinkObject. Factory returned null.', request: Object.assign({}, reqInfo, { body: body }) }
        }

        const model = view.model || view
        const report = createWriteReport()
        if (body.name) {
            if (model && typeof model._id === 'string') {
                applyProperty(report, model, 'name', body.name)
            } else {
                reportIgnoredWrite(report, 'name', body.name, undefined,
                    'the created link object has no model element to name')
            }
        }

        autoExpandFrame(diagram)
        return attachWriteReport({
            success: true,
            message: appendWriteWarnings('Created UMLLinkObject on diagram "' + (diagram.name || diagramId) + '"', report),
            request: Object.assign({}, reqInfo, { body: body }),
            data: {
                _id: view._id,
                _type: view.constructor.name,
                modelId: model ? model._id : undefined,
                modelType: model ? model.constructor.name : undefined,
                name: model ? model.name || '' : ''
            }
        }, report)
    } catch (e) {
        return {
            success: false,
            error: 'Failed to create UMLLinkObject: ' + (e.message || String(e)),
            request: Object.assign({}, reqInfo, { body: body })
        }
    }
}

// --- #10. HTML / Markdown Export ---

const DOC_EXPORT_ALLOWED_FIELDS = ['path', 'format']
const VALID_DOC_EXPORT_FORMATS = ['html', 'markdown']

function exportDocument(body, reqInfo) {
    const err = validate([
        checkUnknownFields(body, DOC_EXPORT_ALLOWED_FIELDS),
        checkFieldType(body, 'path', 'string'),
        checkFieldType(body, 'format', 'string')
    ])
    if (err) {
        return validationError(err, reqInfo, body)
    }

    if (!body.path) {
        return validationError('Field "path" is required', reqInfo, body)
    }
    if (!body.format) {
        return validationError('Field "format" is required. Allowed: ' + VALID_DOC_EXPORT_FORMATS.join(', '), reqInfo, body)
    }
    if (VALID_DOC_EXPORT_FORMATS.indexOf(body.format) === -1) {
        return validationError('Invalid format "' + body.format + '". Allowed: ' + VALID_DOC_EXPORT_FORMATS.join(', '), reqInfo, body)
    }

    const path = require('path')
    if (!path.isAbsolute(body.path)) {
        return validationError('path must be absolute', reqInfo, body)
    }

    try {
        if (body.format === 'html') {
            app.commands.execute('html-export:export', body.path)
        } else {
            app.commands.execute('markdown:export', body.path)
        }

        return {
            success: true,
            message: 'Exported project as ' + body.format + ' to ' + body.path,
            request: Object.assign({}, reqInfo, { body: body }),
            data: { format: body.format, path: body.path }
        }
    } catch (e) {
        return {
            success: false,
            error: 'Failed to export: ' + (e.message || String(e)),
            request: Object.assign({}, reqInfo, { body: body })
        }
    }
}

// ============================================================
// Router
// ============================================================

function parseUrl(url) {
    const parts = url.split('?')
    const path = parts[0]
    const query = {}
    if (parts[1]) {
        try {
            parts[1].split('&').forEach(function (param) {
                const idx = param.indexOf('=')
                const key = idx === -1 ? param : param.substring(0, idx)
                const val = idx === -1 ? '' : param.substring(idx + 1)
                query[decodeURIComponent(key)] = decodeURIComponent(val)
            })
        } catch (e) {
            return { path: path, query: query, error: 'Invalid URL encoding' }
        }
    }
    return { path: path, query: query }
}

function decodePathParam(value) {
    try {
        return decodeURIComponent(value)
    } catch (e) {
        return value
    }
}

/**
 * Small payload for GET /api/status.
 *
 * This endpoint is the reachability check, so it has to stay cheap to call.
 * The full type and endpoint listing used to live here and made every call
 * cost about 46 KB; it moved to buildCapabilities().
 */
// Read once at load. The status endpoint used to report a hardcoded '1.0.0',
// which had drifted from package.json's 1.1.2 — a version that contradicts the
// manifest is worse than none, because callers trust it. Note that this still
// only reports the declared version: it cannot tell you whether a running
// StarUML has picked up edited files, since the number does not change when the
// code does. To check that, probe for a route the build in question added.
const EXTENSION_VERSION = (function () {
    try {
        return require('./package.json').version || 'unknown'
    } catch (e) {
        return 'unknown'
    }
})()

function buildStatus() {
    const data = {
        status: 'running',
        version: EXTENSION_VERSION,
        capabilities: 'GET /api/status/capabilities'
    }
    try {
        const project = app.project.getProject()
        if (project) {
            data.project = {
                name: project.name || '',
                filename: app.project.getFilename() || null
            }
        }
    } catch (e) {
        // No project loaded yet. Status still has to answer.
    }
    return data
}

/**
 * Full type and endpoint listing for GET /api/status/capabilities.
 */
function buildCapabilities() {
    return {
        allowedColumnTypes: ALLOWED_COLUMN_TYPES,
        allowedTagKinds: TAG_KIND_LABELS,
        allowedMessageSorts: VALID_MESSAGE_SORTS,
        allowedInteractionOperators: VALID_INTERACTION_OPERATORS,
        allowedDiagramTypes: ALLOWED_DIAGRAM_TYPES,
        allowedNodeTypes: ALLOWED_NODE_TYPES,
        allowedRelationTypes: ALLOWED_RELATION_TYPES,
        allowedChildTypes: ALLOWED_CHILD_TYPES,
        allowedShapeTypes: ALLOWED_SHAPE_TYPES,
        allowedAlignmentActions: VALID_ALIGNMENT_ACTIONS,
        allowedMermaidTypes: VALID_MERMAID_TYPES,
        allowedGeneratorTypes: VALID_GENERATOR_TYPES,
        allowedMessageTypes: VALID_MESSAGE_TYPES,
        allowedChildContainerFields: CHILD_CONTAINER_FIELDS,
        // EdgeView's own line style constants. A caller reading this does not
        // have to learn them from a rejection, and cannot guess a sixth.
        allowedLineStyles: LINE_STYLE_LABELS,
        // Which body fields each general-purpose write accepts. Read from the
        // same constants the handlers validate against, so a caller can find out
        // what this build takes instead of discovering it from a rejection —
        // and so this listing cannot drift away from the code.
        writableFields: {
            'PUT /api/elements/:id': GENERIC_ELEMENT_UPDATE_FIELDS,
            'POST /api/elements/:id/children': GENERIC_CHILD_CREATE_FIELDS,
            'PUT /api/views/:id': VIEW_UPDATE_FIELDS,
            'PUT /api/views/:id/style': STYLE_ALLOWED_FIELDS,
            'PUT /api/views/:id/points': VIEW_POINTS_FIELDS,
            'POST /api/views/:id/route': EDGE_ROUTE_FIELDS,
            'POST /api/seq/interactions/:id/messages': MESSAGE_ALLOWED_FIELDS,
            'PUT /api/seq/messages/:id': MESSAGE_UPDATE_FIELDS,
            // Relation ends take these inside end1/end2. `reference` moves the
            // end to a different element and re-points every view of the
            // relation; `referenceId` is the same field under the other name.
            'relation end (end1/end2)': ['name', 'navigable', 'aggregation', 'multiplicity', 'reference', 'referenceId']
        },
        endpoints: [
            'GET  /api/status',
            'GET  /api/status/capabilities',
            'GET  /api/erd/diagrams',
            'POST /api/erd/diagrams',
            'GET  /api/erd/diagrams/:id',
            'PUT  /api/erd/diagrams/:id',
            'DELETE /api/erd/diagrams/:id',
            'GET  /api/erd/data-models',
            'POST /api/erd/data-models',
            'GET  /api/erd/data-models/:id',
            'PUT  /api/erd/data-models/:id',
            'DELETE /api/erd/data-models/:id',
            'GET  /api/erd/entities',
            'POST /api/erd/entities',
            'GET  /api/erd/entities/:id',
            'PUT  /api/erd/entities/:id',
            'DELETE /api/erd/entities/:id',
            'GET  /api/erd/entities/:id/columns',
            'POST /api/erd/entities/:id/columns',
            'GET  /api/erd/columns/:id',
            'PUT  /api/erd/columns/:id',
            'DELETE /api/erd/columns/:id',
            'GET  /api/elements/:id/tags',
            'POST /api/elements/:id/tags',
            'GET  /api/tags/:id',
            'PUT  /api/tags/:id',
            'DELETE /api/tags/:id',
            'GET  /api/erd/entities/:id/sequences',
            'POST /api/erd/entities/:id/sequences',
            'GET  /api/erd/sequences/:id',
            'PUT  /api/erd/sequences/:id',
            'DELETE /api/erd/sequences/:id',
            'GET  /api/erd/entities/:id/indexes',
            'POST /api/erd/entities/:id/indexes',
            'GET  /api/erd/indexes/:id',
            'PUT  /api/erd/indexes/:id',
            'DELETE /api/erd/indexes/:id',
            'GET  /api/erd/relationships',
            'POST /api/erd/relationships',
            'GET  /api/erd/relationships/:id',
            'PUT  /api/erd/relationships/:id',
            'DELETE /api/erd/relationships/:id',
            'GET  /api/elements/:id',
            'PUT  /api/elements/:id',
            'DELETE /api/elements/:id',
            'GET  /api/elements/:id/relationships',
            'GET  /api/elements/:id/views',
            'PUT  /api/elements/:id/relocate',
            'GET  /api/diagrams',
            'POST /api/diagrams',
            'GET  /api/diagrams/:id',
            'PUT  /api/diagrams/:id',
            'DELETE /api/diagrams/:id',
            'GET  /api/diagrams/:id/elements',
            'POST /api/diagrams/:id/elements',
            'POST /api/diagrams/:id/relations',
            'POST /api/diagrams/:id/export',
            'POST /api/diagrams/:id/layout',
            'POST /api/diagrams/:id/create-view-of',
            'POST /api/diagrams/:id/link-object',
            'POST /api/diagrams/:id/open',
            'PUT  /api/diagrams/:id/zoom',
            'GET  /api/diagrams/:id/notes',
            'POST /api/diagrams/:id/notes',
            'GET  /api/notes/:id',
            'PUT  /api/notes/:id',
            'DELETE /api/notes/:id',
            'GET  /api/diagrams/:id/note-links',
            'POST /api/diagrams/:id/note-links',
            'DELETE /api/note-links/:id',
            'GET  /api/diagrams/:id/free-lines',
            'POST /api/diagrams/:id/free-lines',
            'DELETE /api/free-lines/:id',
            'GET  /api/diagrams/:id/shapes',
            'POST /api/diagrams/:id/shapes',
            'GET  /api/shapes/:id',
            'PUT  /api/shapes/:id',
            'DELETE /api/shapes/:id',
            'GET  /api/diagrams/:id/views',
            'PUT  /api/views/:id',
            'PUT  /api/views/:id/style',
            'PUT  /api/views/:id/points',
            'POST /api/views/:id/route',
            'PUT  /api/views/:id/reconnect',
            'GET  /api/views/:id/subviews',
            'GET  /api/elements/:id/children',
            'POST /api/elements/:id/children',
            'POST /api/erd/postgresql/ddl',
            'POST /api/project/save',
            'POST /api/project/snapshot',
            'POST /api/project/open',
            'POST /api/project/import',
            'POST /api/project/new',
            'POST /api/project/close',
            'POST /api/project/export',
            'POST /api/project/export-all',
            'POST /api/validate',
            'POST /api/undo',
            'POST /api/redo',
            'GET  /api/search',
            'POST /api/views/align',
            'POST /api/mermaid/import',
            'POST /api/diagrams/generate',
            'PUT  /api/elements/:id/reorder',
            'POST /api/project/export-doc',
            'GET  /api/seq/interactions',
            'POST /api/seq/interactions',
            'GET  /api/seq/interactions/:id',
            'PUT  /api/seq/interactions/:id',
            'DELETE /api/seq/interactions/:id',
            'GET  /api/seq/diagrams',
            'POST /api/seq/diagrams',
            'GET  /api/seq/diagrams/:id',
            'PUT  /api/seq/diagrams/:id',
            'DELETE /api/seq/diagrams/:id',
            'GET  /api/seq/interactions/:id/lifelines',
            'POST /api/seq/interactions/:id/lifelines',
            'GET  /api/seq/lifelines/:id',
            'PUT  /api/seq/lifelines/:id',
            'DELETE /api/seq/lifelines/:id',
            'GET  /api/seq/interactions/:id/messages',
            'POST /api/seq/interactions/:id/messages',
            'GET  /api/seq/messages/:id',
            'PUT  /api/seq/messages/:id',
            'DELETE /api/seq/messages/:id',
            'GET  /api/seq/interactions/:id/combined-fragments',
            'POST /api/seq/interactions/:id/combined-fragments',
            'GET  /api/seq/combined-fragments/:id',
            'PUT  /api/seq/combined-fragments/:id',
            'DELETE /api/seq/combined-fragments/:id',
            'GET  /api/seq/combined-fragments/:id/operands',
            'POST /api/seq/combined-fragments/:id/operands',
            'GET  /api/seq/operands/:id',
            'PUT  /api/seq/operands/:id',
            'DELETE /api/seq/operands/:id',
            'GET  /api/seq/interactions/:id/state-invariants',
            'POST /api/seq/interactions/:id/state-invariants',
            'GET  /api/seq/state-invariants/:id',
            'PUT  /api/seq/state-invariants/:id',
            'DELETE /api/seq/state-invariants/:id',
            'GET  /api/seq/interactions/:id/interaction-uses',
            'POST /api/seq/interactions/:id/interaction-uses',
            'GET  /api/seq/interaction-uses/:id',
            'PUT  /api/seq/interaction-uses/:id',
            'DELETE /api/seq/interaction-uses/:id'
        ].concat(familyEndpoints)
    }
}


function route(method, url, body) {
    // Ensure body is a valid object for mutation requests
    if (body !== null && body !== undefined && typeof body !== 'object') {
        return { success: false, error: 'Request body must be a JSON object', request: { method: method, path: url } }
    }
    if (!body) {
        body = {}
    }

    const parsed = parseUrl(url)
    if (parsed.error) {
        return { success: false, error: parsed.error, request: { method: method, path: url } }
    }
    let path = parsed.path
    const query = parsed.query

    if (path.length > 1 && path[path.length - 1] === '/') {
        path = path.substring(0, path.length - 1)
    }

    const reqInfo = { method: method, path: path }
    if (Object.keys(query).length > 0) {
        reqInfo.query = query
    }

    let match

    // GET /api/erd/diagrams
    if (method === 'GET' && path === '/api/erd/diagrams') {
        return getDiagrams(reqInfo)
    }

    // POST /api/erd/diagrams
    if (method === 'POST' && path === '/api/erd/diagrams') {
        return createDiagram(body, reqInfo)
    }

    // /api/erd/diagrams/:id
    match = path.match(/^\/api\/erd\/diagrams\/([^/]+)$/)
    if (match) {
        if (method === 'GET') {
            return getDiagram(decodePathParam(match[1]), reqInfo)
        }
        if (method === 'PUT') {
            return updateDiagram(decodePathParam(match[1]), body, reqInfo)
        }
        if (method === 'DELETE') {
            return deleteDiagram(decodePathParam(match[1]), reqInfo)
        }
    }

    // GET /api/erd/data-models
    if (method === 'GET' && path === '/api/erd/data-models') {
        return getDataModels(reqInfo)
    }

    // POST /api/erd/data-models
    if (method === 'POST' && path === '/api/erd/data-models') {
        return createDataModel(body, reqInfo)
    }

    // /api/erd/data-models/:id
    match = path.match(/^\/api\/erd\/data-models\/([^/]+)$/)
    if (match) {
        if (method === 'GET') {
            return getDataModel(decodePathParam(match[1]), reqInfo)
        }
        if (method === 'PUT') {
            return updateDataModel(decodePathParam(match[1]), body, reqInfo)
        }
        if (method === 'DELETE') {
            return deleteDataModel(decodePathParam(match[1]), reqInfo)
        }
    }

    // GET /api/erd/entities
    if (method === 'GET' && path === '/api/erd/entities') {
        return getEntities(query, reqInfo)
    }

    // POST /api/erd/entities
    if (method === 'POST' && path === '/api/erd/entities') {
        return createEntity(body, reqInfo)
    }

    // /api/erd/entities/:id
    match = path.match(/^\/api\/erd\/entities\/([^/]+)$/)
    if (match) {
        if (method === 'GET') {
            return getEntity(decodePathParam(match[1]), reqInfo)
        }
        if (method === 'PUT') {
            return updateEntity(decodePathParam(match[1]), body, reqInfo)
        }
        if (method === 'DELETE') {
            return deleteEntity(decodePathParam(match[1]), reqInfo)
        }
    }

    // /api/erd/entities/:id/columns
    match = path.match(/^\/api\/erd\/entities\/([^/]+)\/columns$/)
    if (match) {
        if (method === 'GET') {
            return getColumns(decodePathParam(match[1]), reqInfo)
        }
        if (method === 'POST') {
            return createColumn(decodePathParam(match[1]), body, reqInfo)
        }
    }

    // /api/erd/columns/:id
    match = path.match(/^\/api\/erd\/columns\/([^/]+)$/)
    if (match) {
        if (method === 'GET') {
            return getColumn(decodePathParam(match[1]), reqInfo)
        }
        if (method === 'PUT') {
            return updateColumn(decodePathParam(match[1]), body, reqInfo)
        }
        if (method === 'DELETE') {
            return deleteColumn(decodePathParam(match[1]), reqInfo)
        }
    }

    // /api/elements/:id/tags
    match = path.match(/^\/api\/elements\/([^/]+)\/tags$/)
    if (match) {
        if (method === 'GET') {
            return getTags(decodePathParam(match[1]), reqInfo)
        }
        if (method === 'POST') {
            return createTag(decodePathParam(match[1]), body, reqInfo)
        }
    }

    // /api/tags/:id
    match = path.match(/^\/api\/tags\/([^/]+)$/)
    if (match) {
        if (method === 'GET') {
            return getTag(decodePathParam(match[1]), reqInfo)
        }
        if (method === 'PUT') {
            return updateTag(decodePathParam(match[1]), body, reqInfo)
        }
        if (method === 'DELETE') {
            return deleteTag(decodePathParam(match[1]), reqInfo)
        }
    }

    // GET /api/erd/relationships
    if (method === 'GET' && path === '/api/erd/relationships') {
        return getRelationships(query, reqInfo)
    }

    // POST /api/erd/relationships
    if (method === 'POST' && path === '/api/erd/relationships') {
        return createRelationship(body, reqInfo)
    }

    // /api/erd/relationships/:id
    match = path.match(/^\/api\/erd\/relationships\/([^/]+)$/)
    if (match) {
        if (method === 'GET') {
            return getRelationship(decodePathParam(match[1]), reqInfo)
        }
        if (method === 'PUT') {
            return updateRelationship(decodePathParam(match[1]), body, reqInfo)
        }
        if (method === 'DELETE') {
            return deleteRelationship(decodePathParam(match[1]), reqInfo)
        }
    }

    // /api/erd/entities/:id/sequences
    match = path.match(/^\/api\/erd\/entities\/([^/]+)\/sequences$/)
    if (match) {
        if (method === 'GET') {
            return getSequences(decodePathParam(match[1]), reqInfo)
        }
        if (method === 'POST') {
            return createSequence(decodePathParam(match[1]), body, reqInfo)
        }
    }

    // /api/erd/sequences/:id
    match = path.match(/^\/api\/erd\/sequences\/([^/]+)$/)
    if (match) {
        if (method === 'GET') {
            return getSequence(decodePathParam(match[1]), reqInfo)
        }
        if (method === 'PUT') {
            return updateSequence(decodePathParam(match[1]), body, reqInfo)
        }
        if (method === 'DELETE') {
            return deleteSequence(decodePathParam(match[1]), reqInfo)
        }
    }

    // /api/erd/entities/:id/indexes
    match = path.match(/^\/api\/erd\/entities\/([^/]+)\/indexes$/)
    if (match) {
        if (method === 'GET') {
            return getIndexes(decodePathParam(match[1]), reqInfo)
        }
        if (method === 'POST') {
            return createIndex(decodePathParam(match[1]), body, reqInfo)
        }
    }

    // /api/erd/indexes/:id
    match = path.match(/^\/api\/erd\/indexes\/([^/]+)$/)
    if (match) {
        if (method === 'GET') {
            return getIndex(decodePathParam(match[1]), reqInfo)
        }
        if (method === 'PUT') {
            return updateIndex(decodePathParam(match[1]), body, reqInfo)
        }
        if (method === 'DELETE') {
            return deleteIndex(decodePathParam(match[1]), reqInfo)
        }
    }

    // POST /api/erd/postgresql/ddl
    if (method === 'POST' && path === '/api/erd/postgresql/ddl') {
        return generatePostgresqlDDL(body, reqInfo)
    }

    // ============ Sequence Diagram Routes ============

    // GET /api/seq/interactions
    if (method === 'GET' && path === '/api/seq/interactions') {
        return getInteractions(reqInfo)
    }

    // POST /api/seq/interactions
    if (method === 'POST' && path === '/api/seq/interactions') {
        return createInteraction(body, reqInfo)
    }

    // /api/seq/interactions/:id
    match = path.match(/^\/api\/seq\/interactions\/([^/]+)$/)
    if (match) {
        if (method === 'GET') {
            return getInteraction(decodePathParam(match[1]), reqInfo)
        }
        if (method === 'PUT') {
            return updateInteraction(decodePathParam(match[1]), body, reqInfo)
        }
        if (method === 'DELETE') {
            return deleteInteraction(decodePathParam(match[1]), reqInfo)
        }
    }

    // GET /api/seq/diagrams
    if (method === 'GET' && path === '/api/seq/diagrams') {
        return getSeqDiagrams(reqInfo)
    }

    // POST /api/seq/diagrams
    if (method === 'POST' && path === '/api/seq/diagrams') {
        return createSeqDiagram(body, reqInfo)
    }

    // /api/seq/diagrams/:id
    match = path.match(/^\/api\/seq\/diagrams\/([^/]+)$/)
    if (match) {
        if (method === 'GET') {
            return getSeqDiagram(decodePathParam(match[1]), reqInfo)
        }
        if (method === 'PUT') {
            return updateSeqDiagram(decodePathParam(match[1]), body, reqInfo)
        }
        if (method === 'DELETE') {
            return deleteSeqDiagram(decodePathParam(match[1]), reqInfo)
        }
    }

    // /api/seq/interactions/:id/lifelines
    match = path.match(/^\/api\/seq\/interactions\/([^/]+)\/lifelines$/)
    if (match) {
        if (method === 'GET') {
            return getLifelines(decodePathParam(match[1]), reqInfo)
        }
        if (method === 'POST') {
            return createLifeline(decodePathParam(match[1]), body, reqInfo)
        }
    }

    // /api/seq/lifelines/:id
    match = path.match(/^\/api\/seq\/lifelines\/([^/]+)$/)
    if (match) {
        if (method === 'GET') {
            return getLifeline(decodePathParam(match[1]), reqInfo)
        }
        if (method === 'PUT') {
            return updateLifeline(decodePathParam(match[1]), body, reqInfo)
        }
        if (method === 'DELETE') {
            return deleteLifeline(decodePathParam(match[1]), reqInfo)
        }
    }

    // /api/seq/interactions/:id/messages
    match = path.match(/^\/api\/seq\/interactions\/([^/]+)\/messages$/)
    if (match) {
        if (method === 'GET') {
            return getMessages(decodePathParam(match[1]), reqInfo)
        }
        if (method === 'POST') {
            return createMessage(decodePathParam(match[1]), body, reqInfo)
        }
    }

    // /api/seq/messages/:id
    match = path.match(/^\/api\/seq\/messages\/([^/]+)$/)
    if (match) {
        if (method === 'GET') {
            return getMessage(decodePathParam(match[1]), reqInfo)
        }
        if (method === 'PUT') {
            return updateMessage(decodePathParam(match[1]), body, reqInfo)
        }
        if (method === 'DELETE') {
            return deleteMessage(decodePathParam(match[1]), reqInfo)
        }
    }

    // /api/seq/interactions/:id/combined-fragments
    match = path.match(/^\/api\/seq\/interactions\/([^/]+)\/combined-fragments$/)
    if (match) {
        if (method === 'GET') {
            return getCombinedFragments(decodePathParam(match[1]), reqInfo)
        }
        if (method === 'POST') {
            return createCombinedFragment(decodePathParam(match[1]), body, reqInfo)
        }
    }

    // /api/seq/combined-fragments/:id
    match = path.match(/^\/api\/seq\/combined-fragments\/([^/]+)$/)
    if (match) {
        if (method === 'GET') {
            return getCombinedFragment(decodePathParam(match[1]), reqInfo)
        }
        if (method === 'PUT') {
            return updateCombinedFragment(decodePathParam(match[1]), body, reqInfo)
        }
        if (method === 'DELETE') {
            return deleteCombinedFragment(decodePathParam(match[1]), reqInfo)
        }
    }

    // /api/seq/combined-fragments/:id/operands
    match = path.match(/^\/api\/seq\/combined-fragments\/([^/]+)\/operands$/)
    if (match) {
        if (method === 'GET') {
            return getOperands(decodePathParam(match[1]), reqInfo)
        }
        if (method === 'POST') {
            return createOperand(decodePathParam(match[1]), body, reqInfo)
        }
    }

    // /api/seq/operands/:id
    match = path.match(/^\/api\/seq\/operands\/([^/]+)$/)
    if (match) {
        if (method === 'GET') {
            return getOperand(decodePathParam(match[1]), reqInfo)
        }
        if (method === 'PUT') {
            return updateOperand(decodePathParam(match[1]), body, reqInfo)
        }
        if (method === 'DELETE') {
            return deleteOperand(decodePathParam(match[1]), reqInfo)
        }
    }

    // /api/seq/interactions/:id/state-invariants
    match = path.match(/^\/api\/seq\/interactions\/([^/]+)\/state-invariants$/)
    if (match) {
        if (method === 'GET') {
            return getStateInvariants(decodePathParam(match[1]), reqInfo)
        }
        if (method === 'POST') {
            return createStateInvariant(decodePathParam(match[1]), body, reqInfo)
        }
    }

    // /api/seq/state-invariants/:id
    match = path.match(/^\/api\/seq\/state-invariants\/([^/]+)$/)
    if (match) {
        if (method === 'GET') {
            return getStateInvariant(decodePathParam(match[1]), reqInfo)
        }
        if (method === 'PUT') {
            return updateStateInvariant(decodePathParam(match[1]), body, reqInfo)
        }
        if (method === 'DELETE') {
            return deleteStateInvariant(decodePathParam(match[1]), reqInfo)
        }
    }

    // /api/seq/interactions/:id/interaction-uses
    match = path.match(/^\/api\/seq\/interactions\/([^/]+)\/interaction-uses$/)
    if (match) {
        if (method === 'GET') {
            return getInteractionUses(decodePathParam(match[1]), reqInfo)
        }
        if (method === 'POST') {
            return createInteractionUse(decodePathParam(match[1]), body, reqInfo)
        }
    }

    // /api/seq/interaction-uses/:id
    match = path.match(/^\/api\/seq\/interaction-uses\/([^/]+)$/)
    if (match) {
        if (method === 'GET') {
            return getInteractionUse(decodePathParam(match[1]), reqInfo)
        }
        if (method === 'PUT') {
            return updateInteractionUse(decodePathParam(match[1]), body, reqInfo)
        }
        if (method === 'DELETE') {
            return deleteInteractionUse(decodePathParam(match[1]), reqInfo)
        }
    }

    // POST /api/project/save
    if (method === 'POST' && path === '/api/project/save') {
        return saveProject(body, reqInfo)
    }

    // POST /api/project/snapshot
    if (method === 'POST' && path === '/api/project/snapshot') {
        return snapshotProject(body, reqInfo)
    }

    // POST /api/project/open
    if (method === 'POST' && path === '/api/project/open') {
        return openProject(body, reqInfo)
    }

    // POST /api/project/import
    if (method === 'POST' && path === '/api/project/import') {
        return importProject(body, reqInfo)
    }

    // POST /api/project/new
    if (method === 'POST' && path === '/api/project/new') {
        return newProject(reqInfo)
    }

    // POST /api/project/close
    if (method === 'POST' && path === '/api/project/close') {
        return closeProject(reqInfo)
    }

    // POST /api/project/export
    if (method === 'POST' && path === '/api/project/export') {
        return exportFragment(body, reqInfo)
    }

    // POST /api/project/export-all
    if (method === 'POST' && path === '/api/project/export-all') {
        return exportAllDiagrams(body, reqInfo)
    }

    // POST /api/validate
    if (method === 'POST' && path === '/api/validate') {
        return validateModel(reqInfo)
    }

    // POST /api/undo
    if (method === 'POST' && path === '/api/undo') {
        return undoAction(reqInfo)
    }

    // POST /api/redo
    if (method === 'POST' && path === '/api/redo') {
        return redoAction(reqInfo)
    }

    // GET /api/search
    if (method === 'GET' && path === '/api/search') {
        return searchElements(query, reqInfo)
    }

    // POST /api/views/align
    if (method === 'POST' && path === '/api/views/align') {
        return alignViews(body, reqInfo)
    }

    // POST /api/mermaid/import
    if (method === 'POST' && path === '/api/mermaid/import') {
        return importMermaid(body, reqInfo)
    }

    // POST /api/diagrams/generate
    if (method === 'POST' && path === '/api/diagrams/generate') {
        return generateDiagram(body, reqInfo)
    }

    // PUT /api/elements/:id/reorder
    match = path.match(/^\/api\/elements\/([^/]+)\/reorder$/)
    if (match && method === 'PUT') {
        return reorderElement(decodePathParam(match[1]), body, reqInfo)
    }

    // POST /api/project/export-doc
    if (method === 'POST' && path === '/api/project/export-doc') {
        return exportDocument(body, reqInfo)
    }

    // ============ Generic / Cross-diagram Routes ============

    // GET /api/diagrams
    if (method === 'GET' && path === '/api/diagrams') {
        return getAllDiagrams(query, reqInfo)
    }

    // POST /api/diagrams (create any diagram type)
    if (method === 'POST' && path === '/api/diagrams') {
        return createGenericDiagram(body, reqInfo)
    }

    // POST /api/diagrams/:id/export
    match = path.match(/^\/api\/diagrams\/([^/]+)\/export$/)
    if (match && method === 'POST') {
        return exportDiagramImage(decodePathParam(match[1]), body, reqInfo)
    }

    // POST /api/diagrams/:id/layout
    match = path.match(/^\/api\/diagrams\/([^/]+)\/layout$/)
    if (match && method === 'POST') {
        return layoutDiagram(decodePathParam(match[1]), body, reqInfo)
    }

    // /api/diagrams/:id/elements
    match = path.match(/^\/api\/diagrams\/([^/]+)\/elements$/)
    if (match) {
        if (method === 'GET') {
            return getDiagramElements(decodePathParam(match[1]), reqInfo)
        }
        if (method === 'POST') {
            return createDiagramElement(decodePathParam(match[1]), body, reqInfo)
        }
    }

    // /api/diagrams/:id/relations
    match = path.match(/^\/api\/diagrams\/([^/]+)\/relations$/)
    if (match && method === 'POST') {
        return createDiagramRelation(decodePathParam(match[1]), body, reqInfo)
    }

    // /api/diagrams/:id/notes
    match = path.match(/^\/api\/diagrams\/([^/]+)\/notes$/)
    if (match) {
        if (method === 'GET') {
            return getDiagramNotes(decodePathParam(match[1]), reqInfo)
        }
        if (method === 'POST') {
            return createNote(decodePathParam(match[1]), body, reqInfo)
        }
    }

    // /api/notes/:id
    match = path.match(/^\/api\/notes\/([^/]+)$/)
    if (match) {
        if (method === 'GET') {
            return getNote(decodePathParam(match[1]), reqInfo)
        }
        if (method === 'PUT') {
            return updateNote(decodePathParam(match[1]), body, reqInfo)
        }
        if (method === 'DELETE') {
            return deleteNote(decodePathParam(match[1]), reqInfo)
        }
    }

    // /api/diagrams/:id/note-links
    match = path.match(/^\/api\/diagrams\/([^/]+)\/note-links$/)
    if (match) {
        if (method === 'GET') {
            return getDiagramNoteLinks(decodePathParam(match[1]), reqInfo)
        }
        if (method === 'POST') {
            return createNoteLink(decodePathParam(match[1]), body, reqInfo)
        }
    }

    // /api/note-links/:id
    match = path.match(/^\/api\/note-links\/([^/]+)$/)
    if (match && method === 'DELETE') {
        return deleteNoteLink(decodePathParam(match[1]), reqInfo)
    }

    // /api/diagrams/:id/free-lines
    match = path.match(/^\/api\/diagrams\/([^/]+)\/free-lines$/)
    if (match) {
        if (method === 'GET') {
            return getDiagramFreeLines(decodePathParam(match[1]), reqInfo)
        }
        if (method === 'POST') {
            return createFreeLine(decodePathParam(match[1]), body, reqInfo)
        }
    }

    // /api/free-lines/:id
    match = path.match(/^\/api\/free-lines\/([^/]+)$/)
    if (match && method === 'DELETE') {
        return deleteFreeLine(decodePathParam(match[1]), reqInfo)
    }

    // /api/diagrams/:id/shapes
    match = path.match(/^\/api\/diagrams\/([^/]+)\/shapes$/)
    if (match) {
        if (method === 'GET') {
            return getDiagramShapes(decodePathParam(match[1]), reqInfo)
        }
        if (method === 'POST') {
            return createShape(decodePathParam(match[1]), body, reqInfo)
        }
    }

    // /api/diagrams/:id/create-view-of
    match = path.match(/^\/api\/diagrams\/([^/]+)\/create-view-of$/)
    if (match && method === 'POST') {
        return createViewOf(decodePathParam(match[1]), body, reqInfo)
    }

    // /api/diagrams/:id/link-object
    match = path.match(/^\/api\/diagrams\/([^/]+)\/link-object$/)
    if (match && method === 'POST') {
        return createLinkObject(decodePathParam(match[1]), body, reqInfo)
    }

    // /api/diagrams/:id/open
    match = path.match(/^\/api\/diagrams\/([^/]+)\/open$/)
    if (match && method === 'POST') {
        return openDiagram(decodePathParam(match[1]), reqInfo)
    }

    // /api/diagrams/:id/zoom
    match = path.match(/^\/api\/diagrams\/([^/]+)\/zoom$/)
    if (match && method === 'PUT') {
        return setDiagramZoom(decodePathParam(match[1]), body, reqInfo)
    }

    // /api/diagrams/:id/views
    match = path.match(/^\/api\/diagrams\/([^/]+)\/views$/)
    if (match && method === 'GET') {
        return getDiagramViews(decodePathParam(match[1]), reqInfo)
    }

    // /api/diagrams/:id (generic GET/PUT/DELETE)
    match = path.match(/^\/api\/diagrams\/([^/]+)$/)
    if (match) {
        if (method === 'GET') {
            return getGenericDiagram(decodePathParam(match[1]), reqInfo)
        }
        if (method === 'PUT') {
            return updateGenericDiagram(decodePathParam(match[1]), body, reqInfo)
        }
        if (method === 'DELETE') {
            return deleteGenericDiagram(decodePathParam(match[1]), reqInfo)
        }
    }

    // /api/shapes/:id
    match = path.match(/^\/api\/shapes\/([^/]+)$/)
    if (match) {
        if (method === 'GET') {
            return getShape(decodePathParam(match[1]), reqInfo)
        }
        if (method === 'PUT') {
            return updateShape(decodePathParam(match[1]), body, reqInfo)
        }
        if (method === 'DELETE') {
            return deleteShape(decodePathParam(match[1]), reqInfo)
        }
    }

    // /api/views/:id/reconnect
    match = path.match(/^\/api\/views\/([^/]+)\/reconnect$/)
    if (match && method === 'PUT') {
        return reconnectEdge(decodePathParam(match[1]), body, reqInfo)
    }

    // /api/views/:id/style
    match = path.match(/^\/api\/views\/([^/]+)\/style$/)
    if (match && method === 'PUT') {
        return updateViewStyle(decodePathParam(match[1]), body, reqInfo)
    }

    // /api/views/:id/points
    match = path.match(/^\/api\/views\/([^/]+)\/points$/)
    if (match && method === 'PUT') {
        return updateViewPoints(decodePathParam(match[1]), body, reqInfo)
    }

    // /api/views/:id/route
    match = path.match(/^\/api\/views\/([^/]+)\/route$/)
    if (match && method === 'POST') {
        return routeViewEdge(decodePathParam(match[1]), body, reqInfo)
    }

    // /api/views/:id/subviews
    match = path.match(/^\/api\/views\/([^/]+)\/subviews$/)
    if (match && method === 'GET') {
        return getSubViews(decodePathParam(match[1]), query, reqInfo)
    }

    // /api/views/:id
    match = path.match(/^\/api\/views\/([^/]+)$/)
    if (match && method === 'PUT') {
        return updateView(decodePathParam(match[1]), body, reqInfo)
    }

    // /api/elements/:id/relationships
    match = path.match(/^\/api\/elements\/([^/]+)\/relationships$/)
    if (match && method === 'GET') {
        return getElementRelationships(decodePathParam(match[1]), reqInfo)
    }

    // /api/elements/:id/views
    match = path.match(/^\/api\/elements\/([^/]+)\/views$/)
    if (match && method === 'GET') {
        return getElementViews(decodePathParam(match[1]), reqInfo)
    }

    // /api/elements/:id/relocate
    match = path.match(/^\/api\/elements\/([^/]+)\/relocate$/)
    if (match && method === 'PUT') {
        return relocateElement(decodePathParam(match[1]), body, reqInfo)
    }

    // /api/elements/:id/children
    match = path.match(/^\/api\/elements\/([^/]+)\/children$/)
    if (match) {
        if (method === 'GET') {
            return listChildElements(decodePathParam(match[1]), query, reqInfo)
        }
        if (method === 'POST') {
            return createChildElement(decodePathParam(match[1]), body, reqInfo)
        }
    }

    // /api/elements/:id
    match = path.match(/^\/api\/elements\/([^/]+)$/)
    if (match) {
        if (method === 'GET') {
            return getElement(decodePathParam(match[1]), reqInfo)
        }
        if (method === 'PUT') {
            return updateGenericElement(decodePathParam(match[1]), body, reqInfo)
        }
        if (method === 'DELETE') {
            return deleteGenericElement(decodePathParam(match[1]), reqInfo)
        }
    }

    // ============ Family API Routes (factory-generated) ============
    for (let fi = 0; fi < familyRouters.length; fi++) {
        const familyResult = familyRouters[fi](method, path, query, body, reqInfo)
        if (familyResult !== null) {
            return familyResult
        }
    }

    // GET /api/status
    if (method === 'GET' && (path === '/api/status' || path === '/')) {
        return {
            success: true,
            message: 'Server is running',
            request: reqInfo,
            data: buildStatus()
        }
    }

    // GET /api/status/capabilities
    if (method === 'GET' && path === '/api/status/capabilities') {
        return {
            success: true,
            message: 'Capabilities',
            request: reqInfo,
            data: buildCapabilities()
        }
    }

    return { success: false, error: 'Not found: ' + method + ' ' + path, request: reqInfo }
}

exports.route = route
