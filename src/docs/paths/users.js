import { bearer, error, idParam, listParams, statusParam, success } from '../shape.js'

const user = { $ref: '#/components/schemas/User' }
const userWrite = { $ref: '#/components/schemas/UserCreate' }
const userPatch = { $ref: '#/components/schemas/UserUpdate' }
const access = { $ref: '#/components/schemas/UserAccess' }

const userListParams = [...listParams, statusParam(['active', 'locked', 'inactive'])]

export const userPaths = {
  '/api/v1/users': {
    get: {
      tags: ['Users'],
      operationId: 'listUsers',
      summary: 'List users',
      security: bearer,
      parameters: userListParams,
      responses: {
        200: success('Users', { type: 'array', items: user }, { list: true }),
        401: error('Authentication required'),
        403: error('Missing user.read'),
      },
    },
    post: {
      tags: ['Users'],
      operationId: 'createUser',
      summary: 'Create a user',
      security: bearer,
      requestBody: {
        required: true,
        content: { 'application/json': { schema: userWrite } },
      },
      responses: {
        201: success('User created', user),
        400: error('Validation failed'),
        401: error('Authentication required'),
        403: error('Missing user.create'),
        409: error('Email already exists'),
      },
    },
  },
  '/api/v1/users/{id}': {
    get: {
      tags: ['Users'],
      operationId: 'getUser',
      summary: 'Get a user',
      security: bearer,
      parameters: idParam,
      responses: {
        200: success('User', user),
        401: error('Authentication required'),
        403: error('Missing user.read'),
        404: error('User not found'),
      },
    },
    patch: {
      tags: ['Users'],
      operationId: 'updateUser',
      summary: 'Update profile fields',
      description: 'Role, branch, and warehouse access are changed on PATCH /users/{id}/access.',
      security: bearer,
      parameters: idParam,
      requestBody: {
        required: true,
        content: { 'application/json': { schema: userPatch } },
      },
      responses: {
        200: success('User updated', user),
        400: error('Validation failed'),
        401: error('Authentication required'),
        403: error('Missing user.update'),
        404: error('User not found'),
        409: error('Email already exists'),
      },
    },
  },
  '/api/v1/users/{id}/access': {
    patch: {
      tags: ['Users'],
      operationId: 'updateUserAccess',
      summary: 'Update roles, branches, and warehouses',
      description:
        'Branch and warehouse ids are stored as given. Existence checks start in stage 2, when those collections exist. This deletes the auth:user:{id} cache.',
      security: bearer,
      parameters: idParam,
      requestBody: {
        required: true,
        content: { 'application/json': { schema: access } },
      },
      responses: {
        200: success('Access updated', user),
        400: error('Validation failed'),
        401: error('Authentication required'),
        403: error('Missing user.update'),
        404: error('User not found'),
      },
    },
  },
}
