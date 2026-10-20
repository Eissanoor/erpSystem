import { bearer, error, idParam, listParams, statusParam, success } from '../shape.js'
import { branchIdQuery } from './location.js'

const owner = { $ref: '#/components/schemas/Owner' }

export const ownerPaths = {
  '/api/v1/owners': {
    get: {
      tags: ['Owners'],
      operationId: 'listOwners',
      summary: 'List owners',
      description:
        'Owners register. Search name or code, and filter with branchId and status. meta.summary holds the Owners, Active, Ownership allocated, and Capital pledged cards. Those cards stay on the caller’s branches and ignore the table search and status. The active dropdown omits summary. Ownership allocated and capital pledged count active owners. Capital pledged uses each owner’s latest interest.',
      security: bearer,
      parameters: [...listParams, statusParam(['active', 'inactive']), branchIdQuery],
      responses: {
        200: success('Owners', { type: 'array', items: owner }, {
          list: true,
          meta: { $ref: '#/components/schemas/OwnerPageMeta' },
        }),
        401: error('Authentication required'),
        403: error('Missing owner.read'),
      },
    },
    post: {
      tags: ['Owners'],
      operationId: 'createOwner',
      summary: 'Create an owner',
      description:
        'Add owner. Requires name, code, owner type, email, ownership share, effective date, and the workspace branchId. Capital commitment, capital account, and authorized signatory are optional. When interests are omitted, the share, capital commitment, and effective date are stored as the first capital record with paid in at 0. capitalAccount is the account name. capitalAccountId stays empty. Saving an owner does not create an ERP login. Document type, reference, and file are not accepted. summary.ownershipAllocated is the current allocation.',
      security: bearer,
      requestBody: {
        required: true,
        content: { 'application/json': { schema: { $ref: '#/components/schemas/OwnerWrite' } } },
      },
      responses: {
        201: success('Owner created', owner),
        400: error('Validation failed'),
        401: error('Authentication required'),
        403: error('Missing owner.create'),
        409: error('Owner code already exists'),
      },
    },
  },
  '/api/v1/owners/{id}': {
    get: {
      tags: ['Owners'],
      operationId: 'getOwner',
      summary: 'Get an owner',
      description:
        'Owner detail. summary holds the Owners, Active, Ownership allocated, and Capital pledged cards. The profile returns name, code, ownerTypeLabel, identityNo, email, phone, address, countryOfRegistration, ownershipPercentage, capitalCommitment, effectiveDate, capitalAccount, authorizedSignatory, and statusLabel. interests is the capital table (entity, share, committed, paidIn, effectiveDate), newest date first. allocation is the Total allocated row and effectiveLabel is Current. Pass page and limit to page the interests. Created on is createdAt, Updated is updatedAt, and Record status is status.',
      security: bearer,
      parameters: [...idParam, { $ref: '#/components/parameters/page' }, { $ref: '#/components/parameters/limit' }],
      responses: {
        200: success('Owner', owner),
        401: error('Authentication required'),
        403: error('Missing owner.read'),
        404: error('Owner not found'),
      },
    },
    patch: {
      tags: ['Owners'],
      operationId: 'updateOwner',
      summary: 'Update an owner',
      description:
        'Edit owner. Saves name, code, owner type, identity number, email, phone, address, country, ownership share, capital commitment, effective date, capital account, authorized signatory, status, and notes. Omitting interests leaves the capital table in place. A changed share, commitment, or effective date adds a new capital row and keeps the earlier rows, including paid in and entity. Document type, reference, and file are not accepted.',
      security: bearer,
      parameters: idParam,
      requestBody: {
        required: true,
        content: { 'application/json': { schema: { $ref: '#/components/schemas/OwnerUpdate' } } },
      },
      responses: {
        200: success('Owner updated', owner),
        400: error('Validation failed'),
        401: error('Authentication required'),
        403: error('Missing owner.update'),
        404: error('Owner not found'),
        409: error('Owner code already exists'),
      },
    },
  },
  '/api/v1/owners/{id}/status': {
    patch: {
      tags: ['Owners'],
      operationId: 'updateOwnerStatus',
      summary: 'Set owner status',
      description: 'Sets active or inactive. This does not grant ERP access.',
      security: bearer,
      parameters: idParam,
      requestBody: {
        required: true,
        content: { 'application/json': { schema: { $ref: '#/components/schemas/OwnerStatus' } } },
      },
      responses: {
        200: success('Owner updated', owner),
        400: error('Validation failed'),
        401: error('Authentication required'),
        403: error('Missing owner.update'),
        404: error('Owner not found'),
      },
    },
  },
}
