import { ApiError } from '../../common/utils/ApiError.js'
import { scopeToBranches } from '../../common/utils/scopeToBranches.js'
import { ORG_CACHE } from '../../common/utils/masterListCache.js'
import { createChildLocationService } from '../location/childLocation.js'
import { shopRegisterSummary } from '../location/register.js'
import { Warehouse } from '../warehouse/warehouse.model.js'
import { SHOP_TYPE_LABELS } from './shop.constants.js'
import { Shop } from './shop.model.js'

const DETAIL_FIELDS =
  'branchId warehouseId name code shopType location address phone email managerId priceList cashAccount openingHours status document notes createdAt updatedAt'
const WRITE_FIELDS = [
  'branchId',
  'name',
  'code',
  'shopType',
  'location',
  'address',
  'phone',
  'email',
  'priceList',
  'cashAccount',
  'openingHours',
  'managerId',
  'status',
  'notes',
]
const DETAIL_POPULATE = [
  { path: 'branchId', select: 'name code phone location address' },
  { path: 'warehouseId', select: 'name code status' },
]

function blank(value) {
  return value === undefined || value === null || value === '' ? null : value
}

async function link(body, branchId, current = {}) {
  const sent = Object.prototype.hasOwnProperty.call(body, 'warehouseId')
  const warehouseId = sent ? blank(body.warehouseId) : current.warehouseId || null
  if (!warehouseId) return { warehouseId: null, ...documentOf(body, current) }
  const warehouse = await Warehouse.findById(warehouseId).select('branchId status').lean()
  if (!warehouse || String(warehouse.branchId) !== String(branchId)) {
    throw new ApiError(400, 'Warehouse must belong to this branch', [
      { field: 'warehouseId', message: 'Only warehouses in this branch are available' },
    ])
  }
  if (warehouse.status !== 'active') {
    throw new ApiError(400, 'Warehouse must be active', [
      { field: 'warehouseId', message: 'Warehouse must be active' },
    ])
  }
  return { warehouseId, ...documentOf(body, current) }
}

function documentOf(body, current = {}) {
  if (!body.document && !current.document) return {}
  return {
    document: {
      type: body.document?.type ?? current.document?.type ?? '',
      reference: body.document?.reference ?? current.document?.reference ?? '',
      fileName: body.document?.fileName ?? current.document?.fileName ?? '',
    },
  }
}

async function decorate(doc, user, branchId) {
  const [warehouses, summary] = await Promise.all([
    Warehouse.find(scopeToBranches({ branchId }, user)).select('name code status').sort({ code: 1 }).lean(),
    shopRegisterSummary(user),
  ])
  return {
    shopTypeLabel: SHOP_TYPE_LABELS[doc.shopType] || '',
    summary,
    warehouses,
    employees: [],
    employeesMeta: { page: 1, limit: 0, total: 0 },
  }
}

const service = createChildLocationService({
  Model: Shop,
  cachePrefix: ORG_CACHE.shops,
  notFound: 'Shop not found',
  duplicateMessage: 'Shop code already exists',
  summarize: shopRegisterSummary,
  detailFields: DETAIL_FIELDS,
  detailPopulate: DETAIL_POPULATE,
  writeFields: WRITE_FIELDS,
  link,
  decorate,
})

export const list = service.list
export const getById = service.getById
export const create = service.create
export const update = service.update
export const setStatus = service.setStatus
