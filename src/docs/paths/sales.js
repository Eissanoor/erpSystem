import { bearer, error, idParam, listParams, success } from '../shape.js'
import { branchIdQuery } from './location.js'

const sale = { $ref: '#/components/schemas/Sale' }
const saleList = { $ref: '#/components/schemas/SaleListRow' }
const workspace = { $ref: '#/components/schemas/SalesWorkspace' }

const warehouseIdQuery = {
  name: 'warehouseId',
  in: 'query',
  schema: { type: 'string', pattern: '^[a-fA-F0-9]{24}$' },
}

const customerIdQuery = {
  name: 'customerId',
  in: 'query',
  schema: { type: 'string', pattern: '^[a-fA-F0-9]{24}$' },
}

const statusQuery = {
  name: 'status',
  in: 'query',
  schema: {
    type: 'string',
    enum: ['draft', 'approved', 'posted', 'cancelled', 'part_paid'],
  },
  description: 'part_paid is a register badge for posted sales with partial collection.',
}

export const salePaths = {
  '/api/v1/sales/workspace': {
    get: {
      tags: ['Sales'],
      operationId: 'getSalesWorkspace',
      summary: 'Sales workspace cards',
      description:
        'KPI cards for the Sales register: netSales, postedToday (+ count), receivable (+ overdueCount), and averageOrder with month-over-month change percents. Filter with branchId and month (YYYY-MM).',
      security: bearer,
      parameters: [
        branchIdQuery,
        {
          name: 'month',
          in: 'query',
          schema: { type: 'string', pattern: '^\\d{4}-\\d{2}$' },
        },
        {
          name: 'asOf',
          in: 'query',
          schema: { type: 'string', format: 'date' },
        },
      ],
      responses: {
        200: success('Sales workspace', workspace),
        401: error('Authentication required'),
        403: error('Missing sale.read'),
      },
    },
  },
  '/api/v1/sales': {
    get: {
      tags: ['Sales'],
      operationId: 'listSales',
      summary: 'Sales register',
      description:
        'Sales register rows: document, date, customer, branch, warehouse, total, paid, receivable, and workspaceStatus (Draft / Approved / Posted / Part paid / Cancelled). Search sale number or customer name/code. Filter with from/to, status, branchId, warehouseId, customerId.',
      security: bearer,
      parameters: [
        ...listParams,
        branchIdQuery,
        warehouseIdQuery,
        customerIdQuery,
        statusQuery,
        { name: 'from', in: 'query', schema: { type: 'string', format: 'date' } },
        { name: 'to', in: 'query', schema: { type: 'string', format: 'date' } },
      ],
      responses: {
        200: success('Sales', { type: 'array', items: saleList }, { list: true }),
        401: error('Authentication required'),
        403: error('Missing sale.read'),
      },
    },
    post: {
      tags: ['Sales'],
      operationId: 'createSale',
      summary: 'Create a draft sale',
      description:
        'New Sale. Creates SL-##### in draft. Stock and receivable post only after approve + post. Optional paidAmount records collection applied on posting.',
      security: bearer,
      requestBody: {
        required: true,
        content: { 'application/json': { schema: { $ref: '#/components/schemas/SaleWrite' } } },
      },
      responses: {
        201: success('Sale created', sale),
        400: error('Validation failed'),
        401: error('Authentication required'),
        403: error('Missing sale.create'),
      },
    },
  },
  '/api/v1/sales/{id}': {
    get: {
      tags: ['Sales'],
      operationId: 'getSale',
      summary: 'Get a sale',
      security: bearer,
      parameters: idParam,
      responses: {
        200: success('Sale', sale),
        401: error('Authentication required'),
        403: error('Missing sale.read'),
        404: error('Sale not found'),
      },
    },
    patch: {
      tags: ['Sales'],
      operationId: 'updateSale',
      summary: 'Update a draft sale',
      security: bearer,
      parameters: idParam,
      requestBody: {
        required: true,
        content: { 'application/json': { schema: { $ref: '#/components/schemas/SaleUpdate' } } },
      },
      responses: {
        200: success('Sale updated', sale),
        400: error('Validation failed'),
        401: error('Authentication required'),
        403: error('Missing sale.update'),
        404: error('Sale not found'),
        409: error('Sale is locked'),
      },
    },
  },
  '/api/v1/sales/{id}/approve': {
    post: {
      tags: ['Sales'],
      operationId: 'approveSale',
      summary: 'Approve a draft sale',
      security: bearer,
      parameters: idParam,
      responses: {
        200: success('Sale approved', sale),
        400: error('Cannot approve'),
        401: error('Authentication required'),
        403: error('Missing sale.approve'),
        404: error('Sale not found'),
      },
    },
  },
  '/api/v1/sales/{id}/post': {
    post: {
      tags: ['Sales'],
      operationId: 'postSale',
      summary: 'Post an approved sale',
      description:
        'Issues stock (sale movement), creates customer receivable invoice under the same SL number, and optionally posts a receipt for paidAmount. Journal lines in postingPreview are preview-only.',
      security: bearer,
      parameters: idParam,
      responses: {
        200: success('Sale posted', sale),
        400: error('Cannot post'),
        401: error('Authentication required'),
        403: error('Missing sale.post'),
        404: error('Sale not found'),
      },
    },
  },
  '/api/v1/sales/{id}/cancel': {
    post: {
      tags: ['Sales'],
      operationId: 'cancelSale',
      summary: 'Cancel a draft or approved sale',
      security: bearer,
      parameters: idParam,
      responses: {
        200: success('Sale cancelled', sale),
        400: error('Cannot cancel'),
        401: error('Authentication required'),
        403: error('Missing sale.update'),
        404: error('Sale not found'),
      },
    },
  },
}
