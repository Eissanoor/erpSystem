import { ApiError } from '../utils/ApiError.js'

export function validate(schema) {
  return function validateRequest(req, res, next) {
    const errors = []

    for (const source of ['body', 'query', 'params']) {
      if (!schema[source]) continue
      const { error, value } = schema[source].validate(req[source], {
        abortEarly: false,
        stripUnknown: true,
        convert: true,
      })
      if (error) {
        errors.push(
          ...error.details.map((detail) => ({
            field: detail.path.join('.') || source,
            message: detail.message.replace(/"/g, ''),
          })),
        )
      } else {
        req[source] = value
      }
    }

    if (errors.length) {
      return next(new ApiError(400, 'Validation failed', errors))
    }

    return next()
  }
}
