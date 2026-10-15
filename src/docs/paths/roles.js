import { bearer, error, idParam, listParams, statusParam, success } from '../shape.js'

const role = { $ref: '#/components/schemas/Role' }
const roleWrite = { $ref: '#/components/schemas/RoleWrite' }
const rolePatch = { $ref: '#/components/schemas/RoleUpdate' }
const roleListParams = [...listParams, statusParam(['active', 'inactive'])]

export const rolePaths = {
  '/api/v1/roles': {
    get: {
      tags: ['Roles'],
      operationId: 'listRoles',
      summary: 'List roles',
      security: bearer,
      parameters: roleListParams,
      responses: {
        200: success('Roles', { type: 'array', items: role }, { list: true }),
        401: error('Authentication required'),
        403: error('Missing role.read'),
      },
    },
    post: {
      tags: ['Roles'],
      operationId: 'createRole',
      summary: 'Create a role',
      security: bearer,
      requestBody: {
        required: true,
        content: { 'application/json': { schema: roleWrite } },
      },
      responses: {
        201: success('Role created', role),
        400: error('Validation failed'),
        401: error('Authentication required'),
        403: error('Missing role.create'),
        409: error('Role code already exists'),
      },
    },
  },
  '/api/v1/roles/{id}': {
    get: {
      tags: ['Roles'],
      operationId: 'getRole',
      summary: 'Get a role',
      security: bearer,
      parameters: idParam,
      responses: {
        200: success('Role', role),
        401: error('Authentication required'),
        403: error('Missing role.read'),
        404: error('Role not found'),
      },
    },
    patch: {
      tags: ['Roles'],
      operationId: 'updateRole',
      summary: 'Update a role',
      description: 'Permission changes delete auth:user:{id} for every user who has this role, so the next request sees the new codes.',
      security: bearer,
      parameters: idParam,
      requestBody: {
        required: true,
        content: { 'application/json': { schema: rolePatch } },
      },
      responses: {
        200: success('Role updated', role),
        400: error('Validation failed'),
        401: error('Authentication required'),
        403: error('Missing role.update'),
        404: error('Role not found'),
        409: error('Role code already exists'),
      },
    },
  },
}
