import Joi from 'joi'
import { MASTER_STATUS } from '../../common/constants/status.js'
import { emailField, listQuery, locationCode, masterStatusBody, objectId, shortCodeField } from '../../common/validation/common.js'
import { BRANCH_TYPES } from './branch.constants.js'

const name = Joi.string().trim().min(1).max(120)
const phone = Joi.string().trim().allow('').max(30)
const location = Joi.string().trim().allow('').max(120)
const address = Joi.string().trim().min(1).max(500)
const optionalAddress = Joi.string().trim().allow('').max(500)
const branchType = Joi.string().valid(...BRANCH_TYPES)
const openingDate = Joi.alternatives().try(Joi.valid(null, ''), Joi.date().iso())
const email = emailField.allow('', null)
const optionalId = objectId.allow(null, '')
const costCentre = Joi.string().trim().allow('').max(60)
const documentPrefix = shortCodeField.allow('')
const notes = Joi.string().trim().allow('').max(2000)
const document = Joi.object({
  type: Joi.string().trim().allow('').max(80),
  reference: Joi.string().trim().allow('').max(120),
})

export const branchListQuery = listQuery(MASTER_STATUS)

export const createBranchBody = Joi.object({
  name: name.required(),
  code: locationCode.required(),
  branchType: branchType.required(),
  openingDate,
  phone,
  email,
  location,
  address: address.required(),
  managerId: Joi.valid(null),
  defaultWarehouseId: optionalId,
  defaultShopId: optionalId,
  status: Joi.string()
    .valid(...MASTER_STATUS)
    .default('active'),
  costCentre,
  documentPrefix,
  document,
  notes,
})

export const updateBranchBody = Joi.object({
  name,
  code: locationCode,
  branchType,
  openingDate,
  phone,
  email,
  location,
  address: optionalAddress,
  managerId: Joi.valid(null),
  defaultWarehouseId: optionalId,
  defaultShopId: optionalId,
  status: Joi.string().valid(...MASTER_STATUS),
  costCentre,
  documentPrefix,
  document,
  notes,
}).min(1)

export { masterStatusBody as branchStatusBody }
