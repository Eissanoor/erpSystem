import Joi from 'joi'
import { MASTER_STATUS } from '../../common/constants/status.js'
import { listQuery, moneyString, objectId, skuField } from '../../common/validation/common.js'

const name = Joi.string().trim().min(1).max(160)
const description = Joi.string().trim().allow('').max(4000)
const barcode = Joi.string().trim().allow('', null).max(64)

export const productListQuery = listQuery(MASTER_STATUS).keys({
  categoryId: objectId,
})

export const createProductBody = Joi.object({
  categoryId: objectId.required(),
  sku: skuField.required(),
  name: name.required(),
  barcode,
  description,
  quantityUnitId: objectId.required(),
  packingUnitId: objectId.allow(null),
  costPrice: moneyString.required(),
  salePrice: moneyString.required(),
  reorderLevel: moneyString.required(),
  trackBatch: Joi.boolean().default(false),
  trackExpiry: Joi.boolean().default(false),
  status: Joi.string()
    .valid(...MASTER_STATUS)
    .default('active'),
})

export const updateProductBody = Joi.object({
  categoryId: objectId,
  sku: skuField,
  name,
  barcode,
  description,
  quantityUnitId: objectId,
  packingUnitId: objectId.allow(null),
  costPrice: moneyString,
  salePrice: moneyString,
  reorderLevel: moneyString,
  trackBatch: Joi.boolean(),
  trackExpiry: Joi.boolean(),
  status: Joi.string().valid(...MASTER_STATUS),
}).min(1)
