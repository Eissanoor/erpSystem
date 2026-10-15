import { Router } from 'express'
import { validate } from '../../common/middleware/validate.js'
import { authenticate } from '../../common/middleware/authenticate.js'
import { authorize } from '../../common/middleware/authorize.js'
import { permissionListQuery } from './permission.validation.js'
import * as permissionController from './permission.controller.js'

export const permissionRouter = Router()

permissionRouter.get(
  '/',
  authenticate,
  authorize('permission', 'read'),
  validate({ query: permissionListQuery }),
  permissionController.list,
)
