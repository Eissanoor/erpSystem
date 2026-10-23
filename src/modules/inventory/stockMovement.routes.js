import { Router } from 'express'
import { validate } from '../../common/middleware/validate.js'
import { authenticate } from '../../common/middleware/authenticate.js'
import { authorize } from '../../common/middleware/authorize.js'
import { idParams } from '../../common/validation/common.js'
import { stockMovementListQuery } from './stockMovement.validation.js'
import * as stockMovementController from './stockMovement.controller.js'

export const stockMovementRouter = Router()

stockMovementRouter.get(
  '/',
  authenticate,
  authorize('stock', 'read'),
  validate({ query: stockMovementListQuery }),
  stockMovementController.list,
)

stockMovementRouter.get(
  '/:id',
  authenticate,
  authorize('stock', 'read'),
  validate({ params: idParams }),
  stockMovementController.getById,
)
