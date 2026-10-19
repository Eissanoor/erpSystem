import { asyncHandler } from '../../common/utils/asyncHandler.js'
import { sendSuccess } from '../../common/utils/ApiResponse.js'
import * as categoryService from './productCategory.service.js'

export const list = asyncHandler(async (req, res) => {
  const result = await categoryService.list(req.query)
  sendSuccess(res, { message: 'Categories fetched', data: result.items, meta: result.meta })
})

export const tree = asyncHandler(async (req, res) => {
  const data = await categoryService.tree()
  sendSuccess(res, { message: 'Category tree fetched', data })
})

export const getById = asyncHandler(async (req, res) => {
  const data = await categoryService.getById(req.params.id)
  sendSuccess(res, { message: 'Category fetched', data })
})

export const create = asyncHandler(async (req, res) => {
  const data = await categoryService.create(req.body)
  sendSuccess(res, { statusCode: 201, message: 'Category created', data })
})

export const update = asyncHandler(async (req, res) => {
  const data = await categoryService.update(req.params.id, req.body)
  sendSuccess(res, { message: 'Category updated', data })
})

export const setStatus = asyncHandler(async (req, res) => {
  const data = await categoryService.setStatus(req.params.id, req.body.status)
  sendSuccess(res, { message: 'Category updated', data })
})
