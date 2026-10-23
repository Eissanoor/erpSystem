import Joi from 'joi'
import { listQuery, moneyString, objectId, positiveDecimalString } from '../../common/validation/common.js'
import { TRANSFER_STATUS } from './warehouseTransfer.model.js'

const line = Joi.object({
  productId: objectId.required(),
  inventoryItemId: objectId.allow(null, ''),
  batchNumber: Joi.string().trim().allow('').max(64),
  quantity: positiveDecimalString.required(),
  unitCost: moneyString,
})

export const transferListQuery = listQuery(TRANSFER_STATUS).keys({
  warehouseId: objectId,
  branchId: objectId,
})

export const createTransferBody = Joi.object({
  sourceWarehouseId: objectId.required(),
  destinationWarehouseId: objectId.required(),
  reason: Joi.string().trim().allow('').max(500),
  vehicle: Joi.string().trim().allow('').max(80),
  expectedDate: Joi.date().iso().allow(null, ''),
  notes: Joi.string().trim().allow('').max(2000),
  lines: Joi.array().items(line).min(1).required(),
})

export const updateTransferBody = Joi.object({
  reason: Joi.string().trim().allow('').max(500),
  vehicle: Joi.string().trim().allow('').max(80),
  expectedDate: Joi.date().iso().allow(null, ''),
  notes: Joi.string().trim().allow('').max(2000),
  lines: Joi.array().items(line).min(1),
}).min(1)
