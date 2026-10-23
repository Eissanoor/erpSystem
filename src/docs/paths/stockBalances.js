import { bearer, error, listParams, success } from '../shape.js'
import { branchIdQuery } from './location.js'
import { warehouseIdQuery } from './products.js'

const stockBalance = { $ref: '#/components/schemas/StockBalanceRow' }

export const stockBalancePaths = {
  '/api/v1/stock-balances': {
    get: {
      tags: ['Stock balances'],
      operationId: 'listStockBalances',
      summary: 'List stock balances',
      description:
        'Inventory control. Search product name or SKU, and filter with warehouseId, branchId, productId, and state. Each row returns sku, productName, warehouseId, onHand, reserved, available, and state. Available is on-hand quantity minus reserved. State uses the product reorder level: out_of_stock, critical, low, or healthy. meta.summary holds Stock value, Available units, Low-stock SKUs, and Damaged stock. locationCount is warehouses with stock. criticalSkus is the critical subset of lowStockSkus. Damaged stock counts draft product damage documents. reconciledAt is the latest balance update. meta.exceptions holds Low stock, Damaged review, and Count variance. Count variance counts lines on draft stock adjustments. meta.timeline is today’s movements for the selected warehouses, newest first. Search and state change the table only. Transfer, Adjustment, and Damage are separate routes.',
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
          description: 'Reorder state of the available quantity.',
          schema: { type: 'string', enum: ['critical', 'low', 'healthy', 'out_of_stock'] },
        },
      ],
      responses: {
        200: success('Stock balances', { type: 'array', items: stockBalance }, {
          list: true,
          meta: { $ref: '#/components/schemas/StockBalancePageMeta' },
        }),
        400: error('Validation failed'),
        401: error('Authentication required'),
        403: error('Missing stock.read'),
      },
    },
  },
}
