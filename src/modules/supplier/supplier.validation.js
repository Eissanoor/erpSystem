import Joi from 'joi'
import { MASTER_STATUS } from '../../common/constants/status.js'
import { emailField, listQuery, locationCode, objectId } from '../../common/validation/common.js'
import { PAYMENT_TERMS } from './supplier.constants.js'

const name = Joi.string().trim().min(1).max(160)
const phone = Joi.string().trim().allow('').max(40)
const address = Joi.string().trim().allow('').max(500)
const payableAccount = Joi.string().trim().min(1).max(120)
const notes = Joi.string().trim().allow('').max(2000)
const paymentTerms = Joi.string().valid(...PAYMENT_TERMS)
const status = Joi.string().valid(...MASTER_STATUS)

export const supplierListQuery = listQuery(MASTER_STATUS).keys({
  paymentTerms,
  currencyId: objectId,
  branchId: objectId,
  asOf: Joi.date().iso(),
})

export const supplierDetailQuery = Joi.object({
  branchId: objectId,
  currencyId: objectId,
  asOf: Joi.date().iso(),
})

export const createSupplierBody = Joi.object({
  code: locationCode.required(),
  name: name.required(),
  phone,
  email: emailField.allow(''),
  address,
  currencyId: objectId.required(),
  paymentTerms: paymentTerms.required(),
  payableAccount: payableAccount.required(),
  status: status.default('active'),
  notes,
})

export const updateSupplierBody = Joi.object({
  code: locationCode,
  name,
  phone,
  email: emailField.allow(''),
  address,
  currencyId: objectId,
  paymentTerms,
  payableAccount,
  status,
  notes,
}).min(1)
