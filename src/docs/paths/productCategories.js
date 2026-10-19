import { bearer, error, success } from '../shape.js'
import { locationPaths } from './location.js'

const objectId = { type: 'string', pattern: '^[a-fA-F0-9]{24}$' }

const categoryPaths = locationPaths({
  tag: 'Product categories',
  basePath: '/api/v1/product-categories',
  noun: 'ProductCategory',
  plural: 'ProductCategories',
  schema: '#/components/schemas/ProductCategory',
  writeSchema: '#/components/schemas/ProductCategoryWrite',
  updateSchema: '#/components/schemas/ProductCategoryUpdate',
  permission: 'product_category',
  label: 'product category',
  listLabel: 'product categories',
  duplicateMessage: 'Category code already exists',
  statusDescription: 'Sets active or inactive. Products in this category stay as they are.',
})

export const productCategoryPaths = {
  ...categoryPaths,
  '/api/v1/product-categories/tree': {
    get: {
      tags: ['Product categories'],
      operationId: 'getProductCategoryTree',
      summary: 'Active category tree',
      description: 'Nested active categories. Cached until a category is created or updated.',
      security: bearer,
      responses: {
        200: success('Category tree', {
          type: 'array',
          items: { $ref: '#/components/schemas/ProductCategoryNode' },
        }),
        401: error('Authentication required'),
        403: error('Missing product_category.read'),
      },
    },
  },
}

export const categoryIdQuery = {
  name: 'categoryId',
  in: 'query',
  schema: objectId,
}
