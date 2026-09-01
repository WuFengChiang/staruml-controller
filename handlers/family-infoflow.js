module.exports = {
    prefix: 'infoflow',
    label: 'Information Flow Diagram',
    diagrams: { types: ['UMLInformationFlowDiagram'] },
    resources: [
        { name: 'info-items', types: ['UMLInformationItem'] }
    ],
    relations: [
        // SysMLItemFlow extends UMLInformationFlow and no endpoint declares it, so
        // exact-type matching left it unreachable. `type` is still what this
        // endpoint creates; `modelTypes` only widens what it will list and address.
        {
            name: 'information-flows',
            type: 'UMLInformationFlow',
            modelTypes: ['UMLInformationFlow', 'SysMLItemFlow']
        }
    ]
}
