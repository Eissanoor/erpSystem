import { Router } from 'express'
import { validate } from '../../common/middleware/validate.js'
import { authenticate } from '../../common/middleware/authenticate.js'
import { authorize } from '../../common/middleware/authorize.js'
import { idParams } from '../../common/validation/common.js'
import { createTransferBody, transferListQuery, updateTransferBody } from './transfer.validation.js'
import * as transferController from './transfer.controller.js'

export const transferRouter = Router()

transferRouter.get(
  '/',
  authenticate,
  authorize('transfer', 'read'),
  validate({ query: transferListQuery }),
  transferController.list,
)

transferRouter.post(
  '/',
  authenticate,
  authorize('transfer', 'create'),
  validate({ body: createTransferBody }),
  transferController.create,
)

transferRouter.get(
  '/:id',
  authenticate,
  authorize('transfer', 'read'),
  validate({ params: idParams }),
  transferController.getById,
)

transferRouter.patch(
  '/:id',
  authenticate,
  authorize('transfer', 'update'),
  validate({ params: idParams, body: updateTransferBody }),
  transferController.update,
)

transferRouter.post(
  '/:id/dispatch',
  authenticate,
  authorize('transfer', 'approve'),
  validate({ params: idParams }),
  transferController.dispatch,
)

transferRouter.post(
  '/:id/receive',
  authenticate,
  authorize('transfer', 'approve'),
  validate({ params: idParams }),
  transferController.receive,
)

transferRouter.post(
  '/:id/cancel',
  authenticate,
  authorize('transfer', 'update'),
  validate({ params: idParams }),
  transferController.cancel,
)
