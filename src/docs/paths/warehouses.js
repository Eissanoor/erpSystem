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
  listMeta: { $ref: '#/components/schemas/WarehousePageMeta' },
  listDescription:
    'Warehouse register. Search name or code, and filter with branchId and status. meta.summary holds the Warehouses, Active, Storage zones, and Custodians cards. The active dropdown omits summary.',
  detailDescription:
    'Warehouse view: profile, the Warehouses, Active, Storage zones, and Custodians cards in summary, and the zones and bin locations table. Pass page and limit to page that table. Created on is createdAt and Updated is updatedAt. The custodian is managerId and stays empty until Employee exists.',
  detailParameters: [
    { $ref: '#/components/parameters/page' },
    { $ref: '#/components/parameters/limit' },
  ],
  updateDescription:
    'Edit warehouse. Fields left out, including zones, stay as they are. Linked shops are left unchanged.',
  extraListParams: [branchIdQuery],
  statusDescription: 'Sets active or inactive. The parent branch is left unchanged.',
})
