import { asyncHandler } from '../../common/utils/asyncHandler.js'
import { sendSuccess } from '../../common/utils/ApiResponse.js'
import * as damageService from './damage.service.js'

export const list = asyncHandler(async (req, res) => {
  const result = await damageService.list(req.query, req.user)
  sendSuccess(res, { message: 'Damage reports fetched', data: result.items, meta: result.meta })
})

export const getById = asyncHandler(async (req, res) => {
  const data = await damageService.getById(req.params.id, req.user)
  sendSuccess(res, { message: 'Damage report fetched', data })
})

export const create = asyncHandler(async (req, res) => {
  const data = await damageService.create(req.body, req.user)
  sendSuccess(res, { statusCode: 201, message: 'Damage report created', data })
})

export const update = asyncHandler(async (req, res) => {
  const data = await damageService.update(req.params.id, req.body, req.user)
  sendSuccess(res, { message: 'Damage report updated', data })
})

export const submit = asyncHandler(async (req, res) => {
  const data = await damageService.submit(req.params.id, req.user)
  sendSuccess(res, { message: 'Damage report submitted', data })
})

export const approve = asyncHandler(async (req, res) => {
  const data = await damageService.approve(req.params.id, req.user)
  sendSuccess(res, { message: 'Damage report approved', data })
})

export const reject = asyncHandler(async (req, res) => {
  const data = await damageService.reject(req.params.id, req.body, req.user)
  sendSuccess(res, { message: 'Damage report rejected', data })
})

export const cancel = asyncHandler(async (req, res) => {
  const data = await damageService.cancel(req.params.id, req.user)
  sendSuccess(res, { message: 'Damage report cancelled', data })
})
