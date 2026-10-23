import { bearer, error, idParam, listParams, statusParam, success } from '../shape.js'

const customer = { $ref: '#/components/schemas/Customer' }

export const customerPaths = {
  '/api/v1/customers': {
    get: {
      tags: ['Customers'],
      operationId: 'listCustomers',
      summary: 'Customer register',
      description:
        'Customer register. Search code, name, contactName, email, phone, or receivable account. Filter with status, paymentTerms, currencyId, branchId, and asOf. Each row includes receivable outstanding from posted invoices, payable (always 0 on customer master), and AR/AP account label. meta.summary holds Customers / Receivable Balance / Credit Customers / Inactive Parties cards. meta.totals.receivable is the page footer.',
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
        200: success('Customers', { type: 'array', items: customer }, {
          list: true,
          meta: { $ref: '#/components/schemas/CustomerPageMeta' },
        }),
        401: error('Authentication required'),
        403: error('Missing customer.read'),
      },
    },
    post: {
      tags: ['Customers'],
      operationId: 'createCustomer',
      summary: 'Create a customer',
      description:
        'Add customer. Requires code, name, currencyId, paymentTerms, and receivableAccount. Optional contactName, phone, email, address, and creditLimit. Saving does not post a voucher.',
      security: bearer,
      requestBody: {
        required: true,
        content: { 'application/json': { schema: { $ref: '#/components/schemas/CustomerWrite' } } },
      },
      responses: {
        201: success('Customer created', customer),
        400: error('Validation failed'),
        401: error('Authentication required'),
        403: error('Missing customer.create'),
        409: error('Customer code already exists'),
      },
    },
  },
  '/api/v1/customers/{id}': {
    get: {
      tags: ['Customers'],
      operationId: 'getCustomer',
      summary: 'Get a customer',
      description:
        'Detail pane. Profile plus creditLimit / availableCredit, receivablesActivity, ledgerPath, and balanceNote (AR/AP stay separate). Optional branchId, currencyId, asOf.',
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
        200: success('Customer', customer),
        401: error('Authentication required'),
        403: error('Missing customer.read'),
        404: error('Customer not found'),
      },
    },
    patch: {
      tags: ['Customers'],
      operationId: 'updateCustomer',
      summary: 'Update a customer',
      description:
        'Edit customer details, contact, credit limit, commercial terms, receivable account name, or status. Does not post ledger entries.',
      security: bearer,
      parameters: idParam,
      requestBody: {
        required: true,
        content: { 'application/json': { schema: { $ref: '#/components/schemas/CustomerUpdate' } } },
      },
      responses: {
        200: success('Customer updated', customer),
        400: error('Validation failed'),
        401: error('Authentication required'),
        403: error('Missing customer.update'),
        404: error('Customer not found'),
        409: error('Customer code already exists'),
      },
    },
  },
  '/api/v1/customers/{id}/status': {
    patch: {
      tags: ['Customers'],
      operationId: 'setCustomerStatus',
      summary: 'Set customer status',
      description: 'Sets active or inactive. Inactive customers are unavailable for new sales.',
      security: bearer,
      parameters: idParam,
      requestBody: {
        required: true,
        content: { 'application/json': { schema: { $ref: '#/components/schemas/CustomerStatus' } } },
      },
      responses: {
        200: success('Customer updated', customer),
        400: error('Validation failed'),
        401: error('Authentication required'),
        403: error('Missing customer.update'),
        404: error('Customer not found'),
      },
    },
  },
}
