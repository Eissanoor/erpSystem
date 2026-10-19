import { ORG_CACHE } from '../../common/utils/masterListCache.js'
import { createChildLocationService } from '../location/childLocation.js'
import { warehouseRegisterSummary } from '../location/register.js'
import { WAREHOUSE_TYPE_LABELS, ZONE_USE_LABELS } from './warehouse.constants.js'
import { Warehouse } from './warehouse.model.js'

const DETAIL_FIELDS =
  'branchId name code warehouseType location address phone floorArea storageCapacity managerId stockAccount defaultZone binTracking negativeStock status zones document notes createdAt updatedAt'
const WRITE_FIELDS = [
  'branchId',
  'name',
  'code',
  'warehouseType',
  'location',
  'address',
  'phone',
  'floorArea',
  'storageCapacity',
  'stockAccount',
  'defaultZone',
  'binTracking',
  'negativeStock',
  'managerId',
  'status',
  'notes',
]

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

async function link(body, _branchId, current = {}) {
  return documentOf(body, current)
}

function pageZones(zones, query = {}) {
  const total = zones.length
  if (!query?.page && !query?.limit) {
    return { items: zones, meta: { page: 1, limit: total, total } }
  }
  const page = Math.max(1, Number(query.page) || 1)
  const limit = Math.min(100, Math.max(1, Number(query.limit) || 20))
  const start = (page - 1) * limit
  return { items: zones.slice(start, start + limit), meta: { page, limit, total } }
}

function presentZone(zone) {
  return {
    _id: zone._id,
    code: zone.code,
    name: zone.name,
    use: zone.use,
    useLabel: ZONE_USE_LABELS[zone.use] || '',
    capacity: zone.capacity,
    unit: zone.unit,
    status: zone.status,
  }
}

async function decorate(doc, user, _branchId, query) {
  const page = pageZones((doc.zones || []).map(presentZone), query)
  return {
    warehouseTypeLabel: WAREHOUSE_TYPE_LABELS[doc.warehouseType] || '',
    summary: await warehouseRegisterSummary(user),
    zones: page.items,
    zonesMeta: page.meta,
  }
}

const service = createChildLocationService({
  Model: Warehouse,
  cachePrefix: ORG_CACHE.warehouses,
  notFound: 'Warehouse not found',
  duplicateMessage: 'Warehouse code already exists',
  summarize: warehouseRegisterSummary,
  detailFields: DETAIL_FIELDS,
  writeFields: WRITE_FIELDS,
  link,
  decorate,
})

export const list = service.list
export const getById = service.getById
export const create = service.create
export const update = service.update
export const setStatus = service.setStatus
