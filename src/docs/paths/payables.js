import { bearer, error, idParam, listParams, success } from '../shape.js'
import { branchIdQuery } from './location.js'

const objectIdParam = {
  name: 'supplierId',
  in: 'path',
  required: true,
  schema: { type: 'string', pattern: '^[a-fA-F0-9]{24}$' },
}

const asOfQuery = {
  name: 'asOf',
  in: 'query',
  schema: { type: 'string', format: 'date' },
  description: 'Aging as-of date. Defaults to today (UTC).',
}

const currencyIdQuery = {
  name: 'currencyId',
  in: 'query',
  schema: { type: 'string', pattern: '^[a-fA-F0-9]{24}$' },
}

const supplierIdQuery = {
  name: 'supplierId',
  in: 'query',
  schema: { type: 'string', pattern: '^[a-fA-F0-9]{24}$' },
}

const aging = { $ref: '#/components/schemas/SupplierAging' }
const overview = { $ref: '#/components/schemas/SupplierPayablesOverview' }
const invoice = { $ref: '#/components/schemas/SupplierInvoice' }
const payment = { $ref: '#/components/schemas/SupplierPayment' }
const ledger = { $ref: '#/components/schemas/SupplierLedgerEntry' }

export const payablesPaths = {
  '/api/v1/supplier-payables/aging': {
    get: {
      tags: ['Supplier payables'],
      operationId: 'getSupplierAging',
      summary: 'Supplier aging register',
      description:
        'Aging table and summary cards for Export Aging and the Supplier Aging tab. Buckets are Current, 1-30, 31-60, and 61+ from invoice due dates versus asOf. Cards return totalPayable, current, overdue1to30, and overdueOver30 (31-60 plus 61+). Pass supplierId to also fill selectedSupplier with the quick-view card. Payable balances come from posted supplier invoices and payments in this module; centralized AccountingService is not required yet.',
      security: bearer,
      parameters: [branchIdQuery, supplierIdQuery, currencyIdQuery, asOfQuery],
      responses: {
        200: success('Supplier aging', aging),
        401: error('Authentication required'),
        403: error('Missing payable.read'),
      },
    },
  },
  '/api/v1/supplier-payables/invoices': {
    get: {
      tags: ['Supplier payables'],
      operationId: 'listSupplierInvoices',
      summary: 'List supplier invoices',
      description: 'Due invoices register. Filter with branchId, supplierId, currencyId, status, overdueOnly, and asOf.',
      security: bearer,
      parameters: [
        ...listParams,
        branchIdQuery,
        supplierIdQuery,
        currencyIdQuery,
        asOfQuery,
        {
          name: 'overdueOnly',
          in: 'query',
          schema: { type: 'boolean' },
        },
        {
          name: 'status',
          in: 'query',
          schema: { type: 'string', enum: ['posted', 'cancelled'] },
        },
      ],
      responses: {
        200: success('Supplier invoices', { type: 'array', items: invoice }, { list: true }),
        401: error('Authentication required'),
        403: error('Missing payable.read'),
      },
    },
    post: {
      tags: ['Supplier payables'],
      operationId: 'createSupplierInvoice',
      summary: 'Post a supplier invoice',
      description:
        'Creates a posted purchase payable (PO number). Credits the supplier ledger and increases aging. Optional dueDate defaults from the supplier payment terms. Does not move stock or call AccountingService.',
      security: bearer,
      requestBody: {
        required: true,
        content: { 'application/json': { schema: { $ref: '#/components/schemas/SupplierInvoiceWrite' } } },
      },
      responses: {
        201: success('Supplier invoice posted', invoice),
        400: error('Validation failed'),
        401: error('Authentication required'),
        403: error('Missing payable.create'),
        409: error('Purchase number already exists'),
      },
    },
  },
  '/api/v1/supplier-payables/invoices/{id}': {
    get: {
      tags: ['Supplier payables'],
      operationId: 'getSupplierInvoice',
      summary: 'Get a supplier invoice',
      security: bearer,
      parameters: idParam,
      responses: {
        200: success('Supplier invoice', invoice),
        401: error('Authentication required'),
        403: error('Missing payable.read'),
        404: error('Invoice not found'),
      },
    },
  },
  '/api/v1/supplier-payables/payments': {
    get: {
      tags: ['Supplier payables'],
      operationId: 'listSupplierPayments',
      summary: 'List supplier payments',
      description: 'Payment allocation history. Search payment number or bank name.',
      security: bearer,
      parameters: [
        ...listParams,
        branchIdQuery,
        supplierIdQuery,
        currencyIdQuery,
        {
          name: 'status',
          in: 'query',
          schema: { type: 'string', enum: ['posted', 'cancelled'] },
        },
      ],
      responses: {
        200: success('Supplier payments', { type: 'array', items: payment }, { list: true }),
        401: error('Authentication required'),
        403: error('Missing payable.read'),
      },
    },
    post: {
      tags: ['Supplier payables'],
      operationId: 'createSupplierPayment',
      summary: 'Post a supplier payment',
      description:
        'New Payment. Posts immediately, allocates amounts to invoices, writes a supplier ledger debit, and leaves any remainder as unallocatedAdvance. Bank payments require bankName. Over-allocation is rejected. Does not post a centralized accounting voucher yet.',
      security: bearer,
      requestBody: {
        required: true,
        content: { 'application/json': { schema: { $ref: '#/components/schemas/SupplierPaymentWrite' } } },
      },
      responses: {
        201: success('Supplier payment posted', payment),
        400: error('Validation failed'),
        401: error('Authentication required'),
        403: error('Missing payable.create'),
      },
    },
  },
  '/api/v1/supplier-payables/payments/{id}': {
    get: {
      tags: ['Supplier payables'],
      operationId: 'getSupplierPayment',
      summary: 'Get a supplier payment',
      security: bearer,
      parameters: idParam,
      responses: {
        200: success('Supplier payment', payment),
        401: error('Authentication required'),
        403: error('Missing payable.read'),
        404: error('Payment not found'),
      },
    },
  },
  '/api/v1/supplier-payables/suppliers/{supplierId}/overview': {
    get: {
      tags: ['Supplier payables'],
      operationId: 'getSupplierPayablesOverview',
      summary: 'Supplier quick view',
      description:
        'Quick-view card: terms, outstanding, overdue, unallocated advance, next due, overdue follow-up invoices, and the latest allocation note.',
      security: bearer,
      parameters: [objectIdParam, branchIdQuery, currencyIdQuery, asOfQuery],
      responses: {
        200: success('Supplier payables overview', overview),
        401: error('Authentication required'),
        403: error('Missing payable.read'),
        404: error('Supplier not found'),
      },
    },
  },
  '/api/v1/supplier-payables/suppliers/{supplierId}/invoices': {
    get: {
      tags: ['Supplier payables'],
      operationId: 'listInvoicesForSupplier',
      summary: 'Due invoices for one supplier',
      description: 'Due Invoices & Payment Allocation table for the selected supplier.',
      security: bearer,
      parameters: [
        objectIdParam,
        ...listParams,
        branchIdQuery,
        currencyIdQuery,
        asOfQuery,
        {
          name: 'overdueOnly',
          in: 'query',
          schema: { type: 'boolean' },
        },
      ],
      responses: {
        200: success('Supplier invoices', { type: 'array', items: invoice }, { list: true }),
        401: error('Authentication required'),
        403: error('Missing payable.read'),
      },
    },
  },
  '/api/v1/supplier-payables/suppliers/{supplierId}/ledger': {
    get: {
      tags: ['Supplier payables'],
      operationId: 'listSupplierLedger',
      summary: 'Traceable supplier ledger',
      description:
        'Chronological supplier AP ledger. Purchases credit the balance; payments debit it. Running balance is returned on each row.',
      security: bearer,
      parameters: [
        objectIdParam,
        ...listParams,
        branchIdQuery,
        currencyIdQuery,
        { name: 'from', in: 'query', schema: { type: 'string', format: 'date' } },
        { name: 'to', in: 'query', schema: { type: 'string', format: 'date' } },
      ],
      responses: {
        200: success('Supplier ledger', { type: 'array', items: ledger }, { list: true }),
        401: error('Authentication required'),
        403: error('Missing payable.read'),
        404: error('Supplier not found'),
      },
    },
  },
}
