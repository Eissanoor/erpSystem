import Joi from 'joi'
import { emailField, objectId } from '../../common/validation/common.js'
import { childListQuery, createChildBody, updateChildBody } from '../location/child.validation.js'
import { SHOP_TYPES } from './shop.constants.js'

const shopType = Joi.string().valid(...SHOP_TYPES)
const address = Joi.string().trim().min(1).max(500)
const phone = Joi.string().trim().allow('').max(30)
const email = emailField.allow('', null)
const priceList = Joi.string().trim().allow('').max(80)
const cashAccount = Joi.string().trim().allow('').max(80)
const openingHours = Joi.string().trim().allow('').max(80)
const notes = Joi.string().trim().allow('').max(2000)
const warehouseId = objectId.allow(null, '')
const document = Joi.object({
  type: Joi.string().trim().allow('').max(80),
  reference: Joi.string().trim().allow('').max(120),
  fileName: Joi.string()
    .trim()
    .max(180)
    .allow('')
    .pattern(/\.(pdf|png|jpe?g)$/i),
})

const formFields = {
  shopType,
  phone,
  email,
  priceList,
  cashAccount,
  openingHours,
  warehouseId,
  document,
  notes,
}

export const shopListQuery = childListQuery

export const createShopBody = createChildBody.keys({
  ...formFields,
  shopType: shopType.required(),
  address: address.required(),
})

export const updateShopBody = updateChildBody.keys(formFields)
