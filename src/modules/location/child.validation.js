import Joi from 'joi'
import { MASTER_STATUS } from '../../common/constants/status.js'
import { listQuery, locationCode, objectId } from '../../common/validation/common.js'

const name = Joi.string().trim().min(1).max(120)
const location = Joi.string().trim().allow('').max(120)
const address = Joi.string().trim().allow('').max(500)

export const childListQuery = listQuery(MASTER_STATUS).keys({
  branchId: objectId,
})

export const createChildBody = Joi.object({
  branchId: objectId.required(),
  name: name.required(),
  code: locationCode.required(),
  location,
  address,
  managerId: Joi.valid(null),
  status: Joi.string()
    .valid(...MASTER_STATUS)
    .default('active'),
})

export const updateChildBody = Joi.object({
  branchId: objectId,
  name,
  code: locationCode,
  location,
  address,
  managerId: Joi.valid(null),
  status: Joi.string().valid(...MASTER_STATUS),
}).min(1)
