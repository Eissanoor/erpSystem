import Joi from 'joi'
import { MASTER_STATUS } from '../../common/constants/status.js'
import { currencyCode, listQuery } from '../../common/validation/common.js'

const name = Joi.string().trim().min(1).max(80)
const symbol = Joi.string().trim().allow('').max(8)
const decimalPlaces = Joi.number().integer().min(0).max(6)

export const currencyListQuery = listQuery(MASTER_STATUS)

export const createCurrencyBody = Joi.object({
  name: name.required(),
  code: currencyCode.required(),
  symbol,
  decimalPlaces: decimalPlaces.default(2),
  isBaseCurrency: Joi.boolean().default(false),
  status: Joi.string()
    .valid(...MASTER_STATUS)
    .default('active'),
})

export const updateCurrencyBody = Joi.object({
  name,
  code: currencyCode,
  symbol,
  decimalPlaces,
  isBaseCurrency: Joi.boolean(),
  status: Joi.string().valid(...MASTER_STATUS),
}).min(1)
