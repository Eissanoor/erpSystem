import { randomUUID } from 'node:crypto'
import express from 'express'
import helmet from 'helmet'
import cors from 'cors'
import compression from 'compression'
import morgan from 'morgan'
import { apiReference } from '@scalar/express-api-reference'
import { env } from './config/env.js'
import { dbStatus } from './config/db.js'
import { asyncHandler } from './common/utils/asyncHandler.js'
import { sendSuccess } from './common/utils/ApiResponse.js'
import { notFound } from './common/middleware/notFound.js'
import { errorHandler } from './common/middleware/errorHandler.js'
import { buildOpenApiSpec } from './docs/openapi.js'
import { authRouter } from './modules/auth/auth.routes.js'
import { userRouter } from './modules/user/user.routes.js'
import { roleRouter } from './modules/role/role.routes.js'
import { permissionRouter } from './modules/permission/permission.routes.js'

export function createApp() {
  const app = express()
  const openApiSpec = buildOpenApiSpec()

  app.use(
    helmet({
      contentSecurityPolicy: false,
    }),
  )
  app.use(cors())
  app.use(compression({ threshold: 1024 }))
  app.use(express.json({ limit: '1mb' }))
  app.use((req, res, next) => {
    const requestId = req.get('x-request-id') || randomUUID()
    req.id = requestId
    res.setHeader('x-request-id', requestId)
    next()
  })

  if (!env.isProduction) {
    app.use(morgan('dev'))
  }

  app.get(
    '/health',
    asyncHandler(async (req, res) => {
      const db = dbStatus()
      sendSuccess(res, {
        message: db === 'up' ? 'Healthy' : 'Database unavailable',
        data: { db },
        statusCode: db === 'up' ? 200 : 503,
      })
    }),
  )

  app.get('/openapi.json', (req, res) => {
    res.json(openApiSpec)
  })

  app.use(
    '/docs',
    apiReference({
      content: openApiSpec,
    }),
  )

  app.use('/api/v1/auth', authRouter)
  app.use('/api/v1/users', userRouter)
  app.use('/api/v1/roles', roleRouter)
  app.use('/api/v1/permissions', permissionRouter)

  app.use(notFound)
  app.use(errorHandler)

  return app
}
