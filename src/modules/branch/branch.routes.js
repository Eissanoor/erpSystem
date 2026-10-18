import { Router } from 'express'
import { validate } from '../../common/middleware/validate.js'
import { authenticate } from '../../common/middleware/authenticate.js'
import { authorize } from '../../common/middleware/authorize.js'
import { idParams } from '../../common/validation/common.js'
import { branchListQuery, branchStatusBody, createBranchBody, updateBranchBody } from './branch.validation.js'
import * as branchController from './branch.controller.js'

export const branchRouter = Router()

branchRouter.get(
  '/',
  authenticate,
  authorize('branch', 'read'),
  validate({ query: branchListQuery }),
  branchController.list,
)

branchRouter.post(
  '/',
  authenticate,
  authorize('branch', 'create'),
  validate({ body: createBranchBody }),
  branchController.create,
)

branchRouter.get(
  '/:id',
  authenticate,
  authorize('branch', 'read'),
  validate({ params: idParams }),
  branchController.getById,
)

branchRouter.patch(
  '/:id',
  authenticate,
  authorize('branch', 'update'),
  validate({ params: idParams, body: updateBranchBody }),
  branchController.update,
)

branchRouter.patch(
  '/:id/status',
  authenticate,
  authorize('branch', 'update'),
  validate({ params: idParams, body: branchStatusBody }),
  branchController.setStatus,
)
