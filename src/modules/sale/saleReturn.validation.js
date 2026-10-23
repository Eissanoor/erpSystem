import Joi from 'joi'
import {
  moneyString,
  objectId,
  positiveDecimalString,
} from '../../common/validation/common.js'
import { RETURN_CONDITIONS, SALE_RETURN_STATUS } from './sale.constants.js'

const pageLimit = {
  page: Joi.number().integer().min(1).default(1),
  limit: Joi.number().integer().min(1).max(100).default(20),
  sort: Joi.string().trim().max(40),
  search: Joi.string().trim().allow('').max(100),
}

const returnLine = Joi.object({
  saleItemId: objectId.allow(null, ''),
  productId: objectId.required(),
  inventoryItemId: objectId.allow(null, ''),
  batchNumber: Joi.string().trim().allow('').max(64),
  quantity: positiveDecimalString.required(),
  unitPrice: moneyString,
  discountAmount: moneyString,
  taxRate: moneyString,
})

export const returnListQuery = Joi.object({
  ...pageLimit,
  branchId: objectId,
  customerId: objectId,
  saleId: objectId,
  warehouseId: objectId,
  status: Joi.string().valid(...SALE_RETURN_STATUS),
  from: Joi.date().iso(),
  to: Joi.date().iso(),
})

export const createReturnBody = Joi.object({
  branchId: objectId.required(),
  warehouseId: objectId.required(),
  customerId: objectId.required(),
  saleId: objectId,
  currencyId: objectId,
  returnDate: Joi.date().iso(),
  reason: Joi.string().trim().allow('').max(200),
  condition: Joi.string().valid(...RETURN_CONDITIONS),
  returnNote: Joi.string().trim().allow('').max(2000),
  notes: Joi.string().trim().allow('').max(2000),
  taxRate: moneyString,
  lines: Joi.array().items(returnLine).min(1).required(),
})

export const updateReturnBody = Joi.object({
  warehouseId: objectId,
  returnDate: Joi.date().iso(),
  reason: Joi.string().trim().allow('').max(200),
  condition: Joi.string().valid(...RETURN_CONDITIONS),
  returnNote: Joi.string().trim().allow('').max(2000),
  notes: Joi.string().trim().allow('').max(2000),
  taxRate: moneyString,
  lines: Joi.array().items(returnLine).min(1),
}).min(1)
