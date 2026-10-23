import { bearer, error, idParam, listParams, statusParam, success } from '../shape.js'
import { branchIdQuery } from './location.js'
import { warehouseIdQuery } from './products.js'

const damage = { $ref: '#/components/schemas/ProductDamage' }
const damageList = { $ref: '#/components/schemas/ProductDamageListItem' }

export const damagePaths = {
  '/api/v1/damages': {
    get: {
      tags: ['Damages'],
      operationId: 'listDamages',
      summary: 'List product damage reports',
      description:
        'Damage register. Search damage number or reason, and filter with status, warehouseId, branchId, and damageType.',
      security: bearer,
      parameters: [
        ...listParams,
        statusParam(['draft', 'pending', 'approved', 'rejected', 'cancelled']),
        warehouseIdQuery,
        branchIdQuery,
        {
          name: 'damageType',
          in: 'query',
          schema: {
            type: 'string',
            enum: ['broken', 'expired', 'leaked', 'defective', 'lost', 'other'],
          },
        },
      ],
      responses: {
        200: success('Damage reports', { type: 'array', items: damageList }, { list: true }),
        401: error('Authentication required'),
        403: error('Missing damage.read'),
      },
    },
    post: {
      tags: ['Damages'],
      operationId: 'createDamage',
      summary: 'Create a draft product damage report',
      description:
        'Add product damage. Requires warehouseId, damageType, and lines with productId and quantity. Stock and ledger stay unchanged until approval. Optional postAccounting previews a balanced Inventory Loss / Inventory journal without posting a voucher.',
      security: bearer,
      requestBody: {
        required: true,
        content: { 'application/json': { schema: { $ref: '#/components/schemas/ProductDamageWrite' } } },
      },
      responses: {
        201: success('Damage report created', damage),
        400: error('Validation failed'),
        401: error('Authentication required'),
        403: error('Missing damage.create'),
      },
    },
  },
  '/api/v1/damages/{id}': {
    get: {
      tags: ['Damages'],
      operationId: 'getDamage',
      summary: 'Get a product damage report',
      description:
        'Damage detail. Returns damageNumber, statusLabel, damageType, reason, branchId, warehouseId, createdBy, requestedApprover, lines, summary, impactPreview, history, movementNumbers, voucherNumber, and accountingPosted. stockUnchanged is true while draft, pending, or rejected. Approval creates damage stock-outs; accounting voucher posting is deferred until the accounting service exists.',
      security: bearer,
      parameters: idParam,
      responses: {
        200: success('Damage report', damage),
        401: error('Authentication required'),
        403: error('Missing damage.read'),
        404: error('Damage report not found'),
      },
    },
    patch: {
      tags: ['Damages'],
      operationId: 'updateDamage',
      summary: 'Update a draft damage report',
      description: 'Edit damage type, reason, notes, requested approver, postAccounting, or lines while the report is draft.',
      security: bearer,
      parameters: idParam,
      requestBody: {
        required: true,
        content: { 'application/json': { schema: { $ref: '#/components/schemas/ProductDamageUpdate' } } },
      },
      responses: {
        200: success('Damage report updated', damage),
        400: error('Validation failed'),
        401: error('Authentication required'),
        403: error('Missing damage.update'),
        404: error('Damage report not found'),
      },
    },
  },
  '/api/v1/damages/{id}/submit': {
    post: {
      tags: ['Damages'],
      operationId: 'submitDamage',
      summary: 'Submit a damage report for approval',
      description: 'Moves a draft damage report to pending. Stock and ledger stay unchanged.',
      security: bearer,
      parameters: idParam,
      responses: {
        200: success('Damage report submitted', damage),
        400: error('Damage report cannot be submitted'),
        401: error('Authentication required'),
        403: error('Missing damage.update'),
        404: error('Damage report not found'),
      },
    },
  },
  '/api/v1/damages/{id}/approve': {
    post: {
      tags: ['Damages'],
      operationId: 'approveDamage',
      summary: 'Approve a pending damage report',
      description:
        'Creates damage stock-out movements for every line and sets status to approved. Does not post an accounting voucher yet. Reporter self-approval is blocked unless the user has all_branches. Requires damage.approve.',
      security: bearer,
      parameters: idParam,
      responses: {
        200: success('Damage report approved', damage),
        400: error('Damage report cannot be approved'),
        401: error('Authentication required'),
        403: error('Missing damage.approve or self-approval blocked'),
        404: error('Damage report not found'),
      },
    },
  },
  '/api/v1/damages/{id}/reject': {
    post: {
      tags: ['Damages'],
      operationId: 'rejectDamage',
      summary: 'Reject a pending damage report',
      description: 'Rejects a pending damage report without creating stock movements or vouchers. Requires damage.approve.',
      security: bearer,
      parameters: idParam,
      requestBody: {
        content: { 'application/json': { schema: { $ref: '#/components/schemas/ProductDamageReject' } } },
      },
      responses: {
        200: success('Damage report rejected', damage),
        400: error('Damage report cannot be rejected'),
        401: error('Authentication required'),
        403: error('Missing damage.approve'),
        404: error('Damage report not found'),
      },
    },
  },
  '/api/v1/damages/{id}/cancel': {
    post: {
      tags: ['Damages'],
      operationId: 'cancelDamage',
      summary: 'Cancel a draft damage report',
      description: 'Cancels a draft damage report. No stock or ledger impact.',
      security: bearer,
      parameters: idParam,
      responses: {
        200: success('Damage report cancelled', damage),
        400: error('Damage report cannot be cancelled'),
        401: error('Authentication required'),
        403: error('Missing damage.update'),
        404: error('Damage report not found'),
      },
    },
  },
}
