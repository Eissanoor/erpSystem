import { cache } from '../../common/utils/cache.js'
import { User } from '../user/user.model.js'
import { Role } from '../role/role.model.js'

const TTL_SECONDS = 10 * 60

export function authCacheKey(userId) {
  return `auth:user:${userId}`
}

function copyAuthUser(value) {
  return {
    ...value,
    roleIds: [...value.roleIds],
    branchIds: [...value.branchIds],
    warehouseIds: [...value.warehouseIds],
    permissionCodes: [...value.permissionCodes],
  }
}

async function loadAuthUser(userId) {
  const user = await User.findById(userId)
    .select('name email phone status employeeId roleIds branchIds warehouseIds lastLoginAt')
    .lean()
  if (!user) return null

  const roles = await Role.find({
    _id: { $in: user.roleIds || [] },
    status: 'active',
  })
    .select('permissionIds')
    .populate({ path: 'permissionIds', select: 'code status' })
    .lean()

  const permissionCodes = new Set()
  for (const role of roles) {
    for (const permission of role.permissionIds || []) {
      if (permission?.status === 'active' && permission.code) {
        permissionCodes.add(permission.code)
      }
    }
  }

  return {
    _id: String(user._id),
    name: user.name,
    email: user.email,
    phone: user.phone || '',
    status: user.status,
    employeeId: user.employeeId ? String(user.employeeId) : null,
    roleIds: (user.roleIds || []).map(String),
    branchIds: (user.branchIds || []).map(String),
    warehouseIds: (user.warehouseIds || []).map(String),
    permissionCodes: [...permissionCodes],
    lastLoginAt: user.lastLoginAt ? new Date(user.lastLoginAt).toISOString() : null,
  }
}

export async function getAuthUser(userId) {
  const value = await cache.getOrSet(authCacheKey(userId), TTL_SECONDS, () => loadAuthUser(userId))
  if (!value) return null
  return copyAuthUser(value)
}

export function clearAuthUser(userId) {
  cache.del(authCacheKey(userId))
}

export async function clearAuthUsersForRole(roleId) {
  const users = await User.find({ roleIds: roleId }).select('_id').lean()
  for (const user of users) {
    clearAuthUser(user._id)
  }
}
