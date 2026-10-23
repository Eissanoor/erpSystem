import { Router } from 'express'
import { validate } from '../../common/middleware/validate.js'
import { authenticate } from '../../common/middleware/authenticate.js'
import { authorize } from '../../common/middleware/authorize.js'
import { stockBalanceListQuery } from './stockBalance.validation.js'
import * as stockBalanceController from './stockBalance.controller.js'

export const stockBalanceRouter = Router()

stockBalanceRouter.get(
  '/',
  authenticate,
  authorize('stock', 'read'),
  validate({ query: stockBalanceListQuery }),
  stockBalanceController.list,
)
