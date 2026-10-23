import { bearer, error, listParams, success } from '../shape.js'
import { branchIdQuery } from './location.js'
import { warehouseIdQuery } from './products.js'

const inventoryItem = { $ref: '#/components/schemas/InventoryItemRow' }

export const inventoryItemPaths = {
  '/api/v1/inventory-items': {
    get: {
      tags: ['Inventory items'],
      operationId: 'listInventoryItems',
      summary: 'List inventory items',
      description:
        'Inventory items register. Search product name, SKU, batch, or serial, and filter with warehouseId, branchId, productId, state, expiryRisk, and batch. Each row returns sku, productName, warehouseId, batchNumber, serialNumber, expiryDate, quantity, unit, unitCost, state, and expiryRisk. Quantity comes from the stock balance for that inventory item. Available, Hold, and Damaged are state. Expiry risk is quarantined for damaged, quality_check for hold, expiring_soon when expiry is within 30 days, and otherwise a days-remaining label. meta.summary holds Inventory value, Active batches, Expiry within 30 days, and Held / Damaged. meta.states holds the All / Available / Hold / Damaged tab counts. meta.expiryAttention is the soonest non-damaged batch still in date. Search, state, and expiryRisk change the table only. Stock Movements is a separate route.',
      security: bearer,
      parameters: [
        ...listParams,
        warehouseIdQuery,
        branchIdQuery,
        {
          name: 'productId',
          in: 'query',
          schema: { type: 'string', pattern: '^[a-fA-F0-9]{24}$' },
        },
        {
          name: 'state',
          in: 'query',
          schema: { type: 'string', enum: ['available', 'hold', 'damaged'] },
        },
        {
          name: 'expiryRisk',
          in: 'query',
          schema: {
            type: 'string',
            enum: ['ok', 'expiring_soon', 'quality_check', 'quarantined'],
          },
        },
        {
          name: 'batch',
          in: 'query',
          description: 'Exact batch number, stored uppercase.',
          schema: { type: 'string' },
        },
      ],
      responses: {
        200: success('Inventory items', { type: 'array', items: inventoryItem }, {
          list: true,
          meta: { $ref: '#/components/schemas/InventoryItemPageMeta' },
        }),
        400: error('Validation failed'),
        401: error('Authentication required'),
        403: error('Missing stock.read'),
      },
    },
  },
}
