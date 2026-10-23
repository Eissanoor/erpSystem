import { bearer, error, idParam, listParams, success } from '../shape.js'
import { branchIdQuery } from './location.js'

const objectIdParam = {
  name: 'customerId',
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

const customerIdQuery = {
  name: 'customerId',
  in: 'query',
  schema: { type: 'string', pattern: '^[a-fA-F0-9]{24}$' },
}

const aging = { $ref: '#/components/schemas/CustomerAging' }
const overview = { $ref: '#/components/schemas/CustomerReceivablesOverview' }
const invoice = { $ref: '#/components/schemas/CustomerInvoice' }
const receipt = { $ref: '#/components/schemas/CustomerReceipt' }
const ledger = { $ref: '#/components/schemas/CustomerLedgerEntry' }

export const receivablesPaths = {
  '/api/v1/customer-receivables/aging': {
    get: {
      tags: ['Customer receivables'],
      operationId: 'getCustomerAging',
      summary: 'Customer aging register',
      description:
        'Aging table and summary cards for Export Aging and the Customer Aging tab. Buckets are Current, 1-30, 31-60, and 61+ from invoice due dates versus asOf. Cards return totalReceivable, current, overdue1to30, and overdueOver30. Pass customerId to also fill selectedCustomer. Balances come from posted customer invoices and receipts; AccountingService is not required yet.',
      security: bearer,
      parameters: [branchIdQuery, customerIdQuery, currencyIdQuery, asOfQuery],
      responses: {
        200: success('Customer aging', aging),
        401: error('Authentication required'),
        403: error('Missing receivable.read'),
      },
    },
  },
  '/api/v1/customer-receivables/invoices': {
    get: {
      tags: ['Customer receivables'],
      operationId: 'listCustomerReceivableInvoices',
      summary: 'List customer invoices',
      description: 'Outstanding invoices register. Filter with branchId, customerId, currencyId, status, overdueOnly, and asOf.',
      security: bearer,
      parameters: [
        ...listParams,
        branchIdQuery,
        customerIdQuery,
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
        200: success('Customer invoices', { type: 'array', items: invoice }, { list: true }),
        401: error('Authentication required'),
        403: error('Missing receivable.read'),
      },
    },
    post: {
      tags: ['Customer receivables'],
      operationId: 'createCustomerInvoice',
      summary: 'Post a customer invoice',
      description:
        'Creates a posted sales invoice (SL-#####) and a DR ledger entry. Used until sales posting wires createInvoiceInSession.',
      security: bearer,
      requestBody: {
        required: true,
        content: { 'application/json': { schema: { $ref: '#/components/schemas/CustomerInvoiceWrite' } } },
      },
      responses: {
        201: success('Customer invoice posted', invoice),
        400: error('Validation failed'),
        401: error('Authentication required'),
        403: error('Missing receivable.create'),
      },
    },
  },
  '/api/v1/customer-receivables/invoices/{id}': {
    get: {
      tags: ['Customer receivables'],
      operationId: 'getCustomerInvoice',
      summary: 'Get a customer invoice',
      security: bearer,
      parameters: idParam,
      responses: {
        200: success('Customer invoice', invoice),
        401: error('Authentication required'),
        403: error('Missing receivable.read'),
        404: error('Invoice not found'),
      },
    },
  },
  '/api/v1/customer-receivables/receipts': {
    get: {
      tags: ['Customer receivables'],
      operationId: 'listCustomerReceipts',
      summary: 'List customer receipts',
      description: 'Receipt allocation register. Search receiptNumber, bankName, or voucherNumber.',
      security: bearer,
      parameters: [...listParams, branchIdQuery, customerIdQuery, currencyIdQuery],
      responses: {
        200: success('Customer receipts', { type: 'array', items: receipt }, { list: true }),
        401: error('Authentication required'),
        403: error('Missing receivable.read'),
      },
    },
    post: {
      tags: ['Customer receivables'],
      operationId: 'createCustomerReceipt',
      summary: 'Post a customer receipt',
      description:
        'New Receipt. Allocates to open invoices, posts a CR ledger entry (REC-#####), and may leave unallocated advance.',
      security: bearer,
      requestBody: {
        required: true,
        content: { 'application/json': { schema: { $ref: '#/components/schemas/CustomerReceiptWrite' } } },
      },
      responses: {
        201: success('Customer receipt posted', receipt),
        400: error('Validation failed'),
        401: error('Authentication required'),
        403: error('Missing receivable.create'),
      },
    },
  },
  '/api/v1/customer-receivables/receipts/{id}': {
    get: {
      tags: ['Customer receivables'],
      operationId: 'getCustomerReceipt',
      summary: 'Get a customer receipt',
      security: bearer,
      parameters: idParam,
      responses: {
        200: success('Customer receipt', receipt),
        401: error('Authentication required'),
        403: error('Missing receivable.read'),
        404: error('Receipt not found'),
      },
    },
  },
  '/api/v1/customer-receivables/customers/{customerId}/overview': {
    get: {
      tags: ['Customer receivables'],
      operationId: 'getCustomerReceivablesOverview',
      summary: 'Customer receivables quick view',
      description:
        'Sidebar: credit limit, outstanding, available credit, overdue, collectionAttention, outstandingInvoices, and latestAllocation.',
      security: bearer,
      parameters: [objectIdParam, branchIdQuery, currencyIdQuery, asOfQuery],
      responses: {
        200: success('Customer receivables overview', overview),
        401: error('Authentication required'),
        403: error('Missing receivable.read'),
        404: error('Customer not found'),
      },
    },
  },
  '/api/v1/customer-receivables/customers/{customerId}/invoices': {
    get: {
      tags: ['Customer receivables'],
      operationId: 'listInvoicesForCustomer',
      summary: 'List invoices for a customer',
      security: bearer,
      parameters: [objectIdParam, ...listParams, branchIdQuery, currencyIdQuery, asOfQuery],
      responses: {
        200: success('Customer invoices', { type: 'array', items: invoice }, { list: true }),
        401: error('Authentication required'),
        403: error('Missing receivable.read'),
      },
    },
  },
  '/api/v1/customer-receivables/customers/{customerId}/ledger': {
    get: {
      tags: ['Customer receivables'],
      operationId: 'listCustomerLedger',
      summary: 'Customer ledger',
      description:
        'Traceable customer ledger. Sales invoices DR increase balance; receipts CR decrease balance.',
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
        200: success('Customer ledger', { type: 'array', items: ledger }, { list: true }),
        401: error('Authentication required'),
        403: error('Missing receivable.read'),
        404: error('Customer not found'),
      },
    },
  },
}
