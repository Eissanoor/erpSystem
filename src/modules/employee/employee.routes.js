import { Router } from 'express'
import { validate } from '../../common/middleware/validate.js'
import { authenticate } from '../../common/middleware/authenticate.js'
import { authorize } from '../../common/middleware/authorize.js'
import { idParams } from '../../common/validation/common.js'
import {
  createEmployeeBody,
  employeeDetailQuery,
  employeeListQuery,
  employeeStatusBody,
  updateEmployeeBody,
} from './employee.validation.js'
import * as employeeController from './employee.controller.js'

export const employeeRouter = Router()

employeeRouter.get(
  '/',
  authenticate,
  authorize('employee', 'read'),
  validate({ query: employeeListQuery }),
  employeeController.list,
)

employeeRouter.post(
  '/',
  authenticate,
  authorize('employee', 'create'),
  validate({ body: createEmployeeBody }),
  employeeController.create,
)

employeeRouter.get(
  '/:id',
  authenticate,
  authorize('employee', 'read'),
  validate({ params: idParams, query: employeeDetailQuery }),
  employeeController.getById,
)

employeeRouter.patch(
  '/:id',
  authenticate,
  authorize('employee', 'update'),
  validate({ params: idParams, body: updateEmployeeBody }),
  employeeController.update,
)

employeeRouter.patch(
  '/:id/status',
  authenticate,
  authorize('employee', 'update'),
  validate({ params: idParams, body: employeeStatusBody }),
  employeeController.setStatus,
)
