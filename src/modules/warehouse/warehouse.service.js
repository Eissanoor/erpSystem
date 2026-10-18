import { ORG_CACHE } from '../../common/utils/masterListCache.js'
import { createChildLocationService } from '../location/childLocation.js'
import { Warehouse } from './warehouse.model.js'

const service = createChildLocationService({
  Model: Warehouse,
  cachePrefix: ORG_CACHE.warehouses,
  notFound: 'Warehouse not found',
  duplicateMessage: 'Warehouse code already exists',
})

export const list = service.list
export const getById = service.getById
export const create = service.create
export const update = service.update
export const setStatus = service.setStatus
