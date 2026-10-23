import { Router } from 'express'
import { validate } from '../../common/middleware/validate.js'
import { authenticate } from '../../common/middleware/authenticate.js'
import { authorize } from '../../common/middleware/authorize.js'
import { idParams, masterStatusBody } from '../../common/validation/common.js'
import {
  createSupplierBody,
  supplierDetailQuery,
  supplierListQuery,
  updateSupplierBody,
} from './supplier.validation.js'
import * as supplierController from './supplier.controller.js'

export const supplierRouter = Router()

supplierRouter.get(
  '/',
  authenticate,
  authorize('supplier', 'read'),
  validate({ query: supplierListQuery }),
  supplierController.list,
)

supplierRouter.post(
  '/',
  authenticate,
  authorize('supplier', 'create'),
  validate({ body: createSupplierBody }),
  supplierController.create,
)

supplierRouter.get(
  '/:id',
  authenticate,
  authorize('supplier', 'read'),
  validate({ params: idParams, query: supplierDetailQuery }),
  supplierController.getById,
)

supplierRouter.patch(
  '/:id',
  authenticate,
  authorize('supplier', 'update'),
  validate({ params: idParams, body: updateSupplierBody }),
  supplierController.update,
)

supplierRouter.patch(
  '/:id/status',
  authenticate,
  authorize('supplier', 'update'),
  validate({ params: idParams, body: masterStatusBody }),
  supplierController.setStatus,
)
