import { ApiError } from '../../common/utils/ApiError.js'
import { assertFound } from '../../common/utils/assert.js'
import { pagination } from '../../common/utils/pagination.js'
import { listQuery } from '../../common/utils/listQuery.js'
import { pick } from '../../common/utils/pick.js'
import { scopeToBranches } from '../../common/utils/scopeToBranches.js'
import { isDropdownList } from '../../common/utils/masterListCache.js'
import { assertAssignableBranch } from '../branch/branch.service.js'
import { Branch } from '../branch/branch.model.js'
import { Shop } from '../shop/shop.model.js'
import { Warehouse } from '../warehouse/warehouse.model.js'
import { User } from '../user/user.model.js'
import {
  ACCESS_ROLE_LABELS,
  ASSIGNMENT_SCOPE_LABELS,
  EMPLOYMENT_STATUS_LABELS,
  EMPLOYMENT_TYPE_LABELS,
  ERP_ROLE_LABELS,
  LOCATION_TYPE_LABELS,
  LOGIN_STATUS_LABELS,
} from './employee.constants.js'
import { Employee } from './employee.model.js'

const LIST_FIELDS = 'name code department branchId status createdAt updatedAt'
const DETAIL_FIELDS =
  'name code email phone department jobTitle employmentType joiningDate reportsTo shopAssignment warehouseAccess erpRole createLogin branchId userId status document notes assignments createdAt updatedAt'
const WRITE_FIELDS = [
  'name',
  'code',
  'email',
  'phone',
  'department',
  'jobTitle',
  'employmentType',
  'joiningDate',
  'reportsTo',
  'shopAssignment',
  'warehouseAccess',
  'erpRole',
  'createLogin',
  'branchId',
  'status',
  'notes',
]
const SORT_FIELDS = ['name', 'code', 'department', 'status', 'createdAt']
const POPULATE = { path: 'branchId', select: 'name code' }

function documentFrom(body, current = {}) {
  return {
    type: body.document?.type ?? current.document?.type ?? '',
    reference: body.document?.reference ?? current.document?.reference ?? '',
    fileName: body.document?.fileName ?? current.document?.fileName ?? '',
  }
}

function blank(value) {
  return value === undefined || value === null || value === '' ? null : value
}

function inScope(user, branchId) {
  if (user?.permissionCodes?.includes('all_branches')) return true
  return (user?.branchIds || []).map(String).includes(String(branchId))
}

function pageRows(rows, query = {}) {
  const total = rows.length
  if (!query?.page && !query?.limit) {
    return { items: rows, meta: { page: 1, limit: total, total } }
  }
  const page = Math.max(1, Number(query.page) || 1)
  const limit = Math.min(100, Math.max(1, Number(query.limit) || 20))
  const start = (page - 1) * limit
  return { items: rows.slice(start, start + limit), meta: { page, limit, total } }
}

function throwDuplicate(error) {
  if (error?.code === 11000 || error?.cause?.code === 11000) {
    const keyPattern = error.keyPattern || error?.cause?.keyPattern || {}
    const field = keyPattern.userId ? 'userId' : keyPattern.email ? 'email' : 'code'
    const message =
      field === 'userId'
        ? 'User is already linked to an employee'
        : field === 'email'
          ? 'Work email already exists'
          : 'Employee code already exists'
    throw new ApiError(409, message, [{ field, message: 'Already in use' }])
  }
  throw error
}

async function employeeRegisterSummary(user) {
  const filter = scopeToBranches({}, user)
  const [total, active, departments, employees] = await Promise.all([
    Employee.countDocuments(filter),
    Employee.countDocuments({ ...filter, status: 'active' }),
    Employee.distinct('department', { ...filter, department: { $nin: [null, ''] } }),
    Employee.find(filter).select('userId').lean(),
  ])
  const userIds = employees.map((row) => row.userId).filter(Boolean)
  const activeLogins = userIds.length
    ? await User.countDocuments({ _id: { $in: userIds }, status: 'active' })
    : 0
  return {
    employees: { total, active },
    departments: departments.length,
    pendingAccess: total - activeLogins,
  }
}

async function assertUser(userId) {
  if (!userId) return null
  const user = await User.findById(userId).select('_id status').lean()
  if (!user) {
    throw new ApiError(400, 'Unknown user', [{ field: 'userId', message: 'User does not exist' }])
  }
  return user._id
}

async function assertAssignments(assignments, user) {
  if (!assignments?.length) return []
  const ids = (type) => assignments.filter((row) => row.locationType === type).map((row) => row.locationId)
  const [branches, shops, warehouses] = await Promise.all([
    Branch.find({ _id: { $in: ids('branch') } }).select('status').lean(),
    Shop.find({ _id: { $in: ids('shop') } }).select('branchId').lean(),
    Warehouse.find({ _id: { $in: ids('warehouse') } }).select('branchId').lean(),
  ])
  const byId = {
    branch: new Map(branches.map((row) => [String(row._id), row])),
    shop: new Map(shops.map((row) => [String(row._id), row])),
    warehouse: new Map(warehouses.map((row) => [String(row._id), row])),
  }
  return assignments.map((row, index) => {
    const location = byId[row.locationType].get(String(row.locationId))
    if (!location) {
      throw new ApiError(400, 'Unknown location', [
        { field: `assignments.${index}.locationId`, message: 'Location does not exist' },
      ])
    }
    const branchId = row.locationType === 'branch' ? location._id : location.branchId
    if (!inScope(user, branchId)) {
      throw new ApiError(400, 'Location is outside your access', [
        { field: `assignments.${index}.locationId`, message: 'Location is outside your branches' },
      ])
    }
    return {
      locationType: row.locationType,
      locationId: row.locationId,
      scope: row.scope,
      accessRole: row.accessRole,
      status: row.status || 'active',
    }
  })
}

async function presentAssignments(assignments, query) {
  const rows = assignments || []
  const ids = (type) => rows.filter((row) => row.locationType === type).map((row) => row.locationId)
  const [branches, shops, warehouses] = await Promise.all([
    Branch.find({ _id: { $in: ids('branch') } }).select('name').lean(),
    Shop.find({ _id: { $in: ids('shop') } }).select('name').lean(),
    Warehouse.find({ _id: { $in: ids('warehouse') } }).select('name').lean(),
  ])
  const names = new Map(
    [...branches, ...shops, ...warehouses].map((row) => [String(row._id), row.name]),
  )
  const presented = rows.map((row) => ({
    _id: row._id,
    locationType: row.locationType,
    locationTypeLabel: LOCATION_TYPE_LABELS[row.locationType] || '',
    locationId: row.locationId,
    locationName: names.get(String(row.locationId)) || '',
    scope: row.scope,
    scopeLabel: ASSIGNMENT_SCOPE_LABELS[row.scope] || '',
    accessRole: row.accessRole,
    accessRoleLabel: ACCESS_ROLE_LABELS[row.accessRole] || '',
    status: row.status,
  }))
  return pageRows(presented, query)
}

async function loginStatusOf(userId) {
  if (!userId) return 'pending'
  const user = await User.findById(userId).select('status').lean()
  if (!user) return 'pending'
  return user.status
}

async function presentDetail(doc, user, query) {
  const { assignments, ...rest } = doc
  const [summary, assignmentPage, loginStatus] = await Promise.all([
    employeeRegisterSummary(user),
    presentAssignments(assignments, query),
    loginStatusOf(doc.userId),
  ])
  return {
    ...rest,
    statusLabel: EMPLOYMENT_STATUS_LABELS[doc.status] || '',
    employmentTypeLabel: EMPLOYMENT_TYPE_LABELS[doc.employmentType] || '',
    erpRoleLabel: ERP_ROLE_LABELS[doc.erpRole] || '',
    loginStatus,
    loginStatusLabel: LOGIN_STATUS_LABELS[loginStatus] || '',
    summary,
    assignments: assignmentPage.items,
    assignmentsMeta: assignmentPage.meta,
  }
}

async function load(id) {
  const doc = await Employee.findById(id).select(DETAIL_FIELDS).populate(POPULATE).lean()
  return assertFound(doc, 'Employee not found')
}

export async function list(query, user) {
  const page = pagination(query, SORT_FIELDS)
  const filter = listQuery(query, { searchFields: ['name', 'code'] })
  if (query.branchId) filter.branchId = query.branchId
  const scoped = scopeToBranches(filter, user)
  const [items, total] = await Promise.all([
    Employee.find(scoped)
      .select(LIST_FIELDS)
      .populate(POPULATE)
      .sort(page.sort)
      .skip(page.skip)
      .limit(page.limit)
      .lean(),
    Employee.countDocuments(scoped),
  ])
  const result = {
    items: items.map((row) => ({ ...row, statusLabel: EMPLOYMENT_STATUS_LABELS[row.status] || '' })),
    meta: page.meta(total),
  }
  if (isDropdownList(query)) return result
  return { items: result.items, meta: { ...result.meta, summary: await employeeRegisterSummary(user) } }
}

export async function getById(id, user, query) {
  const doc = await Employee.findOne(scopeToBranches({ _id: id }, user))
    .select(DETAIL_FIELDS)
    .populate(POPULATE)
    .lean()
  return presentDetail(assertFound(doc, 'Employee not found'), user, query)
}

export async function create(body, user) {
  await assertAssignableBranch(body.branchId, user)
  const userId = await assertUser(blank(body.userId))
  const assignments = await assertAssignments(body.assignments, user)
  try {
    const doc = await Employee.create({
      ...pick(body, WRITE_FIELDS),
      name: body.name,
      code: body.code,
      department: body.department || '',
      branchId: body.branchId,
      ...(userId ? { userId } : {}),
      joiningDate: body.joiningDate || null,
      status: body.status || 'active',
      document: documentFrom(body),
      assignments,
    })
    return presentDetail(await load(doc._id), user)
  } catch (error) {
    throwDuplicate(error)
  }
}

export async function update(id, body, user) {
  const doc = await Employee.findOne(scopeToBranches({ _id: id }, user))
  assertFound(doc, 'Employee not found')
  if (body.branchId && String(body.branchId) !== String(doc.branchId)) {
    await assertAssignableBranch(body.branchId, user)
  }
  if (Object.prototype.hasOwnProperty.call(body, 'userId')) {
    const linked = await assertUser(blank(body.userId))
    doc.userId = linked || undefined
  }
  if (Object.prototype.hasOwnProperty.call(body, 'assignments')) {
    doc.assignments = await assertAssignments(body.assignments, user)
  }
  if (body.document) doc.document = documentFrom(body, doc)
  doc.set(pick(body, WRITE_FIELDS))
  try {
    await doc.save()
  } catch (error) {
    throwDuplicate(error)
  }
  return presentDetail(await load(doc._id), user)
}

export async function setStatus(id, status, user) {
  const doc = await Employee.findOne(scopeToBranches({ _id: id }, user))
  assertFound(doc, 'Employee not found')
  doc.status = status
  await doc.save()
  return presentDetail(await load(doc._id), user)
}
