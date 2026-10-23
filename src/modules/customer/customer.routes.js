import { Router } from 'express'
import { validate } from '../../common/middleware/validate.js'
import { authenticate } from '../../common/middleware/authenticate.js'
import { authorize } from '../../common/middleware/authorize.js'
import { idParams, masterStatusBody } from '../../common/validation/common.js'
import {
  createCustomerBody,
  customerDetailQuery,
  customerListQuery,
  updateCustomerBody,
} from './customer.validation.js'
import * as customerController from './customer.controller.js'

export const customerRouter = Router()

customerRouter.get(
  '/',
  authenticate,
  authorize('customer', 'read'),
  validate({ query: customerListQuery }),
  customerController.list,
)

customerRouter.post(
  '/',
  authenticate,
  authorize('customer', 'create'),
  validate({ body: createCustomerBody }),
  customerController.create,
)

customerRouter.get(
  '/:id',
  authenticate,
  authorize('customer', 'read'),
  validate({ params: idParams, query: customerDetailQuery }),
  customerController.getById,
)

customerRouter.patch(
  '/:id',
  authenticate,
  authorize('customer', 'update'),
  validate({ params: idParams, body: updateCustomerBody }),
  customerController.update,
)

customerRouter.patch(
  '/:id/status',
  authenticate,
  authorize('customer', 'update'),
  validate({ params: idParams, body: masterStatusBody }),
  customerController.setStatus,
)
