import { Router } from 'express'
import { validate } from '../../common/middleware/validate.js'
import { authenticate } from '../../common/middleware/authenticate.js'
import { authorize } from '../../common/middleware/authorize.js'
import { idParams } from '../../common/validation/common.js'
import {
  createReturnBody,
  returnListQuery,
  updateReturnBody,
} from './saleReturn.validation.js'
import * as saleReturnController from './saleReturn.controller.js'

export const saleReturnRouter = Router()

saleReturnRouter.get(
  '/',
  authenticate,
  authorize('sale_return', 'read'),
  validate({ query: returnListQuery }),
  saleReturnController.list,
)

saleReturnRouter.post(
  '/',
  authenticate,
  authorize('sale_return', 'create'),
  validate({ body: createReturnBody }),
  saleReturnController.create,
)

saleReturnRouter.get(
  '/:id',
  authenticate,
  authorize('sale_return', 'read'),
  validate({ params: idParams }),
  saleReturnController.getById,
)

saleReturnRouter.patch(
  '/:id',
  authenticate,
  authorize('sale_return', 'update'),
  validate({ params: idParams, body: updateReturnBody }),
  saleReturnController.update,
)

saleReturnRouter.post(
  '/:id/approve',
  authenticate,
  authorize('sale_return', 'approve'),
  validate({ params: idParams }),
  saleReturnController.approve,
)

saleReturnRouter.post(
  '/:id/post',
  authenticate,
  authorize('sale_return', 'post'),
  validate({ params: idParams }),
  saleReturnController.post,
)

saleReturnRouter.post(
  '/:id/cancel',
  authenticate,
  authorize('sale_return', 'update'),
  validate({ params: idParams }),
  saleReturnController.cancel,
)
