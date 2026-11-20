module.exports = {
    prefix: 'timing',
    label: 'Timing Diagram',
    diagrams: { types: ['UMLTimingDiagram'] },
    resources: [
        { name: 'lifelines', types: ['UMLLifeline'] },
        // UMLIntervalConstraint and its two subtypes extend UMLConstraint and have
        // no endpoint of their own; UMLTimeConstraint and UMLDurationConstraint are
        // both in ALLOWED_NODE_TYPES, so the API can create what it could not list.
        {
            name: 'timing-states',
            types: ['UMLTimingState'],
            modelTypes: ['UMLConstraint', 'UMLIntervalConstraint',
                'UMLTimeConstraint', 'UMLDurationConstraint']
        }
    ],
    relations: [
        { name: 'time-segments', type: 'UMLTimeSegment', modelType: 'UMLStateInvariant', targetOptional: true }
    ]
}
