import { Router } from 'express'
import { validate } from '../../common/middleware/validate.js'
import { authenticate } from '../../common/middleware/authenticate.js'
import { authorize } from '../../common/middleware/authorize.js'
import { idParams, masterStatusBody } from '../../common/validation/common.js'
import { createPackingUnitBody, packingUnitListQuery, updatePackingUnitBody } from './packingUnit.validation.js'
import * as packingUnitController from './packingUnit.controller.js'

export const packingUnitRouter = Router()

packingUnitRouter.get(
  '/',
  authenticate,
  authorize('packing_unit', 'read'),
  validate({ query: packingUnitListQuery }),
  packingUnitController.list,
)

packingUnitRouter.post(
  '/',
  authenticate,
  authorize('packing_unit', 'create'),
  validate({ body: createPackingUnitBody }),
  packingUnitController.create,
)

packingUnitRouter.get(
  '/:id',
  authenticate,
  authorize('packing_unit', 'read'),
  validate({ params: idParams }),
  packingUnitController.getById,
)

packingUnitRouter.patch(
  '/:id',
  authenticate,
  authorize('packing_unit', 'update'),
  validate({ params: idParams, body: updatePackingUnitBody }),
  packingUnitController.update,
)

packingUnitRouter.patch(
  '/:id/status',
  authenticate,
  authorize('packing_unit', 'update'),
  validate({ params: idParams, body: masterStatusBody }),
  packingUnitController.setStatus,
)
