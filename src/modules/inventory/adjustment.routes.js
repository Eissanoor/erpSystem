import { Router } from 'express'
import { validate } from '../../common/middleware/validate.js'
import { authenticate } from '../../common/middleware/authenticate.js'
import { authorize } from '../../common/middleware/authorize.js'
import { idParams } from '../../common/validation/common.js'
import {
  adjustmentListQuery,
  createAdjustmentBody,
  rejectAdjustmentBody,
  updateAdjustmentBody,
} from './adjustment.validation.js'
import * as adjustmentController from './adjustment.controller.js'

export const adjustmentRouter = Router()

adjustmentRouter.get(
  '/',
  authenticate,
  authorize('adjustment', 'read'),
  validate({ query: adjustmentListQuery }),
  adjustmentController.list,
)

adjustmentRouter.post(
  '/',
  authenticate,
  authorize('adjustment', 'create'),
  validate({ body: createAdjustmentBody }),
  adjustmentController.create,
)

adjustmentRouter.get(
  '/:id',
  authenticate,
  authorize('adjustment', 'read'),
  validate({ params: idParams }),
  adjustmentController.getById,
)

adjustmentRouter.patch(
  '/:id',
  authenticate,
  authorize('adjustment', 'update'),
  validate({ params: idParams, body: updateAdjustmentBody }),
  adjustmentController.update,
)

adjustmentRouter.post(
  '/:id/submit',
  authenticate,
  authorize('adjustment', 'update'),
  validate({ params: idParams }),
  adjustmentController.submit,
)

adjustmentRouter.post(
  '/:id/approve',
  authenticate,
  authorize('adjustment', 'approve'),
  validate({ params: idParams }),
  adjustmentController.approve,
)

adjustmentRouter.post(
  '/:id/reject',
  authenticate,
  authorize('adjustment', 'approve'),
  validate({ params: idParams, body: rejectAdjustmentBody }),
  adjustmentController.reject,
)

adjustmentRouter.post(
  '/:id/cancel',
  authenticate,
  authorize('adjustment', 'update'),
  validate({ params: idParams }),
  adjustmentController.cancel,
)
