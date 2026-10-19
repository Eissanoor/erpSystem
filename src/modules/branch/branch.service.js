import { ApiError } from '../../common/utils/ApiError.js'
import { assertFound } from '../../common/utils/assert.js'
import { pagination } from '../../common/utils/pagination.js'
import { listQuery } from '../../common/utils/listQuery.js'
import { pick } from '../../common/utils/pick.js'
import { rethrowDuplicate } from '../../common/utils/duplicateKey.js'
import { ORG_CACHE, clearOrgCache, isDropdownList, readDropdown } from '../../common/utils/masterListCache.js'
import { attachBranchUsage, childLocations, organizationSummary } from '../location/register.js'
import { Branch } from './branch.model.js'

const SORT_FIELDS = ['name', 'code', 'status', 'createdAt']
const LIST_FIELDS = 'name code phone location managerId status createdAt updatedAt'
const DETAIL_FIELDS = 'name code phone location address managerId status createdAt updatedAt'
const WRITE_FIELDS = ['name', 'code', 'phone', 'location', 'address', 'managerId', 'status']

function hasAllBranches(user) {
  return Boolean(user?.permissionCodes?.includes('all_branches'))
}

function branchAllowed(user, branchId) {
  if (hasAllBranches(user)) return true
  return (user?.branchIds || []).map(String).includes(String(branchId))
}

function scopeBranchDocs(filter, user) {
  const next = { ...filter }
  if (hasAllBranches(user)) return next
  // A branch row has no branchId. Scope matches _id so a limited user only sees their branches.
  const allowed = [...new Set((user?.branchIds || []).map(String))]
  next._id = { $in: allowed }
  return next
}

function clearLocationCache() {
  clearOrgCache(ORG_CACHE.branches, ORG_CACHE.warehouses, ORG_CACHE.shops)
}

function assertCanSee(id, user) {
  if (!branchAllowed(user, id)) throw new ApiError(404, 'Branch not found')
}

async function loadBranch(id) {
  const branch = await Branch.findById(id).select(DETAIL_FIELDS).lean()
  return assertFound(branch, 'Branch not found')
}

async function presentBranch(branch, user) {
  const locations = await childLocations(branch._id, user)
  return {
    ...branch,
    warehouseCount: locations.filter((row) => row.type === 'warehouse').length,
    shopCount: locations.filter((row) => row.type === 'shop').length,
    locations,
  }
}

export async function assertAssignableBranch(branchId, user) {
  const branch = await Branch.findById(branchId).select('_id status').lean()
  if (!branch) {
    throw new ApiError(400, 'Unknown branch', [
      { field: 'branchId', message: 'Branch does not exist' },
    ])
  }
  if (branch.status !== 'active') {
    throw new ApiError(400, 'Inactive branch', [
      { field: 'branchId', message: 'Branch must be active' },
    ])
  }
  if (!branchAllowed(user, branch._id)) {
    throw new ApiError(403, 'Branch is outside your access', [
      { field: 'branchId', message: 'You cannot use this branch' },
    ])
  }
  return branch
}

export async function list(query, user) {
  const page = pagination(query, SORT_FIELDS)
  const filter = scopeBranchDocs(listQuery(query, { searchFields: ['name', 'code', 'location'] }), user)

  const result = await readDropdown(ORG_CACHE.branches, user, query, async () => {
    const [items, total] = await Promise.all([
      Branch.find(filter).select(LIST_FIELDS).sort(page.sort).skip(page.skip).limit(page.limit).lean(),
      Branch.countDocuments(filter),
    ])
    return { items, meta: page.meta(total) }
  })

  // Dropdown selects stay slim. The register (search, status, or another page size) carries counts.
  if (isDropdownList(query)) return result
  return {
    items: await attachBranchUsage(result.items),
    meta: { ...result.meta, summary: await organizationSummary(user) },
  }
}

export async function getById(id, user) {
  assertCanSee(id, user)
  return presentBranch(await loadBranch(id), user)
}

export async function create(body) {
  try {
    const branch = await Branch.create({
      name: body.name,
      code: body.code,
      phone: body.phone || '',
      location: body.location || '',
      address: body.address || '',
      managerId: null,
      status: body.status || 'active',
    })
    clearLocationCache()
    return presentBranch(await loadBranch(branch._id))
  } catch (error) {
    rethrowDuplicate(error, 'code', 'Branch code already exists')
  }
}

export async function update(id, body, user) {
  assertCanSee(id, user)
  const branch = assertFound(await Branch.findById(id), 'Branch not found')
  branch.set(pick(body, WRITE_FIELDS))
  try {
    await branch.save()
  } catch (error) {
    rethrowDuplicate(error, 'code', 'Branch code already exists')
  }
  clearLocationCache()
  return presentBranch(await loadBranch(branch._id), user)
}

export async function setStatus(id, status, user) {
  assertCanSee(id, user)
  const branch = assertFound(await Branch.findById(id), 'Branch not found')
  branch.status = status
  await branch.save()
  clearLocationCache()
  return presentBranch(await loadBranch(branch._id), user)
}
