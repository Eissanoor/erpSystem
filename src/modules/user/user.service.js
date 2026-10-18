import { ApiError } from '../../common/utils/ApiError.js'
import { assertFound } from '../../common/utils/assert.js'
import { pagination } from '../../common/utils/pagination.js'
import { listQuery } from '../../common/utils/listQuery.js'
import { pick } from '../../common/utils/pick.js'
import { rethrowDuplicate } from '../../common/utils/duplicateKey.js'
import { clearAuthUser } from '../auth/auth.cache.js'
import { hashPassword } from '../auth/password.js'
import { Role } from '../role/role.model.js'
import { User } from './user.model.js'

const SORT_FIELDS = ['name', 'email', 'status', 'createdAt']
const USER_FIELDS = 'name email phone status roleIds branchIds warehouseIds employeeId lastLoginAt createdAt updatedAt'
const LIST_POPULATE = { path: 'roleIds', select: 'name code' }
const DETAIL_POPULATE = { path: 'roleIds', select: 'name code status' }

async function assertActiveRoles(ids) {
  const unique = [...new Set((ids || []).map(String))]
  if (!unique.length) return
  const roles = await Role.find({ _id: { $in: unique } }).select('_id status').lean()
  if (roles.length !== unique.length) {
    throw new ApiError(400, 'Unknown role', [
      { field: 'roleIds', message: 'One or more roles do not exist' },
    ])
  }
  if (roles.some((role) => role.status !== 'active')) {
    throw new ApiError(400, 'Inactive role', [
      { field: 'roleIds', message: 'Roles must be active' },
    ])
  }
}

async function loadUser(id) {
  const user = await User.findById(id).select(USER_FIELDS).populate(DETAIL_POPULATE).lean()
  return assertFound(user, 'User not found')
}

export async function list(query) {
  const page = pagination(query, SORT_FIELDS)
  const filter = listQuery(query, { searchFields: ['name', 'email'] })
  const [items, total] = await Promise.all([
    User.find(filter)
      .select(USER_FIELDS)
      .populate(LIST_POPULATE)
      .sort(page.sort)
      .skip(page.skip)
      .limit(page.limit)
      .lean(),
    User.countDocuments(filter),
  ])
  return { items, meta: page.meta(total) }
}

export async function getById(id) {
  return loadUser(id)
}

export async function create(body) {
  await assertActiveRoles(body.roleIds)
  try {
    const user = await User.create({
      name: body.name,
      email: body.email,
      phone: body.phone || '',
      employeeId: body.employeeId ?? null,
      passwordHash: await hashPassword(body.password),
      roleIds: body.roleIds || [],
      branchIds: body.branchIds || [],
      warehouseIds: body.warehouseIds || [],
      status: body.status || 'active',
    })
    return loadUser(user._id)
  } catch (error) {
    rethrowDuplicate(error, 'email', 'Email already exists')
  }
}

export async function update(id, body) {
  const user = assertFound(await User.findById(id).select('+passwordHash'), 'User not found')
  if (body.roleIds) await assertActiveRoles(body.roleIds)
  // Branch and warehouse ids are stored unchecked until those models exist (stage 2).
  const changes = pick(body, [
    'name',
    'email',
    'phone',
    'status',
    'employeeId',
    'roleIds',
    'branchIds',
    'warehouseIds',
  ])
  if (body.password) changes.passwordHash = await hashPassword(body.password)
  user.set(changes)
  try {
    await user.save()
  } catch (error) {
    rethrowDuplicate(error, 'email', 'Email already exists')
  }
  clearAuthUser(user._id)
  return loadUser(user._id)
}
