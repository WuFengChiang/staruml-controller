module.exports = {
    prefix: 'activity',
    label: 'Activity Diagram',
    diagrams: { types: ['UMLActivityDiagram'] },
    resources: [
        {
            name: 'actions',
            types: ['UMLAction'],
            // UMLStructuredActivityNode extends UMLAction and has no endpoint of
            // its own. Listing matches exact type names, so without it here the
            // API can create one (it is in ALLOWED_NODE_TYPES) and then never
            // find it again. Listed and addressable, but still not created here.
            modelTypes: ['UMLAction', 'UMLStructuredActivityNode'],
            createFields: ['body'],
            updateFields: ['name', 'documentation', 'body'],
            serialize: function (elem) {
                const result = require('./crud-factory').defaultSerializeNode(elem)
                if (elem.body !== undefined) result.body = elem.body || ''
                return result
            },
            children: [
                { name: 'pins', type: 'UMLInputPin', field: 'inputs', createFields: ['name'] },
                { name: 'output-pins', type: 'UMLOutputPin', field: 'outputs', createFields: ['name'] }
            ]
        },
        {
            name: 'control-nodes',
            types: [
                'UMLInitialNode', 'UMLActivityFinalNode', 'UMLFlowFinalNode',
                'UMLForkNode', 'UMLJoinNode', 'UMLMergeNode', 'UMLDecisionNode',
                'UMLActivityEdgeConnector'
            ]
        },
        {
            name: 'object-nodes',
            types: ['UMLObjectNode', 'UMLCentralBufferNode', 'UMLDataStoreNode'],
            // UMLActivityParameterNode extends UMLObjectNode; same story as
            // UMLStructuredActivityNode above.
            modelTypes: ['UMLObjectNode', 'UMLCentralBufferNode', 'UMLDataStoreNode',
                'UMLActivityParameterNode']
        },
        { name: 'partitions', types: ['UMLActivityPartition'] },
        { name: 'regions', types: ['UMLExpansionRegion', 'UMLInterruptibleActivityRegion'] }
    ],
    relations: [
        { name: 'control-flows', type: 'UMLControlFlow', updateFields: ['name', 'documentation', 'guard'] },
        { name: 'object-flows', type: 'UMLObjectFlow' },
        { name: 'exception-handlers', type: 'UMLExceptionHandler' },
        { name: 'activity-interrupts', type: 'UMLActivityInterrupt' }
    ]
}
