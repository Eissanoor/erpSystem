import { bearer, error, idParam, listParams, statusParam, success } from '../shape.js'

const statusSchema = { $ref: '#/components/schemas/MasterStatus' }

export const branchIdQuery = {
  name: 'branchId',
  in: 'query',
  schema: { type: 'string', pattern: '^[a-fA-F0-9]{24}$' },
}

export function locationPaths({
  tag,
  basePath,
  noun,
  plural,
  schema,
  writeSchema,
  updateSchema,
  permission,
  extraListParams = [],
  statusDescription,
  label,
  listLabel,
  duplicateMessage,
  workspace = false,
  listMeta,
  listDescription,
  detailParameters = [],
  detailDescription,
  updateDescription,
  createDescription,
}) {
  const item = { $ref: schema }
  const one = label || noun.toLowerCase()
  const many = listLabel || plural.toLowerCase()
  const duplicate = duplicateMessage || `${noun} code already exists`
  const listParameters = [...listParams, statusParam(['active', 'inactive']), ...extraListParams]

  return {
    [basePath]: {
      get: {
        tags: [tag],
        operationId: `list${plural}`,
        summary: `List ${many}`,
        description:
          listDescription ||
          (workspace
            ? 'Register lists include meta.summary for the organization cards. The active dropdown (status=active, page=1, limit=20, no search or sort) omits summary and, for branches, the shop and warehouse counts.'
            : undefined),
        security: bearer,
        parameters: listParameters,
        responses: {
          200: success(plural, { type: 'array', items: item }, {
            list: true,
            meta: listMeta || (workspace ? { $ref: '#/components/schemas/OrganizationPageMeta' } : undefined),
          }),
          401: error('Authentication required'),
          403: error(`Missing ${permission}.read`),
        },
      },
      post: {
        tags: [tag],
        operationId: `create${noun}`,
        summary: `Create a ${one}`,
        description: createDescription,
        security: bearer,
        requestBody: {
          required: true,
          content: { 'application/json': { schema: { $ref: writeSchema } } },
        },
        responses: {
          201: success(`${noun} created`, item),
          400: error('Validation failed'),
          401: error('Authentication required'),
          403: error(`Missing ${permission}.create`),
          409: error(duplicate),
        },
      },
    },
    [`${basePath}/{id}`]: {
      get: {
        tags: [tag],
        operationId: `get${noun}`,
        summary: `Get a ${one}`,
        description: detailDescription,
        security: bearer,
        parameters: [...idParam, ...detailParameters],
        responses: {
          200: success(noun, item),
          401: error('Authentication required'),
          403: error(`Missing ${permission}.read`),
          404: error(`${noun} not found`),
        },
      },
      patch: {
        tags: [tag],
        operationId: `update${noun}`,
        summary: `Update a ${one}`,
        description: updateDescription,
        security: bearer,
        parameters: idParam,
        requestBody: {
          required: true,
          content: { 'application/json': { schema: { $ref: updateSchema } } },
        },
        responses: {
          200: success(`${noun} updated`, item),
          400: error('Validation failed'),
          401: error('Authentication required'),
          403: error(`Missing ${permission}.update`),
          404: error(`${noun} not found`),
          409: error(duplicate),
        },
      },
    },
    [`${basePath}/{id}/status`]: {
      patch: {
        tags: [tag],
        operationId: `update${noun}Status`,
        summary: `Set ${one} status`,
        description: statusDescription,
        security: bearer,
        parameters: idParam,
        requestBody: {
          required: true,
          content: { 'application/json': { schema: statusSchema } },
        },
        responses: {
          200: success(`${noun} updated`, item),
          400: error('Validation failed'),
          401: error('Authentication required'),
          403: error(`Missing ${permission}.update`),
          404: error(`${noun} not found`),
        },
      },
    },
  }
}
