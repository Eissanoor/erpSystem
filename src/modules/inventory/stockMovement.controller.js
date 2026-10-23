import { asyncHandler } from '../../common/utils/asyncHandler.js'
import { sendSuccess } from '../../common/utils/ApiResponse.js'
import * as stockMovementService from './stockMovement.service.js'

export const list = asyncHandler(async (req, res) => {
  const result = await stockMovementService.list(req.query, req.user)
  sendSuccess(res, { message: 'Stock movements fetched', data: result.items, meta: result.meta })
})

export const getById = asyncHandler(async (req, res) => {
  const data = await stockMovementService.getById(req.params.id, req.user)
  sendSuccess(res, { message: 'Stock movement fetched', data })
})
