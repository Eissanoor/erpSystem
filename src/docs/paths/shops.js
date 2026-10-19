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
  extraListParams: [branchIdQuery],
  statusDescription: 'Sets active or inactive. The parent branch is left unchanged.',
})
