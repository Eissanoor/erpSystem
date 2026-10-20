import { asyncHandler } from '../../common/utils/asyncHandler.js'
import { sendSuccess } from '../../common/utils/ApiResponse.js'
import * as employeeService from './employee.service.js'

export const list = asyncHandler(async (req, res) => {
  const result = await employeeService.list(req.query, req.user)
  sendSuccess(res, { message: 'Employees fetched', data: result.items, meta: result.meta })
})

export const getById = asyncHandler(async (req, res) => {
  const data = await employeeService.getById(req.params.id, req.user, req.query)
  sendSuccess(res, { message: 'Employee fetched', data })
})

export const create = asyncHandler(async (req, res) => {
  const data = await employeeService.create(req.body, req.user)
  sendSuccess(res, { statusCode: 201, message: 'Employee created', data })
})

export const update = asyncHandler(async (req, res) => {
  const data = await employeeService.update(req.params.id, req.body, req.user)
  sendSuccess(res, { message: 'Employee updated', data })
})

export const setStatus = asyncHandler(async (req, res) => {
  const data = await employeeService.setStatus(req.params.id, req.body.status, req.user)
  sendSuccess(res, { message: 'Employee updated', data })
})
