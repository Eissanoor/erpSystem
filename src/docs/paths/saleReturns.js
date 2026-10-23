import { bearer, error, idParam, listParams, success } from '../shape.js'
import { branchIdQuery } from './location.js'

const saleReturn = { $ref: '#/components/schemas/SaleReturn' }

export const saleReturnPaths = {
  '/api/v1/sale-returns': {
    get: {
      tags: ['Sales returns'],
      operationId: 'listSaleReturns',
      summary: 'List sales returns',
      security: bearer,
      parameters: [
        ...listParams,
        branchIdQuery,
        {
          name: 'customerId',
          in: 'query',
          schema: { type: 'string', pattern: '^[a-fA-F0-9]{24}$' },
        },
        {
          name: 'saleId',
          in: 'query',
          schema: { type: 'string', pattern: '^[a-fA-F0-9]{24}$' },
        },
        {
          name: 'status',
          in: 'query',
          schema: { type: 'string', enum: ['draft', 'approved', 'posted', 'cancelled'] },
        },
      ],
      responses: {
        200: success('Sales returns', { type: 'array', items: saleReturn }, { list: true }),
        401: error('Authentication required'),
        403: error('Missing sale_return.read'),
      },
    },
    post: {
      tags: ['Sales returns'],
      operationId: 'createSaleReturn',
      summary: 'Create a draft sales return',
      description:
        'Creates SR-##### in draft from a posted sale. Stock-IN and AR credit occur only on post.',
      security: bearer,
      requestBody: {
        required: true,
        content: { 'application/json': { schema: { $ref: '#/components/schemas/SaleReturnWrite' } } },
      },
      responses: {
        201: success('Sales return created', saleReturn),
        400: error('Validation failed'),
        401: error('Authentication required'),
        403: error('Missing sale_return.create'),
      },
    },
  },
  '/api/v1/sale-returns/{id}': {
    get: {
      tags: ['Sales returns'],
      operationId: 'getSaleReturn',
      summary: 'Get a sales return',
      description:
        'Detail for Print Return: original sale, lines (sold/return), totals, postingPreview journal, history, and stockImpactSummary.',
      security: bearer,
      parameters: idParam,
      responses: {
        200: success('Sales return', saleReturn),
        401: error('Authentication required'),
        403: error('Missing sale_return.read'),
        404: error('Sales return not found'),
      },
    },
    patch: {
      tags: ['Sales returns'],
      operationId: 'updateSaleReturn',
      summary: 'Update a draft sales return',
      security: bearer,
      parameters: idParam,
      requestBody: {
        required: true,
        content: { 'application/json': { schema: { $ref: '#/components/schemas/SaleReturnUpdate' } } },
      },
      responses: {
        200: success('Sales return updated', saleReturn),
        409: error('Return is locked'),
      },
    },
  },
  '/api/v1/sale-returns/{id}/approve': {
    post: {
      tags: ['Sales returns'],
      operationId: 'approveSaleReturn',
      summary: 'Approve a sales return for posting',
      security: bearer,
      parameters: idParam,
      responses: {
        200: success('Sales return approved', saleReturn),
        400: error('Cannot approve'),
        403: error('Missing sale_return.approve'),
      },
    },
  },
  '/api/v1/sale-returns/{id}/post': {
    post: {
      tags: ['Sales returns'],
      operationId: 'postSaleReturn',
      summary: 'Post a sales return',
      description:
        'Stock-IN (sales_return), credits customer AR (and allocates against the original sale invoice when linked). Journal lines in postingPreview are preview-only.',
      security: bearer,
      parameters: idParam,
      responses: {
        200: success('Sales return posted', saleReturn),
        400: error('Cannot post'),
        403: error('Missing sale_return.post'),
      },
    },
  },
  '/api/v1/sale-returns/{id}/cancel': {
    post: {
      tags: ['Sales returns'],
      operationId: 'cancelSaleReturn',
      summary: 'Cancel a draft or approved sales return',
      security: bearer,
      parameters: idParam,
      responses: {
        200: success('Sales return cancelled', saleReturn),
        400: error('Cannot cancel'),
      },
    },
  },
}
