const h = require('./shared-helpers')

module.exports = {
    prefix: 'class',
    label: 'Class/Package Diagram',
    diagrams: { types: ['UMLClassDiagram', 'UMLPackageDiagram'] },
    resources: [
        {
            name: 'classes',
            types: ['UMLClass'],
            updateFields: [
                'name', 'documentation',
                { name: 'isAbstract', type: 'boolean' },
                { name: 'isLeaf', type: 'boolean' },
                { name: 'isActive', type: 'boolean' }
            ],
            children: [
                { name: 'attributes', type: 'UMLAttribute', field: 'attributes', createFields: ['name', 'type', 'visibility', 'isStatic', 'defaultValue'] },
                { name: 'operations', type: 'UMLOperation', field: 'operations', createFields: ['name', 'visibility', 'isStatic'] },
                { name: 'receptions', type: 'UMLReception', field: 'receptions' },
                { name: 'template-parameters', type: 'UMLTemplateParameter', field: 'templateParameters' }
            ],
            serialize: function (elem) {
                if (!elem) return null
                const result = {
                    _id: elem._id,
                    _type: elem.constructor.name,
                    name: elem.name || '',
                    _parentId: elem._parent ? elem._parent._id : null
                }
                if (elem.documentation) result.documentation = elem.documentation
                if (elem.isAbstract) result.isAbstract = true
                if (elem.isLeaf) result.isLeaf = true
                if (elem.isActive) result.isActive = true
                result.attributes = (elem.attributes || []).map(function (a) {
                    // `type` holds either a plain string or a reference to a
                    // classifier. Passing the reference straight through put the
                    // whole element into the response, and with it `_parent` — a
                    // cycle JSON.stringify cannot take, which hung every call to
                    // this endpoint as soon as one attribute pointed at a class.
                    // Report both shapes the way serializeElement does, and keep
                    // `type` a string so existing callers still read a name.
                    const out = { _id: a._id, name: a.name || '', type: '', visibility: a.visibility, isStatic: a.isStatic || false }
                    if (a.type && typeof a.type === 'object') {
                        out.type = a.type.name || ''
                        out.typeId = a.type._id
                        out.typeName = a.type.name || ''
                    } else if (a.type) {
                        out.type = a.type
                        out.typeName = a.type
                    }
                    return out
                })
                result.operations = (elem.operations || []).map(function (o) {
                    const out = { _id: o._id, name: o.name || '', visibility: o.visibility, isStatic: o.isStatic || false }
                    const parameters = h.serializeParameters(o)
                    if (parameters !== undefined) {
                        out.parameters = parameters
                    }
                    return out
                })
                return result
            }
        },
        {
            name: 'interfaces',
            types: ['UMLInterface'],
            children: [
                { name: 'attributes', type: 'UMLAttribute', field: 'attributes', createFields: ['name', 'type', 'visibility'] },
                { name: 'operations', type: 'UMLOperation', field: 'operations', createFields: ['name', 'visibility'] }
            ]
        },
        {
            name: 'enumerations',
            types: ['UMLEnumeration'],
            children: [
                { name: 'literals', type: 'UMLEnumerationLiteral', field: 'literals' }
            ]
        },
        {
            name: 'data-types',
            types: ['UMLDataType', 'UMLPrimitiveType', 'UMLSignal']
        },
        {
            name: 'packages',
            types: ['UMLPackage', 'UMLModel', 'UMLSubsystem']
        }
    ],
    relations: [
        {
            name: 'associations',
            type: 'UMLAssociation',
            hasEnds: true,
            endFields: ['name', 'navigable', 'aggregation', 'multiplicity', 'isDerived', 'isReadOnly', 'isOrdered', 'isUnique']
        },
        { name: 'generalizations', type: 'UMLGeneralization' },
        // UMLAbstraction and SysMLTrace descend from UMLDependency and have no
        // endpoint of their own, so exact-type matching left them unreachable.
        // UMLRealization and friends are deliberately absent: they have their own
        // endpoints, and keeping them out of this list is the point of the fix.
        {
            name: 'dependencies',
            type: 'UMLDependency',
            modelTypes: ['UMLDependency', 'UMLAbstraction', 'SysMLTrace']
        },
        { name: 'interface-realizations', type: 'UMLInterfaceRealization' },
        { name: 'realizations', type: 'UMLRealization' },
        { name: 'template-bindings', type: 'UMLTemplateBinding' }
    ]
}
