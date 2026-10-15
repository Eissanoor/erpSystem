import { ApiError } from './ApiError.js'

export function rethrowDuplicate(error, field, message = `${field} already exists`) {
  if (error?.code === 11000 || error?.cause?.code === 11000) {
    throw new ApiError(409, message, [{ field, message: 'Already in use' }])
  }
  throw error
}
