import mongoose from 'mongoose'

function isId(value) {
  return typeof value === 'string' || value instanceof mongoose.Types.ObjectId
}

export function scopeToBranches(filter, user) {
  const next = { ...filter }
  if (user?.permissionCodes?.includes('all_branches')) return next

  const allowed = new Set((user?.branchIds || []).map(String))
  const current = next.branchId

  if (current && typeof current === 'object' && Array.isArray(current.$in)) {
    next.branchId = { $in: current.$in.map(String).filter((id) => allowed.has(id)) }
    return next
  }

  if (isId(current)) {
    next.branchId = allowed.has(String(current)) ? current : { $in: [] }
    return next
  }

  next.branchId = { $in: [...allowed] }
  return next
}
