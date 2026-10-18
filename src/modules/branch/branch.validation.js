import Joi from 'joi'
import { MASTER_STATUS } from '../../common/constants/status.js'
import { listQuery, locationCode, masterStatusBody } from '../../common/validation/common.js'

const name = Joi.string().trim().min(1).max(120)
const phone = Joi.string().trim().allow('').max(30)
const address = Joi.string().trim().allow('').max(500)

export const branchListQuery = listQuery(MASTER_STATUS)

export const createBranchBody = Joi.object({
  name: name.required(),
  code: locationCode.required(),
  phone,
  address,
  managerId: Joi.valid(null),
  status: Joi.string()
    .valid(...MASTER_STATUS)
    .default('active'),
})

export const updateBranchBody = Joi.object({
  name,
  code: locationCode,
  phone,
  address,
  managerId: Joi.valid(null),
  status: Joi.string().valid(...MASTER_STATUS),
}).min(1)

export { masterStatusBody as branchStatusBody }
