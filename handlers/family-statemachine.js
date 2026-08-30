const VALID_PSEUDOSTATE_KINDS = [
    'initial', 'deepHistory', 'shallowHistory', 'join', 'fork',
    'junction', 'choice', 'entryPoint', 'exitPoint'
]

// UMLEvent.kind values. StarUML has no UMLTimeEvent/UMLSignalEvent classes --
// a single UMLEvent carries the kind. Time events are kind='time' with the
// duration in `expression`; the canvas label comes from `name` (e.g. 'after(10 s)').
const VALID_EVENT_KINDS = ['signal', 'call', 'change', 'time', 'anyReceive']

// UMLTransition.kind values. 'internal' is how a state reacts to an event
// without leaving itself, which cannot be drawn as an ordinary arrow.
const VALID_TRANSITION_KINDS = ['external', 'internal', 'local']

function serializeTrigger(elem) {
    if (!elem) return null
    return {
        _id: elem._id,
        _type: elem.constructor.name,
        name: elem.name || '',
        kind: elem.kind || 'anyReceive',
        expression: elem.expression || '',
        value: elem.value || '',
        documentation: elem.documentation || undefined,
        _parentId: elem._parent ? elem._parent._id : null
    }
}

function serializeTransition(elem) {
    if (!elem) return null
    const result = {
        _id: elem._id,
        _type: elem.constructor.name,
        name: elem.name || '',
        kind: elem.kind || 'external',
        guard: elem.guard || '',
        triggers: (elem.triggers || []).map(serializeTrigger),
        documentation: elem.documentation || undefined,
        _parentId: elem._parent ? elem._parent._id : null
    }
    if (elem.stereotype) {
        result.stereotype = elem.stereotype
    }
    if (elem.source) {
        result.sourceId = elem.source._id || null
        result.sourceName = elem.source.name || ''
    }
    if (elem.target) {
        result.targetId = elem.target._id || null
        result.targetName = elem.target.name || ''
    }
    // The label StarUML actually paints: triggers [guard] / effects,
    // prefixed with 'name : ' when the transition itself is named.
    if (typeof elem.getString === 'function') {
        result.label = elem.getString()
    }
    return result
}

module.exports = {
    prefix: 'statemachine',
    label: 'State Machine Diagram',
    diagrams: { types: ['UMLStatechartDiagram'] },
    resources: [
        {
            name: 'states',
            types: ['UMLState', 'UMLSubmachineState'],
            children: [
                { name: 'regions', type: 'UMLRegion', field: 'regions' }
            ]
        },
        {
            name: 'pseudostates',
            types: ['UMLPseudostate'],
            createFields: [{ param: 'pseudostateKind', prop: 'kind' }],
            serialize: function (elem) {
                if (!elem) return null
                return {
                    _id: elem._id,
                    _type: elem.constructor.name,
                    name: elem.name || '',
                    kind: elem.kind || 'initial',
                    documentation: elem.documentation || undefined,
                    _parentId: elem._parent ? elem._parent._id : null
                }
            }
        },
        { name: 'final-states', types: ['UMLFinalState'] }
    ],
    relations: [
        {
            name: 'transitions',
            type: 'UMLTransition',
            updateFields: [
                'name', 'documentation', 'guard',
                { name: 'kind', type: 'string', prop: 'kind', values: VALID_TRANSITION_KINDS }
            ],
            createFields: [
                'guard',
                { param: 'kind', prop: 'kind', values: VALID_TRANSITION_KINDS }
            ],
            serialize: serializeTransition,
            children: [
                {
                    name: 'triggers',
                    type: 'UMLEvent',
                    field: 'triggers',
                    createFields: [
                        { param: 'eventKind', prop: 'kind', values: VALID_EVENT_KINDS },
                        { param: 'expression', prop: 'expression' },
                        { param: 'value', prop: 'value' }
                    ],
                    updateFields: [
                        'name', 'documentation',
                        { name: 'eventKind', type: 'string', prop: 'kind', values: VALID_EVENT_KINDS },
                        { name: 'expression', type: 'string' },
                        { name: 'value', type: 'string' }
                    ],
                    serialize: serializeTrigger
                }
            ]
        }
    ],
    _constants: {
        validPseudostateKinds: VALID_PSEUDOSTATE_KINDS,
        validEventKinds: VALID_EVENT_KINDS,
        validTransitionKinds: VALID_TRANSITION_KINDS
    }
}
