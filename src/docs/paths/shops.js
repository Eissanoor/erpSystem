import { branchIdQuery, locationPaths } from './location.js'

export const shopPaths = locationPaths({
  tag: 'Shops',
  basePath: '/api/v1/shops',
  noun: 'Shop',
  plural: 'Shops',
  schema: '#/components/schemas/Shop',
  writeSchema: '#/components/schemas/ShopWrite',
  updateSchema: '#/components/schemas/ShopUpdate',
  permission: 'shop',
  workspace: true,
  listMeta: { $ref: '#/components/schemas/ShopPageMeta' },
  listDescription:
    'Shop register. Search name or code, and filter with branchId and status. meta.summary holds the Shops, Active, Branches, and Assigned staff cards. The active dropdown omits summary.',
  detailDescription:
    'Shop view for one shop: profile, the Shops, Active, Branches, and Assigned staff cards in summary, warehouses in this branch, and the assigned employees table.',
  extraListParams: [branchIdQuery],
  statusDescription: 'Sets active or inactive. The parent branch is left unchanged.',
})
