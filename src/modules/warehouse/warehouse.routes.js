import { Router } from 'express'
import { validate } from '../../common/middleware/validate.js'
import { authenticate } from '../../common/middleware/authenticate.js'
import { authorize } from '../../common/middleware/authorize.js'
import { idParams, masterStatusBody } from '../../common/validation/common.js'
import {
  createWarehouseBody,
  updateWarehouseBody,
  warehouseListQuery,
} from './warehouse.validation.js'
import * as warehouseController from './warehouse.controller.js'

export const warehouseRouter = Router()

warehouseRouter.get(
  '/',
  authenticate,
  authorize('warehouse', 'read'),
  validate({ query: warehouseListQuery }),
  warehouseController.list,
)

warehouseRouter.post(
  '/',
  authenticate,
  authorize('warehouse', 'create'),
  validate({ body: createWarehouseBody }),
  warehouseController.create,
)

warehouseRouter.get(
  '/:id',
  authenticate,
  authorize('warehouse', 'read'),
  validate({ params: idParams }),
  warehouseController.getById,
)

warehouseRouter.patch(
  '/:id',
  authenticate,
  authorize('warehouse', 'update'),
  validate({ params: idParams, body: updateWarehouseBody }),
  warehouseController.update,
)

warehouseRouter.patch(
  '/:id/status',
  authenticate,
  authorize('warehouse', 'update'),
  validate({ params: idParams, body: masterStatusBody }),
  warehouseController.setStatus,
)
