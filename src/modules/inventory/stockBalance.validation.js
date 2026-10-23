import Joi from 'joi'
import { objectId } from '../../common/validation/common.js'
import { REORDER_STATES } from './inventory.constants.js'

export const stockBalanceListQuery = Joi.object({
  page: Joi.number().integer().min(1).default(1),
  limit: Joi.number().integer().min(1).max(100).default(20),
  sort: Joi.string().trim().max(40),
  search: Joi.string().trim().allow('').max(100),
  warehouseId: objectId,
  branchId: objectId,
  productId: objectId,
  state: Joi.string().valid(...REORDER_STATES),
})
