import { bearer, error, idParam, listParams, success } from '../shape.js'
import { branchIdQuery } from './location.js'
import { warehouseIdQuery } from './products.js'

const movement = { $ref: '#/components/schemas/StockMovementRow' }
const movementDetail = { $ref: '#/components/schemas/StockMovement' }

export const stockMovementPaths = {
  '/api/v1/stock-movements': {
    get: {
      tags: ['Stock movements'],
      operationId: 'listStockMovements',
      summary: 'List stock movements',
      description:
        'Movement register. Search product name, SKU, movement number, or source document, and filter with branchId, warehouseId, productId, movementType, date, from, and to. date selects one calendar day in UTC. When date, from, and to are omitted, the register uses today. Each row returns movementNumber, movementDate, sku, productName, branchId, warehouseId, movementTypeLabel, quantityIn, quantityOut, unitCost, createdBy, and referenceNumber. Empty in or out is null. meta.summary holds Movements today, Quantity in, Quantity out, and Net movement for the selected warehouses and day. Those cards ignore search and movementType. Net movement is quantity in minus quantity out.',
      security: bearer,
      parameters: [
        ...listParams,
        branchIdQuery,
        warehouseIdQuery,
        {
          name: 'productId',
          in: 'query',
          schema: { type: 'string', pattern: '^[a-fA-F0-9]{24}$' },
        },
        {
          name: 'movementType',
          in: 'query',
          schema: {
            type: 'string',
            enum: [
              'purchase',
              'sale',
              'transfer_in',
              'transfer_out',
              'purchase_return',
              'sales_return',
              'damage',
              'adjustment',
            ],
          },
        },
        {
          name: 'date',
          in: 'query',
          description: 'Single day filter (UTC).',
          schema: { type: 'string', format: 'date' },
        },
        {
          name: 'from',
          in: 'query',
          schema: { type: 'string', format: 'date' },
        },
        {
          name: 'to',
          in: 'query',
          schema: { type: 'string', format: 'date' },
        },
      ],
      responses: {
        200: success('Stock movements', { type: 'array', items: movement }, {
          list: true,
          meta: { $ref: '#/components/schemas/StockMovementPageMeta' },
        }),
        400: error('Validation failed'),
        401: error('Authentication required'),
        403: error('Missing stock.read'),
      },
    },
  },
  '/api/v1/stock-movements/{id}': {
    get: {
      tags: ['Stock movements'],
      operationId: 'getStockMovement',
      summary: 'Get a stock movement',
      description:
        'Source trace for one movement. Returns the register fields plus sourceTrace with referenceNumber, createdByName, quantity, direction, lineValue, movementDate, and ledgerNumber. Open the source document with referenceNumber.',
      security: bearer,
      parameters: idParam,
      responses: {
        200: success('Stock movement', movementDetail),
        401: error('Authentication required'),
        403: error('Missing stock.read'),
        404: error('Stock movement not found'),
      },
    },
  },
}
