import Joi from 'joi'
import { USER_STATUS } from '../../common/constants/status.js'
import { emailField, listQuery, objectId, objectIdList, passwordField } from '../../common/validation/common.js'

export const userListQuery = listQuery(USER_STATUS)

export const createUserBody = Joi.object({
  name: Joi.string().trim().min(1).max(120).required(),
  email: emailField.required(),
  password: passwordField.required(),
  phone: Joi.string().trim().allow('').max(30),
  employeeId: objectId.allow(null),
  roleIds: objectIdList.default([]),
  branchIds: objectIdList.default([]),
  warehouseIds: objectIdList.default([]),
  status: Joi.string().valid(...USER_STATUS).default('active'),
})

export const updateUserBody = Joi.object({
  name: Joi.string().trim().min(1).max(120),
  email: emailField,
  password: passwordField,
  phone: Joi.string().trim().allow('').max(30),
  employeeId: objectId.allow(null),
  status: Joi.string().valid(...USER_STATUS),
  roleIds: objectIdList,
  branchIds: objectIdList,
  warehouseIds: objectIdList,
}).min(1)
