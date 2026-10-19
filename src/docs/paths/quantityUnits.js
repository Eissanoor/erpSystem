import { locationPaths } from './location.js'

export const quantityUnitPaths = locationPaths({
  tag: 'Quantity units',
  basePath: '/api/v1/quantity-units',
  noun: 'QuantityUnit',
  plural: 'QuantityUnits',
  schema: '#/components/schemas/QuantityUnit',
  writeSchema: '#/components/schemas/QuantityUnitWrite',
  updateSchema: '#/components/schemas/QuantityUnitUpdate',
  permission: 'quantity_unit',
  label: 'quantity unit',
  listLabel: 'quantity units',
  duplicateMessage: 'Short code already exists',
  statusDescription: 'Sets active or inactive. Products that use this unit stay as they are.',
})
