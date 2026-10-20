import { Router } from 'express'
import { validate } from '../../common/middleware/validate.js'
import { authenticate } from '../../common/middleware/authenticate.js'
import { authorize } from '../../common/middleware/authorize.js'
import { idParams } from '../../common/validation/common.js'
import {
  createOwnerBody,
  ownerDetailQuery,
  ownerListQuery,
  ownerStatusBody,
  updateOwnerBody,
} from './owner.validation.js'
import * as ownerController from './owner.controller.js'

export const ownerRouter = Router()

ownerRouter.get(
  '/',
  authenticate,
  authorize('owner', 'read'),
  validate({ query: ownerListQuery }),
  ownerController.list,
)

ownerRouter.post(
  '/',
  authenticate,
  authorize('owner', 'create'),
  validate({ body: createOwnerBody }),
  ownerController.create,
)

ownerRouter.get(
  '/:id',
  authenticate,
  authorize('owner', 'read'),
  validate({ params: idParams, query: ownerDetailQuery }),
  ownerController.getById,
)

ownerRouter.patch(
  '/:id',
  authenticate,
  authorize('owner', 'update'),
  validate({ params: idParams, body: updateOwnerBody }),
  ownerController.update,
)

ownerRouter.patch(
  '/:id/status',
  authenticate,
  authorize('owner', 'update'),
  validate({ params: idParams, body: ownerStatusBody }),
  ownerController.setStatus,
)
