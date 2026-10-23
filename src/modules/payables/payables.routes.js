import { Router } from 'express'
import { validate } from '../../common/middleware/validate.js'
import { authenticate } from '../../common/middleware/authenticate.js'
import { authorize } from '../../common/middleware/authorize.js'
import { idParams, objectId } from '../../common/validation/common.js'
import Joi from 'joi'
import {
  agingQuery,
  createInvoiceBody,
  createPaymentBody,
  invoiceListQuery,
  ledgerQuery,
  overviewQuery,
  paymentListQuery,
} from './payables.validation.js'
import * as payablesController from './payables.controller.js'

const supplierIdParams = Joi.object({
  supplierId: objectId.required(),
})

export const payablesRouter = Router()

payablesRouter.get(
  '/aging',
  authenticate,
  authorize('payable', 'read'),
  validate({ query: agingQuery }),
  payablesController.aging,
)

payablesRouter.get(
  '/invoices',
  authenticate,
  authorize('payable', 'read'),
  validate({ query: invoiceListQuery }),
  payablesController.listInvoices,
)

payablesRouter.post(
  '/invoices',
  authenticate,
  authorize('payable', 'create'),
  validate({ body: createInvoiceBody }),
  payablesController.createInvoice,
)

payablesRouter.get(
  '/invoices/:id',
  authenticate,
  authorize('payable', 'read'),
  validate({ params: idParams }),
  payablesController.getInvoice,
)

payablesRouter.get(
  '/payments',
  authenticate,
  authorize('payable', 'read'),
  validate({ query: paymentListQuery }),
  payablesController.listPayments,
)

payablesRouter.post(
  '/payments',
  authenticate,
  authorize('payable', 'create'),
  validate({ body: createPaymentBody }),
  payablesController.createPayment,
)

payablesRouter.get(
  '/payments/:id',
  authenticate,
  authorize('payable', 'read'),
  validate({ params: idParams }),
  payablesController.getPayment,
)

payablesRouter.get(
  '/suppliers/:supplierId/overview',
  authenticate,
  authorize('payable', 'read'),
  validate({ params: supplierIdParams, query: overviewQuery }),
  payablesController.supplierOverview,
)

payablesRouter.get(
  '/suppliers/:supplierId/invoices',
  authenticate,
  authorize('payable', 'read'),
  validate({ params: supplierIdParams, query: invoiceListQuery }),
  payablesController.listSupplierInvoices,
)

payablesRouter.get(
  '/suppliers/:supplierId/ledger',
  authenticate,
  authorize('payable', 'read'),
  validate({ params: supplierIdParams, query: ledgerQuery }),
  payablesController.listLedger,
)
