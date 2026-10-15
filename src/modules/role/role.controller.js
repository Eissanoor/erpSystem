import { asyncHandler } from '../../common/utils/asyncHandler.js'
import { sendSuccess } from '../../common/utils/ApiResponse.js'
import * as roleService from './role.service.js'

export const list = asyncHandler(async (req, res) => {
  const result = await roleService.list(req.query)
  sendSuccess(res, { message: 'Roles fetched', data: result.items, meta: result.meta })
})

export const getById = asyncHandler(async (req, res) => {
  const data = await roleService.getById(req.params.id)
  sendSuccess(res, { message: 'Role fetched', data })
})

export const create = asyncHandler(async (req, res) => {
  const data = await roleService.create(req.body)
  sendSuccess(res, { statusCode: 201, message: 'Role created', data })
})

export const update = asyncHandler(async (req, res) => {
  const data = await roleService.update(req.params.id, req.body)
  sendSuccess(res, { message: 'Role updated', data })
})
