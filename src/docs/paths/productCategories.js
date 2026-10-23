import { bearer, error, success } from '../shape.js'
import { locationPaths } from './location.js'

const objectId = { type: 'string', pattern: '^[a-fA-F0-9]{24}$' }

export const parentIdQuery = {
  name: 'parentId',
  in: 'query',
  description: 'Direct children of this category. none returns top-level categories, whose parent is empty.',
  schema: { type: 'string' },
}

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
  extraListParams: [parentIdQuery],
  listMeta: { $ref: '#/components/schemas/CategoryPageMeta' },
  listDescription:
    'Category register. Search name or code, and filter with status and parentId. Rows are grouped under their parent when sort is omitted. Each row returns code, name, parent, description, statusLabel, and childCount. meta.summary holds the Total categories, Active, Inactive, and Top-level categories cards. withParent is the number of categories that have a parent. Those cards ignore search, status, and parentId. The active dropdown omits summary.',
  detailParameters: [
    { name: 'page', in: 'query', schema: { type: 'integer', minimum: 1 } },
    { name: 'limit', in: 'query', schema: { type: 'integer', minimum: 1, maximum: 100 } },
  ],
  detailDescription:
    'Category detail. Returns name, code, parent, description, statusLabel, and level. Level 1 is a top-level category. breadcrumb is the parent path from the top-level category to this one. children are the direct child categories. productCount is the number of products assigned directly to this category, and products lists them with sku and quantityUnitId. Pass page and limit to page the products. Deactivate with the status route. Categories are not deleted.',
  createDescription:
    'Add category. Requires code and name. Description and parentId are optional. Leave parentId empty for a top-level category, which returns level 1. A parent returns level equal to that parent’s depth plus 1. childCount is 0. Status defaults to active. A category cannot be its own parent, and a parent that would loop the hierarchy is rejected. Saving a category does not post inventory or accounting, and categories are shared across branches.',
  statusDescription: 'Sets active or inactive. Products in this category stay as they are. Deactivate a category that products still use.',
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
