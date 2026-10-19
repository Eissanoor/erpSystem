import Joi from 'joi'
import { MASTER_STATUS } from '../../common/constants/status.js'
import { listQuery, objectId, positiveDecimalString, shortCodeField } from '../../common/validation/common.js'

const name = Joi.string().trim().min(1).max(80)

export const packingUnitListQuery = listQuery(MASTER_STATUS).keys({
  quantityUnitId: objectId,
})

export const createPackingUnitBody = Joi.object({
  name: name.required(),
  shortCode: shortCodeField.required(),
  conversionQuantity: positiveDecimalString.required(),
  quantityUnitId: objectId.required(),
  status: Joi.string()
    .valid(...MASTER_STATUS)
    .default('active'),
})

export const updatePackingUnitBody = Joi.object({
  name,
  shortCode: shortCodeField,
  conversionQuantity: positiveDecimalString,
  quantityUnitId: objectId,
  status: Joi.string().valid(...MASTER_STATUS),
}).min(1)
