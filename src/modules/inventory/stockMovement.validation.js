import Joi from 'joi'
import { objectId } from '../../common/validation/common.js'
import { MOVEMENT_TYPES } from './stockMovement.model.js'

const day = Joi.date().iso()

export const stockMovementListQuery = Joi.object({
  page: Joi.number().integer().min(1).default(1),
  limit: Joi.number().integer().min(1).max(100).default(20),
  sort: Joi.string().trim().max(40),
  search: Joi.string().trim().allow('').max(100),
  warehouseId: objectId,
  branchId: objectId,
  productId: objectId,
  movementType: Joi.string().valid(...MOVEMENT_TYPES),
  date: day,
  from: day,
  to: day,
})
