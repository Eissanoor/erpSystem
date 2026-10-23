import { Router } from 'express'
import { validate } from '../../common/middleware/validate.js'
import { authenticate } from '../../common/middleware/authenticate.js'
import { authorize } from '../../common/middleware/authorize.js'
import { idParams } from '../../common/validation/common.js'
import {
  createDamageBody,
  damageListQuery,
  rejectDamageBody,
  updateDamageBody,
} from './damage.validation.js'
import * as damageController from './damage.controller.js'

export const damageRouter = Router()

damageRouter.get(
  '/',
  authenticate,
  authorize('damage', 'read'),
  validate({ query: damageListQuery }),
  damageController.list,
)

damageRouter.post(
  '/',
  authenticate,
  authorize('damage', 'create'),
  validate({ body: createDamageBody }),
  damageController.create,
)

damageRouter.get(
  '/:id',
  authenticate,
  authorize('damage', 'read'),
  validate({ params: idParams }),
  damageController.getById,
)

damageRouter.patch(
  '/:id',
  authenticate,
  authorize('damage', 'update'),
  validate({ params: idParams, body: updateDamageBody }),
  damageController.update,
)

damageRouter.post(
  '/:id/submit',
  authenticate,
  authorize('damage', 'update'),
  validate({ params: idParams }),
  damageController.submit,
)

damageRouter.post(
  '/:id/approve',
  authenticate,
  authorize('damage', 'approve'),
  validate({ params: idParams }),
  damageController.approve,
)

damageRouter.post(
  '/:id/reject',
  authenticate,
  authorize('damage', 'approve'),
  validate({ params: idParams, body: rejectDamageBody }),
  damageController.reject,
)

damageRouter.post(
  '/:id/cancel',
  authenticate,
  authorize('damage', 'update'),
  validate({ params: idParams }),
  damageController.cancel,
)
