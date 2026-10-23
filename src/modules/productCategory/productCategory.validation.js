import Joi from 'joi'
import { MASTER_STATUS } from '../../common/constants/status.js'
import { listQuery, locationCode, objectId } from '../../common/validation/common.js'

const name = Joi.string().trim().min(1).max(120)
const description = Joi.string().trim().allow('').max(2000)

export const categoryListQuery = listQuery(MASTER_STATUS).keys({
  parentId: Joi.alternatives().try(Joi.string().valid('none'), objectId),
})

export const categoryDetailQuery = Joi.object({
  page: Joi.number().integer().min(1),
  limit: Joi.number().integer().min(1).max(100),
})

export const createCategoryBody = Joi.object({
  name: name.required(),
  code: locationCode.required(),
  parentId: objectId.allow(null),
  description,
  status: Joi.string()
    .valid(...MASTER_STATUS)
    .default('active'),
})

export const updateCategoryBody = Joi.object({
  name,
  code: locationCode,
  parentId: objectId.allow(null),
  description,
  status: Joi.string().valid(...MASTER_STATUS),
}).min(1)
