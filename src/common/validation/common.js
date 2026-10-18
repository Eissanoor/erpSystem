import Joi from 'joi'
import { MASTER_STATUS } from '../constants/status.js'

export const objectId = Joi.string().hex().length(24)

export const objectIdList = Joi.array().items(objectId).unique()

export const idParams = Joi.object({
  id: objectId.required(),
})

export const emailField = Joi.string().trim().lowercase().email({ tlds: { allow: false } })

export const passwordField = Joi.string().min(8).max(128)

export const codeField = Joi.string()
  .trim()
  .lowercase()
  .pattern(/^[a-z][a-z0-9_]{1,40}$/)

export const locationCode = Joi.string()
  .trim()
  .uppercase()
  .pattern(/^[A-Z0-9][A-Z0-9-]{0,31}$/)

export const currencyCode = Joi.string().trim().uppercase().length(3).pattern(/^[A-Z]{3}$/)

export const masterStatusBody = Joi.object({
  status: Joi.string()
    .valid(...MASTER_STATUS)
    .required(),
})

export function listQuery(statusValues) {
  return Joi.object({
    page: Joi.number().integer().min(1).default(1),
    limit: Joi.number().integer().min(1).max(100).default(20),
    sort: Joi.string().trim().max(40),
    search: Joi.string().trim().allow('').max(100),
    status: Joi.string().valid(...statusValues),
  })
}
