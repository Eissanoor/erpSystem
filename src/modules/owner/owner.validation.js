import Joi from 'joi'
import { Decimal } from 'decimal.js'
import { emailField, listQuery, locationCode, masterStatusBody, moneyString, objectId } from '../../common/validation/common.js'
import { MASTER_STATUS } from '../../common/constants/status.js'
import { OWNER_TYPES } from './owner.constants.js'

const name = Joi.string().trim().min(1).max(120)
const phone = Joi.string().trim().allow('').max(30)
const ownerType = Joi.string().valid(...OWNER_TYPES)
const identityNo = Joi.string().trim().allow('').max(80)
const address = Joi.string().trim().allow('').max(500)
const countryOfRegistration = Joi.string().trim().allow('').max(80)
const capitalAccount = Joi.string().trim().allow('').max(120)
const authorizedSignatory = Joi.string().trim().allow('').max(120)
const notes = Joi.string().trim().allow('').max(2000)
const capitalCommitment = moneyString.allow('')
const effectiveDate = Joi.date().iso()

const percent = Joi.string()
  .trim()
  .pattern(/^(?:0|[1-9]\d*)(?:\.\d+)?$/)
  .custom((value, helpers) => {
    const amount = new Decimal(value)
    if (amount.gt(100)) return helpers.message('must be from 0 to 100')
    return value
  })

const interest = Joi.object({
  entity: Joi.string().trim().min(1).max(160).required(),
  share: percent.required(),
  committed: moneyString.required(),
  paidIn: moneyString.required(),
  effectiveDate: Joi.date().iso().required(),
})

export const ownerListQuery = listQuery(MASTER_STATUS).keys({
  branchId: objectId,
})

export const ownerDetailQuery = Joi.object({
  page: Joi.number().integer().min(1),
  limit: Joi.number().integer().min(1).max(100),
})

const formFields = {
  identityNo,
  phone,
  address,
  countryOfRegistration,
  capitalCommitment,
  capitalAccount,
  authorizedSignatory,
  notes,
  interests: Joi.array().items(interest),
}

export const createOwnerBody = Joi.object({
  name: name.required(),
  code: locationCode.required(),
  ownerType: ownerType.required(),
  email: emailField.required(),
  ownershipPercentage: percent.required(),
  effectiveDate: effectiveDate.required(),
  branchId: objectId.required(),
  status: Joi.string()
    .valid(...MASTER_STATUS)
    .default('active'),
  ...formFields,
})

export const updateOwnerBody = Joi.object({
  name,
  code: locationCode,
  ownerType,
  email: emailField,
  ownershipPercentage: percent,
  effectiveDate,
  branchId: objectId,
  status: Joi.string().valid(...MASTER_STATUS),
  ...formFields,
}).min(1)

export { masterStatusBody as ownerStatusBody }
