import { Router } from 'express'
import { validate } from '../../common/middleware/validate.js'
import { authenticate } from '../../common/middleware/authenticate.js'
import { authorize } from '../../common/middleware/authorize.js'
import { idParams } from '../../common/validation/common.js'
import { createRoleBody, roleListQuery, updateRoleBody } from './role.validation.js'
import * as roleController from './role.controller.js'

export const roleRouter = Router()

roleRouter.get(
  '/',
  authenticate,
  authorize('role', 'read'),
  validate({ query: roleListQuery }),
  roleController.list,
)

roleRouter.post(
  '/',
  authenticate,
  authorize('role', 'create'),
  validate({ body: createRoleBody }),
  roleController.create,
)

roleRouter.get(
  '/:id',
  authenticate,
  authorize('role', 'read'),
  validate({ params: idParams }),
  roleController.getById,
)

roleRouter.patch(
  '/:id',
  authenticate,
  authorize('role', 'update'),
  validate({ params: idParams, body: updateRoleBody }),
  roleController.update,
)
