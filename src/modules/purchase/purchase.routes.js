import { Router } from 'express'
import { validate } from '../../common/middleware/validate.js'
import { authenticate } from '../../common/middleware/authenticate.js'
import { authorize } from '../../common/middleware/authorize.js'
import { idParams } from '../../common/validation/common.js'
import {
  createPurchaseBody,
  createReturnBody,
  purchaseListQuery,
  receivePurchaseBody,
  returnListQuery,
  updatePurchaseBody,
  updateReturnBody,
  workspaceQuery,
} from './purchase.validation.js'
import * as purchaseController from './purchase.controller.js'

export const purchaseRouter = Router()
export const purchaseReturnRouter = Router()

purchaseRouter.get(
  '/workspace',
  authenticate,
  authorize('purchase', 'read'),
  validate({ query: workspaceQuery }),
  purchaseController.workspace,
)

purchaseRouter.get(
  '/',
  authenticate,
  authorize('purchase', 'read'),
  validate({ query: purchaseListQuery }),
  purchaseController.list,
)

purchaseRouter.post(
  '/',
  authenticate,
  authorize('purchase', 'create'),
  validate({ body: createPurchaseBody }),
  purchaseController.create,
)

purchaseRouter.get(
  '/:id',
  authenticate,
  authorize('purchase', 'read'),
  validate({ params: idParams }),
  purchaseController.getById,
)

purchaseRouter.patch(
  '/:id',
  authenticate,
  authorize('purchase', 'update'),
  validate({ params: idParams, body: updatePurchaseBody }),
  purchaseController.update,
)

purchaseRouter.post(
  '/:id/approve',
  authenticate,
  authorize('purchase', 'approve'),
  validate({ params: idParams }),
  purchaseController.approve,
)

purchaseRouter.post(
  '/:id/post',
  authenticate,
  authorize('purchase', 'post'),
  validate({ params: idParams }),
  purchaseController.post,
)

purchaseRouter.post(
  '/:id/cancel',
  authenticate,
  authorize('purchase', 'update'),
  validate({ params: idParams }),
  purchaseController.cancel,
)

purchaseRouter.post(
  '/:id/receive',
  authenticate,
  authorize('purchase', 'update'),
  validate({ params: idParams, body: receivePurchaseBody }),
  purchaseController.receive,
)

purchaseReturnRouter.get(
  '/',
  authenticate,
  authorize('purchase_return', 'read'),
  validate({ query: returnListQuery }),
  purchaseController.listReturns,
)

purchaseReturnRouter.post(
  '/',
  authenticate,
  authorize('purchase_return', 'create'),
  validate({ body: createReturnBody }),
  purchaseController.createReturn,
)

purchaseReturnRouter.get(
  '/:id',
  authenticate,
  authorize('purchase_return', 'read'),
  validate({ params: idParams }),
  purchaseController.getReturn,
)

purchaseReturnRouter.patch(
  '/:id',
  authenticate,
  authorize('purchase_return', 'update'),
  validate({ params: idParams, body: updateReturnBody }),
  purchaseController.updateReturn,
)

purchaseReturnRouter.post(
  '/:id/approve',
  authenticate,
  authorize('purchase_return', 'approve'),
  validate({ params: idParams }),
  purchaseController.approveReturn,
)

purchaseReturnRouter.post(
  '/:id/cancel',
  authenticate,
  authorize('purchase_return', 'update'),
  validate({ params: idParams }),
  purchaseController.cancelReturn,
)

purchaseReturnRouter.post(
  '/:id/post',
  authenticate,
  authorize('purchase_return', 'post'),
  validate({ params: idParams }),
  purchaseController.postReturn,
)

purchaseReturnRouter.post(
  '/:id/ship',
  authenticate,
  authorize('purchase_return', 'approve'),
  validate({ params: idParams }),
  purchaseController.shipReturn,
)

purchaseReturnRouter.post(
  '/:id/credit',
  authenticate,
  authorize('purchase_return', 'post'),
  validate({ params: idParams }),
  purchaseController.creditReturn,
)
