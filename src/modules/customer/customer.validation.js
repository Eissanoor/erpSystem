import Joi from 'joi'
import { MASTER_STATUS } from '../../common/constants/status.js'
import { emailField, listQuery, locationCode, moneyString, objectId } from '../../common/validation/common.js'
import { PAYMENT_TERMS } from './customer.constants.js'

const name = Joi.string().trim().min(1).max(160)
const contactName = Joi.string().trim().allow('').max(120)
const phone = Joi.string().trim().allow('').max(40)
const address = Joi.string().trim().allow('').max(500)
const receivableAccount = Joi.string().trim().min(1).max(120)
const notes = Joi.string().trim().allow('').max(2000)
const paymentTerms = Joi.string().valid(...PAYMENT_TERMS)
const status = Joi.string().valid(...MASTER_STATUS)
const creditLimit = moneyString.max(40)

export const customerListQuery = listQuery(MASTER_STATUS).keys({
  paymentTerms,
  currencyId: objectId,
  branchId: objectId,
  asOf: Joi.date().iso(),
})

export const customerDetailQuery = Joi.object({
  branchId: objectId,
  currencyId: objectId,
  asOf: Joi.date().iso(),
})

export const createCustomerBody = Joi.object({
  code: locationCode.required(),
  name: name.required(),
  contactName,
  phone,
  email: emailField.allow(''),
  address,
  currencyId: objectId.required(),
  creditLimit: creditLimit.default('0'),
  paymentTerms: paymentTerms.required(),
  receivableAccount: receivableAccount.required(),
  status: status.default('active'),
  notes,
})

export const updateCustomerBody = Joi.object({
  code: locationCode,
  name,
  contactName,
  phone,
  email: emailField.allow(''),
  address,
  currencyId: objectId,
  creditLimit,
  paymentTerms,
  receivableAccount,
  status,
  notes,
}).min(1)
