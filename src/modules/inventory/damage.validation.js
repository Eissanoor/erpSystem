import Joi from 'joi'
import { listQuery, moneyString, objectId, positiveDecimalString } from '../../common/validation/common.js'
import { DAMAGE_STATUS, DAMAGE_TYPES } from './productDamage.model.js'

const line = Joi.object({
  productId: objectId.required(),
  inventoryItemId: objectId.allow(null, ''),
  batchNumber: Joi.string().trim().allow('').max(64),
  expiryDate: Joi.date().iso().allow(null, ''),
  quantity: positiveDecimalString.required(),
  unitCost: moneyString,
})

export const damageListQuery = listQuery(DAMAGE_STATUS).keys({
  warehouseId: objectId,
  branchId: objectId,
  damageType: Joi.string().valid(...DAMAGE_TYPES),
})

export const createDamageBody = Joi.object({
  warehouseId: objectId.required(),
  damageType: Joi.string()
    .valid(...DAMAGE_TYPES)
    .required(),
  reason: Joi.string().trim().allow('').max(2000),
  notes: Joi.string().trim().allow('').max(2000),
  requestedApproverId: objectId.allow(null, ''),
  damageDate: Joi.date().iso(),
  postAccounting: Joi.boolean().default(true),
  lines: Joi.array().items(line).min(1).required(),
})

export const updateDamageBody = Joi.object({
  damageType: Joi.string().valid(...DAMAGE_TYPES),
  reason: Joi.string().trim().allow('').max(2000),
  notes: Joi.string().trim().allow('').max(2000),
  requestedApproverId: objectId.allow(null, ''),
  damageDate: Joi.date().iso(),
  postAccounting: Joi.boolean(),
  lines: Joi.array().items(line).min(1),
}).min(1)

export const rejectDamageBody = Joi.object({
  note: Joi.string().trim().allow('').max(1000),
})
