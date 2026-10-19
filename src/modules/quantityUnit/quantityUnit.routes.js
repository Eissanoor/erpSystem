import { Router } from 'express'
import { validate } from '../../common/middleware/validate.js'
import { authenticate } from '../../common/middleware/authenticate.js'
import { authorize } from '../../common/middleware/authorize.js'
import { idParams, masterStatusBody } from '../../common/validation/common.js'
import {
  createQuantityUnitBody,
  quantityUnitListQuery,
  updateQuantityUnitBody,
} from './quantityUnit.validation.js'
import * as quantityUnitController from './quantityUnit.controller.js'

export const quantityUnitRouter = Router()

quantityUnitRouter.get(
  '/',
  authenticate,
  authorize('quantity_unit', 'read'),
  validate({ query: quantityUnitListQuery }),
  quantityUnitController.list,
)

quantityUnitRouter.post(
  '/',
  authenticate,
  authorize('quantity_unit', 'create'),
  validate({ body: createQuantityUnitBody }),
  quantityUnitController.create,
)

quantityUnitRouter.get(
  '/:id',
  authenticate,
  authorize('quantity_unit', 'read'),
  validate({ params: idParams }),
  quantityUnitController.getById,
)

quantityUnitRouter.patch(
  '/:id',
  authenticate,
  authorize('quantity_unit', 'update'),
  validate({ params: idParams, body: updateQuantityUnitBody }),
  quantityUnitController.update,
)

quantityUnitRouter.patch(
  '/:id/status',
  authenticate,
  authorize('quantity_unit', 'update'),
  validate({ params: idParams, body: masterStatusBody }),
  quantityUnitController.setStatus,
)
