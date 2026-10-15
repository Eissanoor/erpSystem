import Joi from 'joi'
import { MASTER_STATUS } from '../../common/constants/status.js'
import { codeField, listQuery, objectIdList } from '../../common/validation/common.js'

export const roleListQuery = listQuery(MASTER_STATUS)

export const createRoleBody = Joi.object({
  name: Joi.string().trim().min(1).max(80).required(),
  code: codeField.required(),
  permissionIds: objectIdList.default([]),
  status: Joi.string().valid(...MASTER_STATUS).default('active'),
})

export const updateRoleBody = Joi.object({
  name: Joi.string().trim().min(1).max(80),
  code: codeField,
  permissionIds: objectIdList,
  status: Joi.string().valid(...MASTER_STATUS),
}).min(1)
