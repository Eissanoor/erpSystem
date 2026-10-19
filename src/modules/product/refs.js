import { ApiError } from '../../common/utils/ApiError.js'

export async function assertActiveDoc(Model, id, field, label) {
  const doc = await Model.findById(id).select('_id status quantityUnitId').lean()
  if (!doc) {
    throw new ApiError(400, `Unknown ${label}`, [{ field, message: `${label} does not exist` }])
  }
  if (doc.status !== 'active') {
    throw new ApiError(400, `Inactive ${label}`, [{ field, message: `${label} must be active` }])
  }
  return doc
}

export function decimalText(value) {
  if (value == null) return value
  return value.toString()
}
