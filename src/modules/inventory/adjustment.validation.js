import Joi from 'joi'
import { listQuery, moneyString, objectId } from '../../common/validation/common.js'
import { ADJUSTMENT_STATUS } from './stockAdjustment.model.js'

const line = Joi.object({
  productId: objectId.required(),
  inventoryItemId: objectId.allow(null, ''),
  actualQuantity: moneyString.required(),
  unitCost: moneyString,
})

export const adjustmentListQuery = listQuery(ADJUSTMENT_STATUS).keys({
  warehouseId: objectId,
  branchId: objectId,
})

export const createAdjustmentBody = Joi.object({
  warehouseId: objectId.required(),
  reason: Joi.string().trim().allow('').max(200),
  countReference: Joi.string().trim().allow('').max(64),
  countNote: Joi.string().trim().allow('').max(2000),
  notes: Joi.string().trim().allow('').max(2000),
  requestedApproverId: objectId.allow(null, ''),
  adjustmentDate: Joi.date().iso(),
  lines: Joi.array().items(line).min(1).required(),
})

export const updateAdjustmentBody = Joi.object({
  reason: Joi.string().trim().allow('').max(200),
  countReference: Joi.string().trim().allow('').max(64),
  countNote: Joi.string().trim().allow('').max(2000),
  notes: Joi.string().trim().allow('').max(2000),
  requestedApproverId: objectId.allow(null, ''),
  adjustmentDate: Joi.date().iso(),
  lines: Joi.array().items(line).min(1),
}).min(1)

export const rejectAdjustmentBody = Joi.object({
  note: Joi.string().trim().allow('').max(1000),
})
