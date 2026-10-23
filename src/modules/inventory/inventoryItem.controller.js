import { asyncHandler } from '../../common/utils/asyncHandler.js'
import { sendSuccess } from '../../common/utils/ApiResponse.js'
import * as inventoryItemService from './inventoryItem.service.js'

export const list = asyncHandler(async (req, res) => {
  const result = await inventoryItemService.list(req.query, req.user)
  sendSuccess(res, { message: 'Inventory items fetched', data: result.items, meta: result.meta })
})
