import Joi from 'joi'
import {
  moneyString,
  objectId,
  positiveDecimalString,
} from '../../common/validation/common.js'
import { PURCHASE_STATUS, RECEIVING_STATES, RETURN_STATUS } from './purchase.constants.js'

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
  discountAmount: moneyString,
  taxRate: moneyString,
})

const receiveLine = Joi.object({
  itemId: objectId.required(),
  quantity: positiveDecimalString.required(),
})

const returnLine = Joi.object({
  purchaseItemId: objectId.allow(null, ''),
  productId: objectId.required(),
  inventoryItemId: objectId.allow(null, ''),
  batchNumber: Joi.string().trim().allow('').max(64),
  quantity: positiveDecimalString.required(),
  unitPrice: moneyString,
  discountAmount: moneyString,
  taxRate: moneyString,
})

export const purchaseListQuery = Joi.object({
  ...pageLimit,
  branchId: objectId,
  warehouseId: objectId,
  supplierId: objectId,
  status: Joi.string().valid(...PURCHASE_STATUS),
  receivingState: Joi.string().valid(...RECEIVING_STATES),
  from: Joi.date().iso(),
  to: Joi.date().iso(),
  month: Joi.string().pattern(/^\d{4}-\d{2}$/),
})

export const workspaceQuery = Joi.object({
  branchId: objectId,
  month: Joi.string().pattern(/^\d{4}-\d{2}$/),
  asOf: Joi.date().iso(),
})

const purchaseFields = {
  currencyId: objectId,
  exchangeRate: moneyString,
  purchaseDate: Joi.date().iso(),
  dueDate: Joi.date().iso(),
  supplierInvoiceNo: Joi.string().trim().allow('').max(64),
  receivedById: objectId.allow(null, ''),
  receivedByName: Joi.string().trim().allow('').max(120),
  discountMethod: Joi.string().valid('document', 'line'),
  taxRate: moneyString,
  discount: moneyString,
  paidAmount: moneyString,
  advancePaymentId: objectId.allow(null, ''),
  receivingNote: Joi.string().trim().allow('').max(2000),
  notes: Joi.string().trim().allow('').max(2000),
}

export const createPurchaseBody = Joi.object({
  branchId: objectId.required(),
  warehouseId: objectId.required(),
  supplierId: objectId.required(),
  ...purchaseFields,
  lines: Joi.array().items(line).min(1).required(),
})

export const updatePurchaseBody = Joi.object({
  warehouseId: objectId,
  supplierId: objectId,
  ...purchaseFields,
  dueDate: Joi.date().iso().allow(null),
  lines: Joi.array().items(line).min(1),
}).min(1)

export const receivePurchaseBody = Joi.object({
  lines: Joi.array().items(receiveLine).min(1).required(),
  qualityCheck: Joi.boolean().default(false),
})

export const returnListQuery = Joi.object({
  ...pageLimit,
  branchId: objectId,
  supplierId: objectId,
  purchaseId: objectId,
  status: Joi.string().valid(...RETURN_STATUS),
})

export const createReturnBody = Joi.object({
  branchId: objectId.required(),
  warehouseId: objectId.required(),
  supplierId: objectId.required(),
  purchaseId: objectId.allow(null, ''),
  currencyId: objectId,
  returnDate: Joi.date().iso(),
  reason: Joi.string().trim().allow('').max(200),
  supplierAuthorization: Joi.string().trim().allow('').max(64),
  supplierNote: Joi.string().trim().allow('').max(2000),
  taxRate: moneyString,
  notes: Joi.string().trim().allow('').max(2000),
  lines: Joi.array().items(returnLine).min(1).required(),
})

export const updateReturnBody = Joi.object({
  returnDate: Joi.date().iso(),
  reason: Joi.string().trim().allow('').max(200),
  supplierAuthorization: Joi.string().trim().allow('').max(64),
  supplierNote: Joi.string().trim().allow('').max(2000),
  taxRate: moneyString,
  notes: Joi.string().trim().allow('').max(2000),
  lines: Joi.array().items(returnLine).min(1),
}).min(1)
