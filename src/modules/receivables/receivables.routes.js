import { Router } from 'express'
import Joi from 'joi'
import { validate } from '../../common/middleware/validate.js'
import { authenticate } from '../../common/middleware/authenticate.js'
import { authorize } from '../../common/middleware/authorize.js'
import { idParams, objectId } from '../../common/validation/common.js'
import {
  agingQuery,
  createInvoiceBody,
  createReceiptBody,
  invoiceListQuery,
  ledgerQuery,
  overviewQuery,
  receiptListQuery,
} from './receivables.validation.js'
import * as receivablesController from './receivables.controller.js'

const customerIdParams = Joi.object({
  customerId: objectId.required(),
})

export const receivablesRouter = Router()

receivablesRouter.get(
  '/aging',
  authenticate,
  authorize('receivable', 'read'),
  validate({ query: agingQuery }),
  receivablesController.aging,
)

receivablesRouter.get(
  '/invoices',
  authenticate,
  authorize('receivable', 'read'),
  validate({ query: invoiceListQuery }),
  receivablesController.listInvoices,
)

receivablesRouter.post(
  '/invoices',
  authenticate,
  authorize('receivable', 'create'),
  validate({ body: createInvoiceBody }),
  receivablesController.createInvoice,
)

receivablesRouter.get(
  '/invoices/:id',
  authenticate,
  authorize('receivable', 'read'),
  validate({ params: idParams }),
  receivablesController.getInvoice,
)

receivablesRouter.get(
  '/receipts',
  authenticate,
  authorize('receivable', 'read'),
  validate({ query: receiptListQuery }),
  receivablesController.listReceipts,
)

receivablesRouter.post(
  '/receipts',
  authenticate,
  authorize('receivable', 'create'),
  validate({ body: createReceiptBody }),
  receivablesController.createReceipt,
)

receivablesRouter.get(
  '/receipts/:id',
  authenticate,
  authorize('receivable', 'read'),
  validate({ params: idParams }),
  receivablesController.getReceipt,
)

receivablesRouter.get(
  '/customers/:customerId/overview',
  authenticate,
  authorize('receivable', 'read'),
  validate({ params: customerIdParams, query: overviewQuery }),
  receivablesController.customerOverview,
)

receivablesRouter.get(
  '/customers/:customerId/invoices',
  authenticate,
  authorize('receivable', 'read'),
  validate({ params: customerIdParams, query: invoiceListQuery }),
  receivablesController.listCustomerInvoices,
)

receivablesRouter.get(
  '/customers/:customerId/ledger',
  authenticate,
  authorize('receivable', 'read'),
  validate({ params: customerIdParams, query: ledgerQuery }),
  receivablesController.listLedger,
)
