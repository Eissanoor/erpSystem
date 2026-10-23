import { asyncHandler } from '../../common/utils/asyncHandler.js'
import { sendSuccess } from '../../common/utils/ApiResponse.js'
import * as purchaseService from './purchase.service.js'

export const workspace = asyncHandler(async (req, res) => {
  const data = await purchaseService.workspace(req.query, req.user)
  sendSuccess(res, { message: 'Purchases workspace fetched', data })
})

export const list = asyncHandler(async (req, res) => {
  const result = await purchaseService.list(req.query, req.user)
  sendSuccess(res, { message: 'Purchases fetched', data: result.items, meta: result.meta })
})

export const getById = asyncHandler(async (req, res) => {
  const data = await purchaseService.getById(req.params.id, req.user)
  sendSuccess(res, { message: 'Purchase fetched', data })
})

export const create = asyncHandler(async (req, res) => {
  const data = await purchaseService.create(req.body, req.user)
  sendSuccess(res, { statusCode: 201, message: 'Purchase created', data })
})

export const update = asyncHandler(async (req, res) => {
  const data = await purchaseService.update(req.params.id, req.body, req.user)
  sendSuccess(res, { message: 'Purchase updated', data })
})

export const approve = asyncHandler(async (req, res) => {
  const data = await purchaseService.approve(req.params.id, req.user)
  sendSuccess(res, { message: 'Purchase approved', data })
})

export const post = asyncHandler(async (req, res) => {
  const data = await purchaseService.post(req.params.id, req.user)
  sendSuccess(res, { message: 'Purchase posted', data })
})

export const cancel = asyncHandler(async (req, res) => {
  const data = await purchaseService.cancel(req.params.id, req.user)
  sendSuccess(res, { message: 'Purchase cancelled', data })
})

export const receive = asyncHandler(async (req, res) => {
  const data = await purchaseService.receive(req.params.id, req.body, req.user)
  sendSuccess(res, { message: 'Purchase received', data })
})

export const listReturns = asyncHandler(async (req, res) => {
  const result = await purchaseService.listReturns(req.query, req.user)
  sendSuccess(res, { message: 'Purchase returns fetched', data: result.items, meta: result.meta })
})

export const getReturn = asyncHandler(async (req, res) => {
  const data = await purchaseService.getReturn(req.params.id, req.user)
  sendSuccess(res, { message: 'Purchase return fetched', data })
})

export const createReturn = asyncHandler(async (req, res) => {
  const data = await purchaseService.createReturn(req.body, req.user)
  sendSuccess(res, { statusCode: 201, message: 'Purchase return created', data })
})

export const updateReturn = asyncHandler(async (req, res) => {
  const data = await purchaseService.updateReturn(req.params.id, req.body, req.user)
  sendSuccess(res, { message: 'Purchase return updated', data })
})

export const approveReturn = asyncHandler(async (req, res) => {
  const data = await purchaseService.approveReturn(req.params.id, req.user)
  sendSuccess(res, { message: 'Purchase return approved', data })
})

export const cancelReturn = asyncHandler(async (req, res) => {
  const data = await purchaseService.cancelReturn(req.params.id, req.user)
  sendSuccess(res, { message: 'Purchase return cancelled', data })
})

export const postReturn = asyncHandler(async (req, res) => {
  const data = await purchaseService.postReturn(req.params.id, req.user)
  sendSuccess(res, { message: 'Purchase return posted', data })
})

export const shipReturn = asyncHandler(async (req, res) => {
  const data = await purchaseService.shipReturn(req.params.id, req.user)
  sendSuccess(res, { message: 'Purchase return approved', data })
})

export const creditReturn = asyncHandler(async (req, res) => {
  const data = await purchaseService.creditReturn(req.params.id, req.user)
  sendSuccess(res, { message: 'Purchase return posted', data })
})
