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
}) {
  const item = { $ref: schema }
  const listParameters = [...listParams, statusParam(['active', 'inactive']), ...extraListParams]

  return {
    [basePath]: {
      get: {
        tags: [tag],
        operationId: `list${plural}`,
        summary: `List ${plural.toLowerCase()}`,
        security: bearer,
        parameters: listParameters,
        responses: {
          200: success(plural, { type: 'array', items: item }, { list: true }),
          401: error('Authentication required'),
          403: error(`Missing ${permission}.read`),
        },
      },
      post: {
        tags: [tag],
        operationId: `create${noun}`,
        summary: `Create a ${noun.toLowerCase()}`,
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
          409: error(`${noun} code already exists`),
        },
      },
    },
    [`${basePath}/{id}`]: {
      get: {
        tags: [tag],
        operationId: `get${noun}`,
        summary: `Get a ${noun.toLowerCase()}`,
        security: bearer,
        parameters: idParam,
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
        summary: `Update a ${noun.toLowerCase()}`,
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
          409: error(`${noun} code already exists`),
        },
      },
    },
    [`${basePath}/{id}/status`]: {
      patch: {
        tags: [tag],
        operationId: `update${noun}Status`,
        summary: `Set ${noun.toLowerCase()} status`,
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
