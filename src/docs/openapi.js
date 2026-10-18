import { authPaths } from './paths/auth.js'
import { permissionPaths } from './paths/permissions.js'
import { rolePaths } from './paths/roles.js'
import { userPaths } from './paths/users.js'

const objectId = { type: 'string', pattern: '^[a-fA-F0-9]{24}$' }
const objectIdArray = { type: 'array', items: objectId }

export function buildOpenApiSpec(serverUrl = '/') {
  return {
    openapi: '3.0.3',
    info: {
      title: 'ERP Gulzar API',
      version: '0.2.0',
      description:
        'Single-client ERP. Branch is the top-level location. Protected routes use bearerAuth. Logout does not revoke the access token before JWT_ACCESS_EXPIRES (default 15 minutes).',
    },
    servers: [{ url: serverUrl }],
    tags: [
      { name: 'Health', description: 'Service health' },
      { name: 'Auth', description: 'Login, refresh, and the current user' },
      { name: 'Users', description: 'User accounts and access' },
      { name: 'Roles', description: 'Permission groups' },
      { name: 'Permissions', description: 'Module action codes' },
    ],
    paths: {
      '/health': {
        get: {
          tags: ['Health'],
          summary: 'Database health',
          responses: {
            200: {
              description: 'Database is up',
              content: {
                'application/json': {
                  schema: { $ref: '#/components/schemas/SuccessEnvelope' },
                },
              },
            },
          },
        },
      },
      ...authPaths,
      ...userPaths,
      ...rolePaths,
      ...permissionPaths,
    },
    components: {
      securitySchemes: {
        bearerAuth: {
          type: 'http',
          scheme: 'bearer',
          bearerFormat: 'JWT',
          description:
            'Access token from POST /api/v1/auth/login. Logout does not revoke this token; it stays valid until it expires (JWT_ACCESS_EXPIRES, default 15 minutes). Instant revoke is a stage 12 denylist.',
        },
      },
      parameters: {
        page: {
          name: 'page',
          in: 'query',
          schema: { type: 'integer', minimum: 1, default: 1 },
        },
        limit: {
          name: 'limit',
          in: 'query',
          schema: { type: 'integer', minimum: 1, maximum: 100, default: 20 },
        },
        search: {
          name: 'search',
          in: 'query',
          schema: { type: 'string' },
        },
        sort: {
          name: 'sort',
          in: 'query',
          description: 'Allow-listed field. Prefix with - for descending.',
          schema: { type: 'string' },
        },
        id: {
          name: 'id',
          in: 'path',
          required: true,
          schema: objectId,
        },
      },
      schemas: {
        SuccessEnvelope: {
          type: 'object',
          required: ['success', 'message', 'data'],
          properties: {
            success: { type: 'boolean', example: true },
            message: { type: 'string' },
            data: {},
            meta: { $ref: '#/components/schemas/PageMeta' },
          },
        },
        PageMeta: {
          type: 'object',
          required: ['page', 'limit', 'total'],
          properties: {
            page: { type: 'integer' },
            limit: { type: 'integer' },
            total: { type: 'integer' },
          },
        },
        ErrorEnvelope: {
          type: 'object',
          required: ['success', 'message', 'errors'],
          properties: {
            success: { type: 'boolean', example: false },
            message: { type: 'string' },
            errors: {
              type: 'array',
              items: {
                type: 'object',
                properties: {
                  field: { type: 'string' },
                  message: { type: 'string' },
                },
              },
            },
          },
        },
        LoginRequest: {
          type: 'object',
          required: ['email', 'password'],
          properties: {
            email: { type: 'string', format: 'email' },
            password: { type: 'string' },
          },
        },
        RefreshRequest: {
          type: 'object',
          required: ['refreshToken'],
          properties: {
            refreshToken: { type: 'string' },
          },
        },
        AuthUser: {
          type: 'object',
          properties: {
            _id: objectId,
            name: { type: 'string' },
            email: { type: 'string' },
            phone: { type: 'string' },
            status: { type: 'string', enum: ['active', 'locked', 'inactive'] },
            employeeId: { ...objectId, nullable: true },
            roleIds: objectIdArray,
            branchIds: objectIdArray,
            warehouseIds: objectIdArray,
            permissionCodes: { type: 'array', items: { type: 'string' }, example: ['user.read', 'all_branches'] },
            lastLoginAt: { type: 'string', format: 'date-time', nullable: true },
          },
        },
        AuthSession: {
          type: 'object',
          required: ['user', 'accessToken', 'refreshToken'],
          properties: {
            user: { $ref: '#/components/schemas/AuthUser' },
            accessToken: { type: 'string' },
            refreshToken: { type: 'string' },
          },
        },
        RoleRef: {
          type: 'object',
          properties: {
            _id: objectId,
            name: { type: 'string' },
            code: { type: 'string' },
          },
        },
        User: {
          type: 'object',
          properties: {
            _id: objectId,
            name: { type: 'string' },
            email: { type: 'string' },
            phone: { type: 'string' },
            status: { type: 'string', enum: ['active', 'locked', 'inactive'] },
            employeeId: { ...objectId, nullable: true },
            roleIds: { type: 'array', items: { $ref: '#/components/schemas/RoleRef' } },
            branchIds: objectIdArray,
            warehouseIds: objectIdArray,
            lastLoginAt: { type: 'string', format: 'date-time', nullable: true },
            createdAt: { type: 'string', format: 'date-time' },
            updatedAt: { type: 'string', format: 'date-time' },
          },
        },
        UserCreate: {
          type: 'object',
          required: ['name', 'email', 'password'],
          properties: {
            name: { type: 'string' },
            email: { type: 'string', format: 'email' },
            password: { type: 'string', minLength: 8, writeOnly: true },
            phone: { type: 'string' },
            employeeId: { ...objectId, nullable: true },
            roleIds: objectIdArray,
            branchIds: objectIdArray,
            warehouseIds: objectIdArray,
            status: { type: 'string', enum: ['active', 'locked', 'inactive'] },
          },
        },
        UserUpdate: {
          type: 'object',
          properties: {
            name: { type: 'string' },
            email: { type: 'string', format: 'email' },
            password: { type: 'string', minLength: 8, writeOnly: true },
            phone: { type: 'string' },
            employeeId: { ...objectId, nullable: true },
            status: { type: 'string', enum: ['active', 'locked', 'inactive'] },
            roleIds: objectIdArray,
            branchIds: objectIdArray,
            warehouseIds: objectIdArray,
          },
        },
        PermissionRef: {
          type: 'object',
          properties: {
            _id: objectId,
            module: { type: 'string' },
            action: { type: 'string' },
            code: { type: 'string' },
          },
        },
        Role: {
          type: 'object',
          properties: {
            _id: objectId,
            name: { type: 'string' },
            code: { type: 'string' },
            status: { type: 'string', enum: ['active', 'inactive'] },
            permissionIds: { type: 'array', items: { $ref: '#/components/schemas/PermissionRef' } },
            createdAt: { type: 'string', format: 'date-time' },
            updatedAt: { type: 'string', format: 'date-time' },
          },
        },
        RoleWrite: {
          type: 'object',
          required: ['name', 'code'],
          properties: {
            name: { type: 'string' },
            code: { type: 'string' },
            permissionIds: objectIdArray,
            status: { type: 'string', enum: ['active', 'inactive'] },
          },
        },
        RoleUpdate: {
          type: 'object',
          properties: {
            name: { type: 'string' },
            code: { type: 'string' },
            permissionIds: objectIdArray,
            status: { type: 'string', enum: ['active', 'inactive'] },
          },
        },
        Permission: {
          type: 'object',
          properties: {
            _id: objectId,
            module: { type: 'string' },
            action: { type: 'string', enum: ['create', 'read', 'update', 'delete', 'approve', 'post', 'all'] },
            code: { type: 'string' },
            description: { type: 'string' },
            status: { type: 'string', enum: ['active', 'inactive'] },
            createdAt: { type: 'string', format: 'date-time' },
            updatedAt: { type: 'string', format: 'date-time' },
          },
        },
      },
    },
  }
}
