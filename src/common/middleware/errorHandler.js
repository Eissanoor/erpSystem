import { env } from '../../config/env.js'
import { ApiError } from '../utils/ApiError.js'

export function errorHandler(err, req, res, next) {
  if (res.headersSent) {
    next(err)
    return
  }

  const statusCode = err instanceof ApiError ? err.statusCode : err.statusCode || 500
  const isServerError = statusCode >= 500

  if (isServerError) {
    console.error(err)
  }

  const message = isServerError && env.isProduction ? 'Internal server error' : err.message || 'Internal server error'

  res.status(statusCode).json({
    success: false,
    message,
    errors: err instanceof ApiError ? err.errors : [],
  })
}
