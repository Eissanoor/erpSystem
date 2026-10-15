import { asyncHandler } from '../../common/utils/asyncHandler.js'
import { sendSuccess } from '../../common/utils/ApiResponse.js'
import * as permissionService from './permission.service.js'

export const list = asyncHandler(async (req, res) => {
  const result = await permissionService.list(req.query)
  sendSuccess(res, { message: 'Permissions fetched', data: result.items, meta: result.meta })
})
