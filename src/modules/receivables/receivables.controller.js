import { asyncHandler } from '../../common/utils/asyncHandler.js'
import { sendSuccess } from '../../common/utils/ApiResponse.js'
import * as receivablesService from './receivables.service.js'

export const aging = asyncHandler(async (req, res) => {
  const data = await receivablesService.aging(req.query, req.user)
  sendSuccess(res, { message: 'Customer aging fetched', data })
})

export const customerOverview = asyncHandler(async (req, res) => {
  const data = await receivablesService.customerOverview(req.params.customerId, req.query, req.user)
  sendSuccess(res, { message: 'Customer receivables overview fetched', data })
})

export const listInvoices = asyncHandler(async (req, res) => {
  const result = await receivablesService.listInvoices(req.query, req.user)
  sendSuccess(res, { message: 'Customer invoices fetched', data: result.items, meta: result.meta })
})

export const listCustomerInvoices = asyncHandler(async (req, res) => {
  const result = await receivablesService.listCustomerInvoices(
    req.params.customerId,
    req.query,
    req.user,
  )
  sendSuccess(res, { message: 'Customer invoices fetched', data: result.items, meta: result.meta })
})

export const getInvoice = asyncHandler(async (req, res) => {
  const data = await receivablesService.getInvoice(req.params.id, req.user)
  sendSuccess(res, { message: 'Customer invoice fetched', data })
})

export const createInvoice = asyncHandler(async (req, res) => {
  const data = await receivablesService.createInvoice(req.body, req.user)
  sendSuccess(res, { statusCode: 201, message: 'Customer invoice posted', data })
})

export const listReceipts = asyncHandler(async (req, res) => {
  const result = await receivablesService.listReceipts(req.query, req.user)
  sendSuccess(res, { message: 'Customer receipts fetched', data: result.items, meta: result.meta })
})

export const getReceipt = asyncHandler(async (req, res) => {
  const data = await receivablesService.getReceipt(req.params.id, req.user)
  sendSuccess(res, { message: 'Customer receipt fetched', data })
})

export const createReceipt = asyncHandler(async (req, res) => {
  const data = await receivablesService.createReceipt(req.body, req.user)
  sendSuccess(res, { statusCode: 201, message: 'Customer receipt posted', data })
})

export const listLedger = asyncHandler(async (req, res) => {
  const result = await receivablesService.listLedger(req.params.customerId, req.query, req.user)
  sendSuccess(res, { message: 'Customer ledger fetched', data: result.items, meta: result.meta })
})
