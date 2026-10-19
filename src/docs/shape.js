export function success(description, dataSchema, { list = false, meta } = {}) {
  const properties = {
    success: { type: 'boolean', example: true },
    message: { type: 'string' },
    data: dataSchema,
  }
  const required = ['success', 'message', 'data']
  if (list) {
    properties.meta = meta || { $ref: '#/components/schemas/PageMeta' }
    required.push('meta')
  }
  return {
    description,
    content: {
      'application/json': {
        schema: { type: 'object', required, properties },
      },
    },
  }
}

export function error(description) {
  return {
    description,
    content: {
      'application/json': {
        schema: { $ref: '#/components/schemas/ErrorEnvelope' },
      },
    },
  }
}

export const bearer = [{ bearerAuth: [] }]

export const listParams = [
  { $ref: '#/components/parameters/page' },
  { $ref: '#/components/parameters/limit' },
  { $ref: '#/components/parameters/search' },
  { $ref: '#/components/parameters/sort' },
]

export function statusParam(values) {
  return {
    name: 'status',
    in: 'query',
    schema: { type: 'string', enum: values },
  }
}

export const idParam = [{ $ref: '#/components/parameters/id' }]
