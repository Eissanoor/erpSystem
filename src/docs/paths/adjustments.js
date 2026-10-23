import { bearer, error, idParam, listParams, statusParam, success } from '../shape.js'
import { branchIdQuery } from './location.js'
import { warehouseIdQuery } from './products.js'

const adjustment = { $ref: '#/components/schemas/StockAdjustment' }
const adjustmentList = { $ref: '#/components/schemas/StockAdjustmentListItem' }

export const adjustmentPaths = {
  '/api/v1/adjustments': {
    get: {
      tags: ['Adjustments'],
      operationId: 'listAdjustments',
      summary: 'List stock adjustments',
      description:
        'Adjustment register. Search adjustment number, reason, or count reference, and filter with status, warehouseId, and branchId.',
      security: bearer,
      parameters: [
        ...listParams,
        statusParam(['draft', 'pending', 'approved', 'rejected', 'cancelled']),
        warehouseIdQuery,
        branchIdQuery,
      ],
      responses: {
        200: success('Adjustments', { type: 'array', items: adjustmentList }, { list: true }),
        401: error('Authentication required'),
        403: error('Missing adjustment.read'),
      },
    },
    post: {
      tags: ['Adjustments'],
      operationId: 'createAdjustment',
      summary: 'Create a draft stock adjustment',
      description:
        'Add stock adjustment. Requires warehouseId and lines with productId and actualQuantity. System quantity is read from the stock balance. Difference is actual minus system. Stock does not change until approval.',
      security: bearer,
      requestBody: {
        required: true,
        content: { 'application/json': { schema: { $ref: '#/components/schemas/StockAdjustmentWrite' } } },
      },
      responses: {
        201: success('Adjustment created', adjustment),
        400: error('Validation failed'),
        401: error('Authentication required'),
        403: error('Missing adjustment.create'),
      },
    },
  },
  '/api/v1/adjustments/{id}': {
    get: {
      tags: ['Adjustments'],
      operationId: 'getAdjustment',
      summary: 'Get a stock adjustment',
      description:
        'Adjustment detail. Returns adjustmentNumber, statusLabel, reason, countReference, branchId, warehouseId, createdBy, requestedApprover, lines, summary, history, and movementNumbers. Summary holds products counted, products with variance, stock-out and stock-in on approval, and net inventory impact. stockUnchanged is true while the document is draft, pending, or rejected.',
      security: bearer,
      parameters: idParam,
      responses: {
        200: success('Adjustment', adjustment),
        401: error('Authentication required'),
        403: error('Missing adjustment.read'),
        404: error('Adjustment not found'),
      },
    },
    patch: {
      tags: ['Adjustments'],
      operationId: 'updateAdjustment',
      summary: 'Update a draft adjustment',
      description: 'Edit reason, count reference, count note, requested approver, or lines while the adjustment is draft. System quantity is refreshed from the stock balance when lines are sent.',
      security: bearer,
      parameters: idParam,
      requestBody: {
        required: true,
        content: { 'application/json': { schema: { $ref: '#/components/schemas/StockAdjustmentUpdate' } } },
      },
      responses: {
        200: success('Adjustment updated', adjustment),
        400: error('Validation failed'),
        401: error('Authentication required'),
        403: error('Missing adjustment.update'),
        404: error('Adjustment not found'),
      },
    },
  },
  '/api/v1/adjustments/{id}/submit': {
    post: {
      tags: ['Adjustments'],
      operationId: 'submitAdjustment',
      summary: 'Submit an adjustment for approval',
      description: 'Moves a draft adjustment to pending. Stock stays unchanged.',
      security: bearer,
      parameters: idParam,
      responses: {
        200: success('Adjustment submitted', adjustment),
        400: error('Adjustment cannot be submitted'),
        401: error('Authentication required'),
        403: error('Missing adjustment.update'),
        404: error('Adjustment not found'),
      },
    },
  },
  '/api/v1/adjustments/{id}/approve': {
    post: {
      tags: ['Adjustments'],
      operationId: 'approveAdjustment',
      summary: 'Approve a pending adjustment',
      description:
        'Creates adjustment movements for every non-zero difference and sets status to approved. Requires adjustment.approve.',
      security: bearer,
      parameters: idParam,
      responses: {
        200: success('Adjustment approved', adjustment),
        400: error('Adjustment cannot be approved'),
        401: error('Authentication required'),
        403: error('Missing adjustment.approve'),
        404: error('Adjustment not found'),
      },
    },
  },
  '/api/v1/adjustments/{id}/reject': {
    post: {
      tags: ['Adjustments'],
      operationId: 'rejectAdjustment',
      summary: 'Reject a pending adjustment',
      description: 'Rejects a pending adjustment without creating stock movements. Requires adjustment.approve.',
      security: bearer,
      parameters: idParam,
      requestBody: {
        content: { 'application/json': { schema: { $ref: '#/components/schemas/StockAdjustmentReject' } } },
      },
      responses: {
        200: success('Adjustment rejected', adjustment),
        400: error('Adjustment cannot be rejected'),
        401: error('Authentication required'),
        403: error('Missing adjustment.approve'),
        404: error('Adjustment not found'),
      },
    },
  },
  '/api/v1/adjustments/{id}/cancel': {
    post: {
      tags: ['Adjustments'],
      operationId: 'cancelAdjustment',
      summary: 'Cancel a draft adjustment',
      description: 'Cancels a draft adjustment.',
      security: bearer,
      parameters: idParam,
      responses: {
        200: success('Adjustment cancelled', adjustment),
        400: error('Adjustment cannot be cancelled'),
        401: error('Authentication required'),
        403: error('Missing adjustment.update'),
        404: error('Adjustment not found'),
      },
    },
  },
}
