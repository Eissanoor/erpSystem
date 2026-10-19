import { locationPaths } from './location.js'

const quantityUnitIdQuery = {
  name: 'quantityUnitId',
  in: 'query',
  schema: { type: 'string', pattern: '^[a-fA-F0-9]{24}$' },
}

export const packingUnitPaths = locationPaths({
  tag: 'Packing units',
  basePath: '/api/v1/packing-units',
  noun: 'PackingUnit',
  plural: 'PackingUnits',
  schema: '#/components/schemas/PackingUnit',
  writeSchema: '#/components/schemas/PackingUnitWrite',
  updateSchema: '#/components/schemas/PackingUnitUpdate',
  permission: 'packing_unit',
  label: 'packing unit',
  listLabel: 'packing units',
  duplicateMessage: 'Short code already exists',
  extraListParams: [quantityUnitIdQuery],
  statusDescription: 'Sets active or inactive. Products that use this packing stay as they are.',
})
