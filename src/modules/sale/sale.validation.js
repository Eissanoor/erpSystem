import Joi from 'joi'
import {
  moneyString,
  objectId,
  positiveDecimalString,
} from '../../common/validation/common.js'
import { SALE_WORKSPACE_STATUS, SHIPPING_METHODS } from './sale.constants.js'

const pageLimit = {
  page: Joi.number().integer().min(1).default(1),
  limit: Joi.number().integer().min(1).max(100).default(20),
  sort: Joi.string().trim().max(40),
  search: Joi.string().trim().allow('').max(100),
}

const line = Joi.object({
  productId: objectId.required(),
  packingUnitId: objectId.allow(null, ''),
  quantity: positiveDecimalString.required(),
  unitPrice: moneyString.required(),
  discountPercent: moneyString,
  discountAmount: moneyString,
  taxRate: moneyString,
})

export const saleListQuery = Joi.object({
  ...pageLimit,
  branchId: objectId,
  warehouseId: objectId,
  customerId: objectId,
  status: Joi.string().valid(...SALE_WORKSPACE_STATUS),
  from: Joi.date().iso(),
  to: Joi.date().iso(),
  month: Joi.string().pattern(/^\d{4}-\d{2}$/),
})

export const workspaceQuery = Joi.object({
  branchId: objectId,
  month: Joi.string().pattern(/^\d{4}-\d{2}$/),
  asOf: Joi.date().iso(),
})

const saleFields = {
  currencyId: objectId,
  exchangeRate: moneyString,
  saleDate: Joi.date().iso(),
  dueDate: Joi.date().iso(),
  soldById: objectId.allow(null, ''),
  soldByName: Joi.string().trim().allow('').max(120),
  discountMethod: Joi.string().valid('document', 'line'),
  taxRate: moneyString,
  discount: moneyString,
  shippingAmount: moneyString,
  paidAmount: moneyString,
  receiptMethod: Joi.string().valid('cash', 'bank', ''),
  bankName: Joi.string().trim().allow('').max(120),
  customerReference: Joi.string().trim().allow('').max(64),
  notes: Joi.string().trim().allow('').max(2000),
  createShipmentAfterPost: Joi.boolean(),
  shippingMethod: Joi.string().valid(...SHIPPING_METHODS),
  shippingEta: Joi.date().iso().allow(null),
}

export const createSaleBody = Joi.object({
  branchId: objectId.required(),
  warehouseId: objectId.required(),
  customerId: objectId.required(),
  ...saleFields,
  lines: Joi.array().items(line).min(1).required(),
}).custom((value, helpers) => {
  if (value.receiptMethod === 'bank' && !String(value.bankName || '').trim()) {
    return helpers.message('Bank name is required for bank receipts')
  }
  if (value.createShipmentAfterPost && (!value.shippingMethod || value.shippingMethod === 'none')) {
    return helpers.message('Shipping method is required when createShipmentAfterPost is true')
  }
  return value
})

export const updateSaleBody = Joi.object({
  warehouseId: objectId,
  customerId: objectId,
  ...saleFields,
  dueDate: Joi.date().iso().allow(null),
  lines: Joi.array().items(line).min(1),
})
  .min(1)
  .custom((value, helpers) => {
    if (value.receiptMethod === 'bank' && !String(value.bankName || '').trim()) {
      return helpers.message('Bank name is required for bank receipts')
    }
    return value
  })
