import { ApiError } from '../../common/utils/ApiError.js'
import { assertFound } from '../../common/utils/assert.js'
import { pagination } from '../../common/utils/pagination.js'
import { listQuery } from '../../common/utils/listQuery.js'
import { pick } from '../../common/utils/pick.js'
import { rethrowDuplicate } from '../../common/utils/duplicateKey.js'
import { clearAuthUsersForRole } from '../auth/auth.cache.js'
import { Permission } from '../permission/permission.model.js'
import { Role } from './role.model.js'

const SORT_FIELDS = ['name', 'code', 'status', 'createdAt']
const ROLE_FIELDS = 'name code status permissionIds createdAt updatedAt'
const LIST_POPULATE = { path: 'permissionIds', select: 'code module action' }
const DETAIL_POPULATE = { path: 'permissionIds', select: 'code module action description status' }

async function assertPermissions(ids) {
  const unique = [...new Set((ids || []).map(String))]
  if (!unique.length) return
  const count = await Permission.countDocuments({ _id: { $in: unique } })
  if (count !== unique.length) {
    throw new ApiError(400, 'Unknown permission', [
      { field: 'permissionIds', message: 'One or more permissions do not exist' },
    ])
  }
}

async function loadRole(id, populate) {
  const role = await Role.findById(id).select(ROLE_FIELDS).populate(populate).lean()
  return assertFound(role, 'Role not found')
}

export async function list(query) {
  const page = pagination(query, SORT_FIELDS)
  const filter = listQuery(query, { searchFields: ['name', 'code'] })
  const [items, total] = await Promise.all([
    Role.find(filter)
      .select(ROLE_FIELDS)
      .populate(LIST_POPULATE)
      .sort(page.sort)
      .skip(page.skip)
      .limit(page.limit)
      .lean(),
    Role.countDocuments(filter),
  ])
  return { items, meta: page.meta(total) }
}

export async function getById(id) {
  return loadRole(id, DETAIL_POPULATE)
}

export async function create(body) {
  await assertPermissions(body.permissionIds)
  try {
    const role = await Role.create({
      name: body.name,
      code: body.code,
      permissionIds: body.permissionIds || [],
      status: body.status || 'active',
    })
    return loadRole(role._id, DETAIL_POPULATE)
  } catch (error) {
    rethrowDuplicate(error, 'code', 'Role code already exists')
  }
}

export async function update(id, body) {
  const role = assertFound(await Role.findById(id), 'Role not found')
  if (body.permissionIds) await assertPermissions(body.permissionIds)
  role.set(pick(body, ['name', 'code', 'permissionIds', 'status']))
  try {
    await role.save()
  } catch (error) {
    rethrowDuplicate(error, 'code', 'Role code already exists')
  }
  await clearAuthUsersForRole(role._id)
  return loadRole(role._id, DETAIL_POPULATE)
}
