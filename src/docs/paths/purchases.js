import { bearer, error, idParam, listParams, statusParam, success } from '../shape.js'
import { branchIdQuery } from './location.js'
import { warehouseIdQuery } from './products.js'

const purchase = { $ref: '#/components/schemas/Purchase' }
const purchaseList = { $ref: '#/components/schemas/PurchaseListItem' }
const purchaseReturn = { $ref: '#/components/schemas/PurchaseReturn' }
const workspace = { $ref: '#/components/schemas/PurchasesWorkspace' }

const supplierIdQuery = {
  name: 'supplierId',
  in: 'query',
  schema: { type: 'string', pattern: '^[a-fA-F0-9]{24}$' },
}

const receivingStateQuery = {
  name: 'receivingState',
  in: 'query',
  schema: { type: 'string', enum: ['ordered', 'part_received', 'quality_check', 'received'] },
}

export const purchasePaths = {
  '/api/v1/purchases/workspace': {
    get: {
      tags: ['Purchases'],
      operationId: 'getPurchasesWorkspace',
      summary: 'Purchases workspace cards and widgets',
      description:
        'Month purchases, supplier payable, open orders, returns, receiving pipeline, top supplier balances, and recent returns. Export uses the purchase list. Posting a purchase creates a supplier payable invoice when balanceAmount > 0. Stock increases on receive, not on post. Centralized AccountingService is not called yet.',
      security: bearer,
      parameters: [
        branchIdQuery,
        { name: 'month', in: 'query', schema: { type: 'string', example: '2026-10' } },
        { name: 'asOf', in: 'query', schema: { type: 'string', format: 'date' } },
      ],
      responses: {
        200: success('Purchases workspace', workspace),
        401: error('Authentication required'),
        403: error('Missing purchase.read'),
      },
    },
  },
  '/api/v1/purchases': {
    get: {
      tags: ['Purchases'],
      operationId: 'listPurchases',
      summary: 'List purchases',
      description:
        'Procurement table. Search purchase number. Filter branchId, warehouseId, supplierId, status, receivingState, from, and to. List omits line items.',
      security: bearer,
      parameters: [
        ...listParams,
        statusParam(['draft', 'approved', 'posted', 'cancelled']),
        branchIdQuery,
        warehouseIdQuery,
        supplierIdQuery,
        receivingStateQuery,
      ],
      responses: {
        200: success('Purchases', { type: 'array', items: purchaseList }, { list: true }),
        401: error('Authentication required'),
        403: error('Missing purchase.read'),
      },
    },
    post: {
      tags: ['Purchases'],
      operationId: 'createPurchase',
      summary: 'Create a draft purchase',
      description:
        'New Purchase / Save Draft. Requires branchId, warehouseId, supplierId, and lines. Optional supplierInvoiceNo, exchangeRate, taxRate, line discountAmount, packingUnitId, paidAmount with advancePaymentId, receivingNote, and notes. Server calculates subtotal, discount, netSubtotal, tax, grand total, and outstanding. Detail returns workflow, totals, postingPreview (Inventory DR / Input Tax DR / Supplier AP CR), and stockImpactSummary. Starts as draft with receivingState ordered. No stock-in until post (or explicit receive).',
      security: bearer,
      requestBody: {
        required: true,
        content: { 'application/json': { schema: { $ref: '#/components/schemas/PurchaseWrite' } } },
      },
      responses: {
        201: success('Purchase created', purchase),
        400: error('Validation failed'),
        401: error('Authentication required'),
        403: error('Missing purchase.create'),
      },
    },
  },
  '/api/v1/purchases/{id}': {
    get: {
      tags: ['Purchases'],
      operationId: 'getPurchase',
      summary: 'Get a purchase',
      security: bearer,
      parameters: idParam,
      responses: {
        200: success('Purchase', purchase),
        401: error('Authentication required'),
        403: error('Missing purchase.read'),
        404: error('Purchase not found'),
      },
    },
    patch: {
      tags: ['Purchases'],
      operationId: 'updatePurchase',
      summary: 'Update a draft purchase',
      description: 'Draft only. Posted purchases return 409.',
      security: bearer,
      parameters: idParam,
      requestBody: {
        required: true,
        content: { 'application/json': { schema: { $ref: '#/components/schemas/PurchaseUpdate' } } },
      },
      responses: {
        200: success('Purchase updated', purchase),
        400: error('Validation failed'),
        401: error('Authentication required'),
        403: error('Missing purchase.update'),
        404: error('Purchase not found'),
        409: error('Purchase is locked'),
      },
    },
  },
  '/api/v1/purchases/{id}/approve': {
    post: {
      tags: ['Purchases'],
      operationId: 'approvePurchase',
      summary: 'Approve a draft purchase',
      security: bearer,
      parameters: idParam,
      responses: {
        200: success('Purchase approved', purchase),
        400: error('Purchase cannot be approved'),
        401: error('Authentication required'),
        403: error('Missing purchase.approve'),
        404: error('Purchase not found'),
      },
    },
  },
  '/api/v1/purchases/{id}/post': {
    post: {
      tags: ['Purchases'],
      operationId: 'postPurchase',
      summary: 'Post an approved purchase',
      description:
        'Receives any remaining ordered quantity into stock, creates a supplier payable for the grand total, and applies advancePaymentId against that invoice when paidAmount > 0. Posting preview is informational only (no AccountingService voucher). Requires purchase.post.',
      security: bearer,
      parameters: idParam,
      responses: {
        200: success('Purchase posted', purchase),
        400: error('Purchase cannot be posted'),
        401: error('Authentication required'),
        403: error('Missing purchase.post'),
        404: error('Purchase not found'),
      },
    },
  },
  '/api/v1/purchases/{id}/cancel': {
    post: {
      tags: ['Purchases'],
      operationId: 'cancelPurchase',
      summary: 'Cancel a draft or approved purchase',
      security: bearer,
      parameters: idParam,
      responses: {
        200: success('Purchase cancelled', purchase),
        400: error('Purchase cannot be cancelled'),
        401: error('Authentication required'),
        403: error('Missing purchase.update'),
        404: error('Purchase not found'),
      },
    },
  },
  '/api/v1/purchases/{id}/receive': {
    post: {
      tags: ['Purchases'],
      operationId: 'receivePurchase',
      summary: 'Receive purchase lines into stock',
      description:
        'Applies purchase stock movements for the received delta and updates receivingState (ordered, part_received, received, or quality_check when qualityCheck is true).',
      security: bearer,
      parameters: idParam,
      requestBody: {
        required: true,
        content: { 'application/json': { schema: { $ref: '#/components/schemas/PurchaseReceive' } } },
      },
      responses: {
        200: success('Purchase received', purchase),
        400: error('Receive failed'),
        401: error('Authentication required'),
        403: error('Missing purchase.update'),
        404: error('Purchase not found'),
      },
    },
  },
}

export const purchaseReturnPaths = {
  '/api/v1/purchase-returns': {
    get: {
      tags: ['Purchase returns'],
      operationId: 'listPurchaseReturns',
      summary: 'List purchase returns',
      security: bearer,
      parameters: [
        ...listParams,
        statusParam(['draft', 'approved', 'posted', 'cancelled']),
        branchIdQuery,
        supplierIdQuery,
      ],
      responses: {
        200: success('Purchase returns', { type: 'array', items: purchaseReturn }, { list: true }),
        401: error('Authentication required'),
        403: error('Missing purchase_return.read'),
      },
    },
    post: {
      tags: ['Purchase returns'],
      operationId: 'createPurchaseReturn',
      summary: 'Create a draft purchase return',
      description:
        'Creates a draft return from an optional posted purchase. Stock-OUT and payable reduction happen only on post. Detail returns workflow, totals, postingPreview, history, and stockImpactSummary.',
      security: bearer,
      requestBody: {
        required: true,
        content: { 'application/json': { schema: { $ref: '#/components/schemas/PurchaseReturnWrite' } } },
      },
      responses: {
        201: success('Purchase return created', purchaseReturn),
        400: error('Validation failed'),
        401: error('Authentication required'),
        403: error('Missing purchase_return.create'),
      },
    },
  },
  '/api/v1/purchase-returns/{id}': {
    get: {
      tags: ['Purchase returns'],
      operationId: 'getPurchaseReturn',
      summary: 'Get a purchase return',
      description:
        'Return detail for Print / Approve / Post. Includes original purchase, supplier authorization, lines with batch, totals (subtotal, tax reversal, supplier credit), journal preview, audit history, and stock impact copy.',
      security: bearer,
      parameters: idParam,
      responses: {
        200: success('Purchase return', purchaseReturn),
        401: error('Authentication required'),
        403: error('Missing purchase_return.read'),
        404: error('Purchase return not found'),
      },
    },
    patch: {
      tags: ['Purchase returns'],
      operationId: 'updatePurchaseReturn',
      summary: 'Update a draft purchase return',
      security: bearer,
      parameters: idParam,
      requestBody: {
        required: true,
        content: { 'application/json': { schema: { $ref: '#/components/schemas/PurchaseReturnUpdate' } } },
      },
      responses: {
        200: success('Purchase return updated', purchaseReturn),
        400: error('Validation failed'),
        401: error('Authentication required'),
        403: error('Missing purchase_return.update'),
        404: error('Purchase return not found'),
        409: error('Return is locked'),
      },
    },
  },
  '/api/v1/purchase-returns/{id}/approve': {
    post: {
      tags: ['Purchase returns'],
      operationId: 'approvePurchaseReturn',
      summary: 'Approve a draft purchase return',
      security: bearer,
      parameters: idParam,
      responses: {
        200: success('Purchase return approved', purchaseReturn),
        400: error('Return cannot be approved'),
        401: error('Authentication required'),
        403: error('Missing purchase_return.approve'),
        404: error('Purchase return not found'),
      },
    },
  },
  '/api/v1/purchase-returns/{id}/cancel': {
    post: {
      tags: ['Purchase returns'],
      operationId: 'cancelPurchaseReturn',
      summary: 'Cancel a draft or approved return',
      security: bearer,
      parameters: idParam,
      responses: {
        200: success('Purchase return cancelled', purchaseReturn),
        400: error('Return cannot be cancelled'),
        401: error('Authentication required'),
        403: error('Missing purchase_return.update'),
        404: error('Purchase return not found'),
      },
    },
  },
  '/api/v1/purchase-returns/{id}/post': {
    post: {
      tags: ['Purchase returns'],
      operationId: 'postPurchaseReturn',
      summary: 'Post an approved purchase return',
      description:
        'Stocks out returned qty and debits supplier payable. Journal preview is informational only. Requires purchase_return.post.',
      security: bearer,
      parameters: idParam,
      responses: {
        200: success('Purchase return posted', purchaseReturn),
        400: error('Return cannot be posted'),
        401: error('Authentication required'),
        403: error('Missing purchase_return.post'),
        404: error('Purchase return not found'),
      },
    },
  },
  '/api/v1/purchase-returns/{id}/ship': {
    post: {
      tags: ['Purchase returns'],
      operationId: 'shipPurchaseReturn',
      summary: 'Approve a return (legacy alias)',
      description: 'Alias of POST /approve.',
      security: bearer,
      parameters: idParam,
      responses: {
        200: success('Purchase return approved', purchaseReturn),
        400: error('Return cannot be approved'),
        401: error('Authentication required'),
        403: error('Missing purchase_return.approve'),
        404: error('Purchase return not found'),
      },
    },
  },
  '/api/v1/purchase-returns/{id}/credit': {
    post: {
      tags: ['Purchase returns'],
      operationId: 'creditPurchaseReturn',
      summary: 'Post a return (legacy alias)',
      description: 'Alias of POST /post.',
      security: bearer,
      parameters: idParam,
      responses: {
        200: success('Purchase return posted', purchaseReturn),
        400: error('Return cannot be posted'),
        401: error('Authentication required'),
        403: error('Missing purchase_return.post'),
        404: error('Purchase return not found'),
      },
    },
  },
}
