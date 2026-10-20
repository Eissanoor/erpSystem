import Joi from 'joi'
import { childListQuery, createChildBody, updateChildBody } from '../location/child.validation.js'
import { WAREHOUSE_TYPES } from './warehouse.constants.js'

const warehouseType = Joi.string().valid(...WAREHOUSE_TYPES)
const address = Joi.string().trim().min(1).max(500)
const phone = Joi.string().trim().allow('').max(30)
const floorArea = Joi.string().trim().allow('').max(80)
const storageCapacity = Joi.string().trim().allow('').max(80)
const stockAccount = Joi.string().trim().allow('').max(80)
const defaultZone = Joi.string().trim().allow('').max(80)
const binTracking = Joi.string().trim().allow('').max(80)
const negativeStock = Joi.string().trim().allow('').max(80)
const notes = Joi.string().trim().allow('').max(2000)

const formFields = {
  warehouseType,
  phone,
  floorArea,
  storageCapacity,
  stockAccount,
  defaultZone,
  binTracking,
  negativeStock,
  notes,
}

export const warehouseListQuery = childListQuery

export const warehouseDetailQuery = Joi.object({
  page: Joi.number().integer().min(1),
  limit: Joi.number().integer().min(1).max(100),
})

export const createWarehouseBody = createChildBody.keys({
  ...formFields,
  address: address.required(),
})

export const updateWarehouseBody = updateChildBody.keys(formFields)
