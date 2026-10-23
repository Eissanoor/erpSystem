import { bearer, error, idParam, listParams, statusParam, success } from '../shape.js'

const supplier = { $ref: '#/components/schemas/Supplier' }

export const supplierPaths = {
  '/api/v1/suppliers': {
    get: {
      tags: ['Suppliers'],
      operationId: 'listSuppliers',
      summary: 'List suppliers',
      description:
        'Supplier register. Search code, name, email, phone, or payable account. Filter with status, paymentTerms, currencyId, branchId, and asOf. Each row includes outstanding from posted supplier invoices. meta.summary holds register counts plus Total Payable / Current / 1-30 / Over 30 aging cards (cards ignore search and status). meta.totals.outstanding is the page total for the table footer. Active dropdowns omit payable enrichment.',
      security: bearer,
      parameters: [
        ...listParams,
        statusParam(['active', 'inactive']),
        {
          name: 'paymentTerms',
          in: 'query',
          schema: { type: 'string', enum: ['cash', 'net_7', 'net_14', 'net_30'] },
        },
        {
          name: 'currencyId',
          in: 'query',
          schema: { type: 'string', pattern: '^[a-fA-F0-9]{24}$' },
        },
        {
          name: 'branchId',
          in: 'query',
          schema: { type: 'string', pattern: '^[a-fA-F0-9]{24}$' },
        },
        {
          name: 'asOf',
          in: 'query',
          schema: { type: 'string', format: 'date' },
        },
      ],
      responses: {
        200: success('Suppliers', { type: 'array', items: supplier }, {
          list: true,
          meta: { $ref: '#/components/schemas/SupplierPageMeta' },
        }),
        401: error('Authentication required'),
        403: error('Missing supplier.read'),
      },
    },
    post: {
      tags: ['Suppliers'],
      operationId: 'createSupplier',
      summary: 'Create a supplier',
      description:
        'Add supplier. Requires code, name, currencyId, paymentTerms, and payableAccount. Phone, email, and address are optional. payableAccount is the ledger account name linked for purchases and payments. payableAccountId stays empty until chart of accounts exists. Saving a supplier does not post a financial transaction or create a payable balance.',
      security: bearer,
      requestBody: {
        required: true,
        content: { 'application/json': { schema: { $ref: '#/components/schemas/SupplierWrite' } } },
      },
      responses: {
        201: success('Supplier created', supplier),
        400: error('Validation failed'),
        401: error('Authentication required'),
        403: error('Missing supplier.create'),
        409: error('Supplier code already exists'),
      },
    },
  },
  '/api/v1/suppliers/{id}': {
    get: {
      tags: ['Suppliers'],
      operationId: 'getSupplier',
      summary: 'Get a supplier',
      description:
        'Supplier detail pane. Profile fields plus payablesActivity (outstanding, current, overdue, unallocated advance, purchaseLedger invoices, and latestAllocation note). Payable balances come from posted entries. Optional branchId, currencyId, and asOf scope the activity.',
      security: bearer,
      parameters: [
        ...idParam,
        {
          name: 'branchId',
          in: 'query',
          schema: { type: 'string', pattern: '^[a-fA-F0-9]{24}$' },
        },
        {
          name: 'currencyId',
          in: 'query',
          schema: { type: 'string', pattern: '^[a-fA-F0-9]{24}$' },
        },
        {
          name: 'asOf',
          in: 'query',
          schema: { type: 'string', format: 'date' },
        },
      ],
      responses: {
        200: success('Supplier', supplier),
        401: error('Authentication required'),
        403: error('Missing supplier.read'),
        404: error('Supplier not found'),
      },
    },
    patch: {
      tags: ['Suppliers'],
      operationId: 'updateSupplier',
      summary: 'Update a supplier',
      description:
        'Edit supplier details, commercial terms, payable account name, or status. Does not post ledger entries.',
      security: bearer,
      parameters: idParam,
      requestBody: {
        required: true,
        content: { 'application/json': { schema: { $ref: '#/components/schemas/SupplierUpdate' } } },
      },
      responses: {
        200: success('Supplier updated', supplier),
        400: error('Validation failed'),
        401: error('Authentication required'),
        403: error('Missing supplier.update'),
        404: error('Supplier not found'),
        409: error('Supplier code already exists'),
      },
    },
  },
  '/api/v1/suppliers/{id}/status': {
    patch: {
      tags: ['Suppliers'],
      operationId: 'setSupplierStatus',
      summary: 'Set supplier status',
      description: 'Sets active or inactive. Inactive suppliers are unavailable for new purchases.',
      security: bearer,
      parameters: idParam,
      requestBody: {
        required: true,
        content: { 'application/json': { schema: { $ref: '#/components/schemas/SupplierStatus' } } },
      },
      responses: {
        200: success('Supplier updated', supplier),
        400: error('Validation failed'),
        401: error('Authentication required'),
        403: error('Missing supplier.update'),
        404: error('Supplier not found'),
      },
    },
  },
}
