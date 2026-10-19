import Joi from 'joi'
import { MASTER_STATUS } from '../../common/constants/status.js'
import { listQuery, shortCodeField } from '../../common/validation/common.js'

const name = Joi.string().trim().min(1).max(80)

export const quantityUnitListQuery = listQuery(MASTER_STATUS)

export const createQuantityUnitBody = Joi.object({
  name: name.required(),
  shortCode: shortCodeField.required(),
  decimalAllowed: Joi.boolean().default(false),
  status: Joi.string()
    .valid(...MASTER_STATUS)
    .default('active'),
})

export const updateQuantityUnitBody = Joi.object({
  name,
  shortCode: shortCodeField,
  decimalAllowed: Joi.boolean(),
  status: Joi.string().valid(...MASTER_STATUS),
}).min(1)
