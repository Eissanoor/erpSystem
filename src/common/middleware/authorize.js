import { ApiError } from '../utils/ApiError.js'

export function authorize(module, action) {
  const code = `${module}.${action}`
  return function checkPermission(req, res, next) {
    const codes = req.user?.permissionCodes || []
    if (!codes.includes(code)) {
      next(
        new ApiError(403, 'Permission denied', [
          { field: 'permission', message: `Missing ${code}` },
        ]),
      )
      return
    }
    next()
  }
}
