import { Router } from 'express'
import { validate } from '../../common/middleware/validate.js'
import { authenticate } from '../../common/middleware/authenticate.js'
import { authorize } from '../../common/middleware/authorize.js'
import { idParams } from '../../common/validation/common.js'
import {
  createPartnershipBody,
  partnershipDetailQuery,
  partnershipListQuery,
  partnershipStatusBody,
  updatePartnershipBody,
} from './partnership.validation.js'
import * as partnershipController from './partnership.controller.js'

export const partnershipRouter = Router()

partnershipRouter.get(
  '/',
  authenticate,
  authorize('partnership', 'read'),
  validate({ query: partnershipListQuery }),
  partnershipController.list,
)

partnershipRouter.post(
  '/',
  authenticate,
  authorize('partnership', 'create'),
  validate({ body: createPartnershipBody }),
  partnershipController.create,
)

partnershipRouter.get(
  '/:id',
  authenticate,
  authorize('partnership', 'read'),
  validate({ params: idParams, query: partnershipDetailQuery }),
  partnershipController.getById,
)

partnershipRouter.patch(
  '/:id',
  authenticate,
  authorize('partnership', 'update'),
  validate({ params: idParams, body: updatePartnershipBody }),
  partnershipController.update,
)

partnershipRouter.patch(
  '/:id/status',
  authenticate,
  authorize('partnership', 'update'),
  validate({ params: idParams, body: partnershipStatusBody }),
  partnershipController.setStatus,
)
