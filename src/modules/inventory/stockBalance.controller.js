import { asyncHandler } from '../../common/utils/asyncHandler.js'
import { sendSuccess } from '../../common/utils/ApiResponse.js'
import * as stockBalanceService from './stockBalance.service.js'

export const list = asyncHandler(async (req, res) => {
  const result = await stockBalanceService.list(req.query, req.user)
  sendSuccess(res, { message: 'Stock balances fetched', data: result.items, meta: result.meta })
})
