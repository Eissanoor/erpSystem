import Joi from 'joi'
import { Decimal } from 'decimal.js'
import { listQuery, locationCode, moneyString, objectId } from '../../common/validation/common.js'
import { AGREEMENT_TYPES, PARTNERSHIP_STATUS } from './partnership.constants.js'

const name = Joi.string().trim().min(1).max(160)
const agreementType = Joi.string().valid(...AGREEMENT_TYPES)
const effectiveDate = Joi.date().iso()
const reviewDate = Joi.alternatives().try(Joi.valid(null, ''), Joi.date().iso())
const capitalCommitment = moneyString.allow('')
const settlementFrequency = Joi.string().trim().allow('').max(80)
const text = Joi.string().trim().min(1).max(160)
const longText = Joi.string().trim().min(1).max(500)
const optionalText = Joi.string().trim().allow('').max(160)
const notes = Joi.string().trim().allow('').max(2000)
const status = Joi.string().valid(...PARTNERSHIP_STATUS)

const percent = Joi.string()
  .trim()
  .pattern(/^(?:0|[1-9]\d*)(?:\.\d+)?$/)
  .custom((value, helpers) => {
    if (new Decimal(value).gt(100)) return helpers.message('must be from 0 to 100')
    return value
  })

const partner = Joi.object({
  ownerId: objectId.required(),
  contribution: moneyString.required(),
  ownership: percent.required(),
  profitShare: percent.required(),
  lossShare: percent.required(),
})

export const partnershipListQuery = listQuery(PARTNERSHIP_STATUS).keys({
  branchId: objectId,
})

export const partnershipDetailQuery = Joi.object({
  page: Joi.number().integer().min(1),
  limit: Joi.number().integer().min(1).max(100),
})

const formFields = {
  reviewDate,
  capitalCommitment,
  settlementFrequency,
  approvalAuthority: optionalText,
  notes,
  partners: Joi.array().items(partner).min(1),
}

export const createPartnershipBody = Joi.object({
  name: name.required(),
  code: locationCode.required(),
  agreementType: agreementType.required(),
  branchId: objectId.required(),
  effectiveDate: effectiveDate.required(),
  managingPartner: text.required(),
  partnerRoster: longText.required(),
  profitAllocation: text.required(),
  lossAllocation: text.required(),
  status: status.default('active'),
  partners: Joi.array().items(partner).min(1).required(),
  reviewDate,
  capitalCommitment,
  settlementFrequency,
  approvalAuthority: optionalText,
  notes,
})

export const updatePartnershipBody = Joi.object({
  name,
  code: locationCode,
  agreementType,
  branchId: objectId,
  effectiveDate,
  managingPartner: text,
  partnerRoster: longText,
  profitAllocation: text,
  lossAllocation: text,
  status,
  ...formFields,
}).min(1)

export const partnershipStatusBody = Joi.object({
  status: status.required(),
})
