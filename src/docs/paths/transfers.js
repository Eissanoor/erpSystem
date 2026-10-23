import { bearer, error, idParam, listParams, statusParam, success } from '../shape.js'
import { branchIdQuery } from './location.js'
import { warehouseIdQuery } from './products.js'

const transfer = { $ref: '#/components/schemas/WarehouseTransfer' }
const transferList = { $ref: '#/components/schemas/WarehouseTransferListItem' }

export const transferPaths = {
  '/api/v1/transfers': {
    get: {
      tags: ['Transfers'],
      operationId: 'listTransfers',
      summary: 'List warehouse transfers',
      description:
        'Transfer register. Search transfer number, reason, or vehicle, and filter with status, warehouseId, and branchId. warehouseId matches source or destination.',
      security: bearer,
      parameters: [
        ...listParams,
        statusParam(['draft', 'in_transit', 'received', 'cancelled']),
        warehouseIdQuery,
        branchIdQuery,
      ],
      responses: {
        200: success('Transfers', { type: 'array', items: transferList }, { list: true }),
        401: error('Authentication required'),
        403: error('Missing transfer.read'),
      },
    },
    post: {
      tags: ['Transfers'],
      operationId: 'createTransfer',
      summary: 'Create a draft transfer',
      description:
        'Add warehouse transfer. Requires sourceWarehouseId, destinationWarehouseId, and lines with productId and quantity. Source and destination warehouses must differ. Status starts as draft. Saving a draft does not move stock.',
      security: bearer,
      requestBody: {
        required: true,
        content: { 'application/json': { schema: { $ref: '#/components/schemas/WarehouseTransferWrite' } } },
      },
      responses: {
        201: success('Transfer created', transfer),
        400: error('Validation failed'),
        401: error('Authentication required'),
        403: error('Missing transfer.create'),
      },
    },
  },
  '/api/v1/transfers/{id}': {
    get: {
      tags: ['Transfers'],
      operationId: 'getTransfer',
      summary: 'Get a warehouse transfer',
      description:
        'Transfer detail. Returns transferNumber, statusLabel, source, destination, reason, vehicle, expectedDate, accountability, workflow, lines, linesMeta, and stockImpact. Workflow shows Draft → In Transit → Received with timestamps. Lines include requested, shipped, received, and batchLabel. Stock impact shows source reduction, stock in transit, and destination increase.',
      security: bearer,
      parameters: idParam,
      responses: {
        200: success('Transfer', transfer),
        401: error('Authentication required'),
        403: error('Missing transfer.read'),
        404: error('Transfer not found'),
      },
    },
    patch: {
      tags: ['Transfers'],
      operationId: 'updateTransfer',
      summary: 'Update a draft transfer',
      description: 'Edit reason, vehicle, expectedDate, notes, or lines while the transfer is draft.',
      security: bearer,
      parameters: idParam,
      requestBody: {
        required: true,
        content: { 'application/json': { schema: { $ref: '#/components/schemas/WarehouseTransferUpdate' } } },
      },
      responses: {
        200: success('Transfer updated', transfer),
        400: error('Validation failed'),
        401: error('Authentication required'),
        403: error('Missing transfer.update'),
        404: error('Transfer not found'),
      },
    },
  },
  '/api/v1/transfers/{id}/dispatch': {
    post: {
      tags: ['Transfers'],
      operationId: 'dispatchTransfer',
      summary: 'Dispatch a transfer',
      description:
        'Posts transfer_out movements at the source warehouse, sets quantityShipped from quantityRequested, and moves status to in_transit. Requires transfer.approve.',
      security: bearer,
      parameters: idParam,
      responses: {
        200: success('Transfer dispatched', transfer),
        400: error('Transfer cannot be dispatched'),
        401: error('Authentication required'),
        403: error('Missing transfer.approve'),
        404: error('Transfer not found'),
      },
    },
  },
  '/api/v1/transfers/{id}/receive': {
    post: {
      tags: ['Transfers'],
      operationId: 'receiveTransfer',
      summary: 'Receive a transfer',
      description:
        'Posts transfer_in movements at the destination warehouse, sets quantityReceived from quantityShipped, and moves status to received. Requires transfer.approve.',
      security: bearer,
      parameters: idParam,
      responses: {
        200: success('Transfer received', transfer),
        400: error('Transfer cannot be received'),
        401: error('Authentication required'),
        403: error('Missing transfer.approve'),
        404: error('Transfer not found'),
      },
    },
  },
  '/api/v1/transfers/{id}/cancel': {
    post: {
      tags: ['Transfers'],
      operationId: 'cancelTransfer',
      summary: 'Cancel a draft transfer',
      description: 'Cancels a draft transfer. In-transit and received transfers stay as they are.',
      security: bearer,
      parameters: idParam,
      responses: {
        200: success('Transfer cancelled', transfer),
        400: error('Transfer cannot be cancelled'),
        401: error('Authentication required'),
        403: error('Missing transfer.update'),
        404: error('Transfer not found'),
      },
    },
  },
}
