import { ApiError } from './ApiError.js'

export function assertFound(doc, message = 'Record not found') {
  if (!doc) throw new ApiError(404, message)
  return doc
}

export function assertActive(doc, message = 'Record is inactive') {
  if (!doc) throw new ApiError(404, 'Record not found')
  if (doc.status && doc.status !== 'active') throw new ApiError(409, message)
  return doc
}
