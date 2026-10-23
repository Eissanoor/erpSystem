import { asyncHandler } from '../../common/utils/asyncHandler.js'
import { sendSuccess } from '../../common/utils/ApiResponse.js'
import * as payablesService from './payables.service.js'

export const aging = asyncHandler(async (req, res) => {
  const data = await payablesService.aging(req.query, req.user)
  sendSuccess(res, { message: 'Supplier aging fetched', data })
})

export const supplierOverview = asyncHandler(async (req, res) => {
  const data = await payablesService.supplierOverview(req.params.supplierId, req.query, req.user)
  sendSuccess(res, { message: 'Supplier payables overview fetched', data })
})

export const listInvoices = asyncHandler(async (req, res) => {
  const result = await payablesService.listInvoices(req.query, req.user)
  sendSuccess(res, { message: 'Supplier invoices fetched', data: result.items, meta: result.meta })
})

export const listSupplierInvoices = asyncHandler(async (req, res) => {
  const result = await payablesService.listSupplierInvoices(req.params.supplierId, req.query, req.user)
  sendSuccess(res, { message: 'Supplier invoices fetched', data: result.items, meta: result.meta })
})

export const getInvoice = asyncHandler(async (req, res) => {
  const data = await payablesService.getInvoice(req.params.id, req.user)
  sendSuccess(res, { message: 'Supplier invoice fetched', data })
})

export const createInvoice = asyncHandler(async (req, res) => {
  const data = await payablesService.createInvoice(req.body, req.user)
  sendSuccess(res, { statusCode: 201, message: 'Supplier invoice posted', data })
})

export const listPayments = asyncHandler(async (req, res) => {
  const result = await payablesService.listPayments(req.query, req.user)
  sendSuccess(res, { message: 'Supplier payments fetched', data: result.items, meta: result.meta })
})

export const getPayment = asyncHandler(async (req, res) => {
  const data = await payablesService.getPayment(req.params.id, req.user)
  sendSuccess(res, { message: 'Supplier payment fetched', data })
})

export const createPayment = asyncHandler(async (req, res) => {
  const data = await payablesService.createPayment(req.body, req.user)
  sendSuccess(res, { statusCode: 201, message: 'Supplier payment posted', data })
})

export const listLedger = asyncHandler(async (req, res) => {
  const result = await payablesService.listLedger(req.params.supplierId, req.query, req.user)
  sendSuccess(res, { message: 'Supplier ledger fetched', data: result.items, meta: result.meta })
})
