import Joi from 'joi'
import { emailField } from '../../common/validation/common.js'

export const loginBody = Joi.object({
  email: emailField.required(),
  password: Joi.string().required(),
})

export const refreshBody = Joi.object({
  refreshToken: Joi.string().min(20).required(),
})
