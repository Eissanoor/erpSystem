import { bearer, error, listParams, statusParam, success } from '../shape.js'

const permission = { $ref: '#/components/schemas/Permission' }

export const permissionPaths = {
  '/api/v1/permissions': {
    get: {
      tags: ['Permissions'],
      operationId: 'listPermissions',
      summary: 'List permissions',
      security: bearer,
      parameters: [...listParams, statusParam(['active', 'inactive'])],
      responses: {
        200: success('Permissions', { type: 'array', items: permission }, { list: true }),
        401: error('Authentication required'),
        403: error('Missing permission.read'),
      },
    },
  },
}
