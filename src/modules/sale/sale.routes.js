import { Router } from 'express'
import { validate } from '../../common/middleware/validate.js'
import { authenticate } from '../../common/middleware/authenticate.js'
import { authorize } from '../../common/middleware/authorize.js'
import { idParams } from '../../common/validation/common.js'
import {
  createSaleBody,
  saleListQuery,
  updateSaleBody,
  workspaceQuery,
} from './sale.validation.js'
import * as saleController from './sale.controller.js'

export const saleRouter = Router()

saleRouter.get(
  '/workspace',
  authenticate,
  authorize('sale', 'read'),
  validate({ query: workspaceQuery }),
  saleController.workspace,
)

saleRouter.get(
  '/',
  authenticate,
  authorize('sale', 'read'),
  validate({ query: saleListQuery }),
  saleController.list,
)

saleRouter.post(
  '/',
  authenticate,
  authorize('sale', 'create'),
  validate({ body: createSaleBody }),
  saleController.create,
)

saleRouter.get(
  '/:id',
  authenticate,
  authorize('sale', 'read'),
  validate({ params: idParams }),
  saleController.getById,
)

saleRouter.patch(
  '/:id',
  authenticate,
  authorize('sale', 'update'),
  validate({ params: idParams, body: updateSaleBody }),
  saleController.update,
)

saleRouter.post(
  '/:id/approve',
  authenticate,
  authorize('sale', 'approve'),
  validate({ params: idParams }),
  saleController.approve,
)

saleRouter.post(
  '/:id/post',
  authenticate,
  authorize('sale', 'post'),
  validate({ params: idParams }),
  saleController.post,
)

saleRouter.post(
  '/:id/cancel',
  authenticate,
  authorize('sale', 'update'),
  validate({ params: idParams }),
  saleController.cancel,
)
