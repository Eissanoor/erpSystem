import { bearer, error, idParam, listParams, statusParam, success } from '../shape.js'
import { branchIdQuery } from './location.js'

const partnership = { $ref: '#/components/schemas/Partnership' }

export const partnershipPaths = {
  '/api/v1/partnerships': {
    get: {
      tags: ['Partnerships'],
      operationId: 'listPartnerships',
      summary: 'List partnerships',
      description:
        'Partnerships register. Search name or code, and filter with branchId and status. meta.summary holds the Agreements, Active, Review due, and Active partners cards. Those cards stay on the caller’s branches and ignore the table search and status. Review due counts draft agreements. Active partners counts partner rows on active agreements. The active dropdown omits summary.',
      security: bearer,
      parameters: [...listParams, statusParam(['draft', 'active', 'inactive']), branchIdQuery],
      responses: {
        200: success('Partnerships', { type: 'array', items: partnership }, {
          list: true,
          meta: { $ref: '#/components/schemas/PartnershipPageMeta' },
        }),
        401: error('Authentication required'),
        403: error('Missing partnership.read'),
      },
    },
    post: {
      tags: ['Partnerships'],
      operationId: 'createPartnership',
      summary: 'Create a partnership',
      description:
        'Add partnership. Requires name, code, agreement type, responsible branchId, effective date, managing partner, partner roster, profit allocation, loss allocation, and partners. Partner ownership, profit share, and loss share are stored separately and each column must total 100. capitalCommitment is the agreement amount. reviewDate is the end or review date. Document type, reference, and file are not accepted.',
      security: bearer,
      requestBody: {
        required: true,
        content: { 'application/json': { schema: { $ref: '#/components/schemas/PartnershipWrite' } } },
      },
      responses: {
        201: success('Partnership created', partnership),
        400: error('Validation failed'),
        401: error('Authentication required'),
        403: error('Missing partnership.create'),
        409: error('Partnership code already exists'),
      },
    },
  },
  '/api/v1/partnerships/{id}': {
    get: {
      tags: ['Partnerships'],
      operationId: 'getPartnership',
      summary: 'Get a partnership',
      description:
        'Partnership detail. summary holds the Agreements, Active, Review due, and Active partners cards. The profile returns name, code, agreementTypeLabel, branchId, effectiveDate, reviewDate, capitalCommitment, settlementFrequency, managingPartner, partnerRoster, profitAllocation, lossAllocation, approvalAuthority, and statusLabel. Responsible branch is branchId.name. partners is the allocation table and allocation is the Total row. Pass page and limit to page the partners. Created on is createdAt, Updated is updatedAt, and Record status is status.',
      security: bearer,
      parameters: [...idParam, { $ref: '#/components/parameters/page' }, { $ref: '#/components/parameters/limit' }],
      responses: {
        200: success('Partnership', partnership),
        401: error('Authentication required'),
        403: error('Missing partnership.read'),
        404: error('Partnership not found'),
      },
    },
    patch: {
      tags: ['Partnerships'],
      operationId: 'updatePartnership',
      summary: 'Update a partnership',
      description:
        'Edit partnership. Saves name, code, agreement type, branch, effective date, review date, capital commitment, settlement frequency, managing partner, partner roster, profit allocation, loss allocation, approval authority, status, notes, and partners. Omitting partners leaves the allocation table as it is. Sending partners replaces that table, and each share column must still total 100. Document type, reference, and file are not accepted.',
      security: bearer,
      parameters: idParam,
      requestBody: {
        required: true,
        content: { 'application/json': { schema: { $ref: '#/components/schemas/PartnershipUpdate' } } },
      },
      responses: {
        200: success('Partnership updated', partnership),
        400: error('Validation failed'),
        401: error('Authentication required'),
        403: error('Missing partnership.update'),
        404: error('Partnership not found'),
        409: error('Partnership code already exists'),
      },
    },
  },
  '/api/v1/partnerships/{id}/status': {
    patch: {
      tags: ['Partnerships'],
      operationId: 'updatePartnershipStatus',
      summary: 'Set partnership status',
      description: 'Sets draft, active, or inactive. Activation keeps the stored allocation columns.',
      security: bearer,
      parameters: idParam,
      requestBody: {
        required: true,
        content: { 'application/json': { schema: { $ref: '#/components/schemas/PartnershipStatus' } } },
      },
      responses: {
        200: success('Partnership updated', partnership),
        400: error('Validation failed'),
        401: error('Authentication required'),
        403: error('Missing partnership.update'),
        404: error('Partnership not found'),
      },
    },
  },
}
