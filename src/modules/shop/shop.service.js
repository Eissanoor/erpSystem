import { ORG_CACHE } from '../../common/utils/masterListCache.js'
import { createChildLocationService } from '../location/childLocation.js'
import { Shop } from './shop.model.js'

const service = createChildLocationService({
  Model: Shop,
  cachePrefix: ORG_CACHE.shops,
  notFound: 'Shop not found',
  duplicateMessage: 'Shop code already exists',
})

export const list = service.list
export const getById = service.getById
export const create = service.create
export const update = service.update
export const setStatus = service.setStatus
