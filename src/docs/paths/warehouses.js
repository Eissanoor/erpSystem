import { branchIdQuery, locationPaths } from './location.js'

export const warehousePaths = locationPaths({
  tag: 'Warehouses',
  basePath: '/api/v1/warehouses',
  noun: 'Warehouse',
  plural: 'Warehouses',
  schema: '#/components/schemas/Warehouse',
  writeSchema: '#/components/schemas/WarehouseWrite',
  updateSchema: '#/components/schemas/WarehouseUpdate',
  permission: 'warehouse',
  workspace: true,
  extraListParams: [branchIdQuery],
  statusDescription: 'Sets active or inactive. The parent branch is left unchanged.',
})
