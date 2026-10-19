import { locationPaths } from './location.js'
import { categoryIdQuery } from './productCategories.js'

export const productPaths = locationPaths({
  tag: 'Products',
  basePath: '/api/v1/products',
  noun: 'Product',
  plural: 'Products',
  schema: '#/components/schemas/Product',
  writeSchema: '#/components/schemas/ProductWrite',
  updateSchema: '#/components/schemas/ProductUpdate',
  permission: 'product',
  duplicateMessage: 'SKU already exists',
  extraListParams: [categoryIdQuery],
  statusDescription: 'Sets active or inactive. Later transactions reject an inactive product.',
})
