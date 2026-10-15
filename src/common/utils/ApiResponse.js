export function sendSuccess(res, { statusCode = 200, message = 'OK', data = null, meta } = {}) {
  const body = { success: true, message, data }
  if (meta) body.meta = meta
  return res.status(statusCode).json(body)
}
