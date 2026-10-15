import { bearer, error, success } from '../shape.js'

const authUser = { $ref: '#/components/schemas/AuthUser' }
const session = { $ref: '#/components/schemas/AuthSession' }

export const authPaths = {
  '/api/v1/auth/login': {
    post: {
      tags: ['Auth'],
      operationId: 'login',
      summary: 'Log in with email and password',
      requestBody: {
        required: true,
        content: {
          'application/json': {
            schema: { $ref: '#/components/schemas/LoginRequest' },
          },
        },
      },
      responses: {
        200: success('Access and refresh tokens', session),
        401: error('Wrong email or password'),
        403: error('Account is locked or inactive'),
      },
    },
  },
  '/api/v1/auth/refresh': {
    post: {
      tags: ['Auth'],
      operationId: 'refreshToken',
      summary: 'Issue a new access token',
      description: 'Send the refresh token in the JSON body. This route does not use the bearer access token.',
      requestBody: {
        required: true,
        content: {
          'application/json': {
            schema: { $ref: '#/components/schemas/RefreshRequest' },
          },
        },
      },
      responses: {
        200: success('New tokens', session),
        401: error('Refresh token is missing, invalid, or expired'),
      },
    },
  },
  '/api/v1/auth/logout': {
    post: {
      tags: ['Auth'],
      operationId: 'logout',
      summary: 'Log out',
      description:
        'Logout does not revoke the access token. The token stays valid until it expires (JWT_ACCESS_EXPIRES, default 15 minutes). A denylist for instant revoke is stage 12.',
      security: bearer,
      responses: {
        200: success('Logged out', {
          type: 'object',
          properties: { loggedOut: { type: 'boolean', example: true } },
        }),
        401: error('Authentication required'),
      },
    },
  },
  '/api/v1/auth/me': {
    get: {
      tags: ['Auth'],
      operationId: 'currentUser',
      summary: 'Current user and permission codes',
      security: bearer,
      responses: {
        200: success('Cached auth profile', authUser),
        401: error('Authentication required'),
        403: error('Account is not active'),
      },
    },
  },
}
