import Joi from 'joi'
import { objectId, positiveDecimalString } from '../../common/validation/common.js'
import { INVOICE_STATUS, RECEIPT_METHODS, RECEIPT_STATUS } from './receivables.constants.js'

const pageLimit = {
  page: Joi.number().integer().min(1).default(1),
  limit: Joi.number().integer().min(1).max(100).default(20),
  sort: Joi.string().trim().max(40),
  search: Joi.string().trim().allow('').max(100),
}

const allocation = Joi.object({
  invoiceId: objectId.required(),
  amount: positiveDecimalString.required(),
})

export const agingQuery = Joi.object({
  branchId: objectId,
  customerId: objectId,
  currencyId: objectId,
  asOf: Joi.date().iso(),
})

export const invoiceListQuery = Joi.object({
  ...pageLimit,
  status: Joi.string().valid(...INVOICE_STATUS),
  branchId: objectId,
  customerId: objectId,
  currencyId: objectId,
  asOf: Joi.date().iso(),
  overdueOnly: Joi.boolean().truthy('true').falsy('false'),
})

export const receiptListQuery = Joi.object({
  ...pageLimit,
  status: Joi.string().valid(...RECEIPT_STATUS),
  branchId: objectId,
  customerId: objectId,
  currencyId: objectId,
})

export const ledgerQuery = Joi.object({
  ...pageLimit,
  branchId: objectId,
  currencyId: objectId,
  from: Joi.date().iso(),
  to: Joi.date().iso(),
})

export const overviewQuery = Joi.object({
  branchId: objectId,
  currencyId: objectId,
  asOf: Joi.date().iso(),
})

export const createInvoiceBody = Joi.object({
  branchId: objectId.required(),
  customerId: objectId.required(),
  currencyId: objectId,
  invoiceNumber: Joi.string().trim().uppercase().max(32),
  invoiceDate: Joi.date().iso(),
  dueDate: Joi.date().iso(),
  amount: positiveDecimalString.required(),
  notes: Joi.string().trim().allow('').max(2000),
})

export const createReceiptBody = Joi.object({
  branchId: objectId.required(),
  customerId: objectId.required(),
  currencyId: objectId,
  receiptDate: Joi.date().iso(),
  amount: positiveDecimalString.required(),
  receiptMethod: Joi.string()
    .valid(...RECEIPT_METHODS)
    .required(),
  bankName: Joi.string().trim().allow('').max(120),
  voucherNumber: Joi.string().trim().allow('').max(40),
  notes: Joi.string().trim().allow('').max(2000),
  allocations: Joi.array().items(allocation).default([]),
}).custom((value, helpers) => {
  if (value.receiptMethod === 'bank' && !String(value.bankName || '').trim()) {
    return helpers.message('Bank name is required for bank receipts')
  }
  return value
})
