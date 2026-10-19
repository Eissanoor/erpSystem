import { ApiError } from '../../common/utils/ApiError.js'
import { assertFound } from '../../common/utils/assert.js'
import { pagination } from '../../common/utils/pagination.js'
import { listQuery } from '../../common/utils/listQuery.js'
import { pick } from '../../common/utils/pick.js'
import { rethrowDuplicate } from '../../common/utils/duplicateKey.js'
import { ORG_CACHE, clearOrgCache, isDropdownList, readDropdown } from '../../common/utils/masterListCache.js'
import { attachBranchUsage, childLocations, organizationSummary } from '../location/register.js'
import { Shop } from '../shop/shop.model.js'
import { Warehouse } from '../warehouse/warehouse.model.js'
import { Branch } from './branch.model.js'

const SORT_FIELDS = ['name', 'code', 'status', 'createdAt']
const LIST_FIELDS = 'name code phone location managerId status createdAt updatedAt'
const DETAIL_FIELDS =
  'name code branchType openingDate phone email location address managerId defaultWarehouseId defaultShopId status costCentre documentPrefix document notes createdAt updatedAt'
const WRITE_FIELDS = [
  'name',
  'code',
  'branchType',
  'openingDate',
  'phone',
  'email',
  'location',
  'address',
  'managerId',
  'status',
  'costCentre',
  'documentPrefix',
  'notes',
]
const DETAIL_POPULATE = [
  { path: 'defaultWarehouseId', select: 'name code' },
  { path: 'defaultShopId', select: 'name code' },
]

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

function blank(value) {
  return value === undefined || value === null || value === '' ? null : value
}

function documentFrom(body, current = {}) {
  return {
    type: body.document?.type ?? current.type ?? '',
    reference: body.document?.reference ?? current.reference ?? '',
  }
}

async function assertOwnedChild(Model, id, branchId, field, noun) {
  if (!id) return
  const child = await Model.findById(id).select('branchId status').lean()
  if (!child || String(child.branchId) !== String(branchId)) {
    throw new ApiError(400, `${noun} must belong to this branch`, [
      { field, message: `${noun} is not under this branch` },
    ])
  }
  if (child.status !== 'active') {
    throw new ApiError(400, `${noun} must be active`, [
      { field, message: `${noun} must be active` },
    ])
  }
}

async function loadBranch(id) {
  const branch = await Branch.findById(id).select(DETAIL_FIELDS).populate(DETAIL_POPULATE).lean()
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
  let branch
  try {
    branch = await Branch.create({
      name: body.name,
      code: body.code,
      branchType: body.branchType,
      openingDate: blank(body.openingDate),
      phone: body.phone || '',
      email: body.email || '',
      location: body.location || '',
      address: body.address,
      managerId: null,
      status: body.status || 'active',
      costCentre: body.costCentre || '',
      documentPrefix: body.documentPrefix || '',
      document: documentFrom(body),
      notes: body.notes || '',
    })
    await assertOwnedChild(Warehouse, blank(body.defaultWarehouseId), branch._id, 'defaultWarehouseId', 'Warehouse')
    await assertOwnedChild(Shop, blank(body.defaultShopId), branch._id, 'defaultShopId', 'Shop')
    branch.defaultWarehouseId = blank(body.defaultWarehouseId)
    branch.defaultShopId = blank(body.defaultShopId)
    if (branch.defaultWarehouseId || branch.defaultShopId) await branch.save()
    clearLocationCache()
    return presentBranch(await loadBranch(branch._id))
  } catch (error) {
    if (branch?._id) await Branch.deleteOne({ _id: branch._id })
    rethrowDuplicate(error, 'code', 'Branch code already exists')
  }
}

export async function update(id, body, user) {
  assertCanSee(id, user)
  const branch = assertFound(await Branch.findById(id), 'Branch not found')
  const nextWarehouse = 'defaultWarehouseId' in body ? blank(body.defaultWarehouseId) : branch.defaultWarehouseId
  const nextShop = 'defaultShopId' in body ? blank(body.defaultShopId) : branch.defaultShopId
  await assertOwnedChild(Warehouse, nextWarehouse, branch._id, 'defaultWarehouseId', 'Warehouse')
  await assertOwnedChild(Shop, nextShop, branch._id, 'defaultShopId', 'Shop')
  const patch = pick(body, WRITE_FIELDS)
  if ('openingDate' in patch) patch.openingDate = blank(patch.openingDate)
  branch.set(patch)
  if (body.document) branch.document = documentFrom(body, branch.document)
  branch.defaultWarehouseId = nextWarehouse
  branch.defaultShopId = nextShop
  branch.managerId = null
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
