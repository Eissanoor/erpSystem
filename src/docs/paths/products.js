import { locationPaths } from './location.js'
import { categoryIdQuery } from './productCategories.js'

export const warehouseIdQuery = {
  name: 'warehouseId',
  in: 'query',
  description:
    'Warehouse for available, reserved, inventory value, and low stock. Omit it to combine every warehouse in the caller’s branches.',
  schema: { type: 'string', pattern: '^[a-fA-F0-9]{24}$' },
}

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
  extraListParams: [categoryIdQuery, warehouseIdQuery],
  listMeta: { $ref: '#/components/schemas/ProductPageMeta' },
  listDescription:
    'Product catalog. Search name, SKU, or barcode, and filter with categoryId, status, and warehouseId. Each row returns sku, name, categoryId, quantityUnitId, costPrice, salePrice, available, reserved, and reorderState. Available is on-hand quantity minus reserved. Reorder state is out_of_stock when available is 0, critical when available is at or below half the reorder level, low when available is at or below the reorder level, and healthy otherwise. meta.summary holds the Active products, Inventory value, Low stock, and Inactive cards. Active, added this month, and inactive ignore search, category, status, and warehouse. Inventory value and low stock follow warehouseId and ignore search, category, and status. Inventory value is on-hand quantity times cost price. Low stock counts active products that are low or critical, and lowStockShare is that count as a percent of active products. The active dropdown omits summary and the stock columns.',
  statusDescription: 'Sets active or inactive. Later transactions reject an inactive product.',
  createDescription:
    'Add product. Requires sku, name, categoryId, quantityUnitId, costPrice, salePrice, and reorderLevel. Barcode and description are optional. packingUnitId is optional; leave it empty to use the base unit only. Base units per packing unit is the selected packing unit’s conversionQuantity, returned on packingUnitId. 12 means 1 packing unit = 12 base units. The packing unit must use the same base unit. trackBatch and trackExpiry default to false. Status defaults to active. Saving a product does not create a stock balance.',
})
