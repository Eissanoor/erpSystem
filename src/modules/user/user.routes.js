import { Router } from 'express'
import { validate } from '../../common/middleware/validate.js'
import { authenticate } from '../../common/middleware/authenticate.js'
import { authorize } from '../../common/middleware/authorize.js'
import { idParams } from '../../common/validation/common.js'
import { createUserBody, updateAccessBody, updateUserBody, userListQuery } from './user.validation.js'
import * as userController from './user.controller.js'

export const userRouter = Router()

userRouter.get(
  '/',
  authenticate,
  authorize('user', 'read'),
  validate({ query: userListQuery }),
  userController.list,
)

userRouter.post(
  '/',
  authenticate,
  authorize('user', 'create'),
  validate({ body: createUserBody }),
  userController.create,
)

userRouter.patch(
  '/:id/access',
  authenticate,
  authorize('user', 'update'),
  validate({ params: idParams, body: updateAccessBody }),
  userController.updateAccess,
)

userRouter.get(
  '/:id',
  authenticate,
  authorize('user', 'read'),
  validate({ params: idParams }),
  userController.getById,
)

userRouter.patch(
  '/:id',
  authenticate,
  authorize('user', 'update'),
  validate({ params: idParams, body: updateUserBody }),
  userController.update,
)
