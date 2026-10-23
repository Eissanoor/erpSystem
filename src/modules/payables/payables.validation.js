import Joi from 'joi'
import {
  moneyString,
  objectId,
  positiveDecimalString,
} from '../../common/validation/common.js'
import { INVOICE_STATUS, PAYMENT_METHODS, PAYMENT_STATUS } from './payables.constants.js'

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
  supplierId: objectId,
  currencyId: objectId,
  asOf: Joi.date().iso(),
})

export const invoiceListQuery = Joi.object({
  ...pageLimit,
  status: Joi.string().valid(...INVOICE_STATUS),
  branchId: objectId,
  supplierId: objectId,
  currencyId: objectId,
  asOf: Joi.date().iso(),
  overdueOnly: Joi.boolean().truthy('true').falsy('false'),
})

export const paymentListQuery = Joi.object({
  ...pageLimit,
  status: Joi.string().valid(...PAYMENT_STATUS),
  branchId: objectId,
  supplierId: objectId,
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
  supplierId: objectId.required(),
  currencyId: objectId,
  purchaseNumber: Joi.string().trim().uppercase().max(32),
  invoiceDate: Joi.date().iso(),
  dueDate: Joi.date().iso(),
  amount: positiveDecimalString.required(),
  notes: Joi.string().trim().allow('').max(2000),
})

export const createPaymentBody = Joi.object({
  branchId: objectId.required(),
  supplierId: objectId.required(),
  currencyId: objectId,
  paymentDate: Joi.date().iso(),
  amount: positiveDecimalString.required(),
  paymentMethod: Joi.string()
    .valid(...PAYMENT_METHODS)
    .required(),
  bankName: Joi.string().trim().allow('').max(120),
  notes: Joi.string().trim().allow('').max(2000),
  allocations: Joi.array().items(allocation).default([]),
}).custom((value, helpers) => {
  if (value.paymentMethod === 'bank' && !String(value.bankName || '').trim()) {
    return helpers.message('Bank name is required for bank payments')
  }
  return value
})
