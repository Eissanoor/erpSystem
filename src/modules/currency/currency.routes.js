import { Router } from 'express'
import { validate } from '../../common/middleware/validate.js'
import { authenticate } from '../../common/middleware/authenticate.js'
import { authorize } from '../../common/middleware/authorize.js'
import { idParams, masterStatusBody } from '../../common/validation/common.js'
import { createCurrencyBody, currencyListQuery, updateCurrencyBody } from './currency.validation.js'
import * as currencyController from './currency.controller.js'

export const currencyRouter = Router()

currencyRouter.get(
  '/',
  authenticate,
  authorize('currency', 'read'),
  validate({ query: currencyListQuery }),
  currencyController.list,
)

currencyRouter.post(
  '/',
  authenticate,
  authorize('currency', 'create'),
  validate({ body: createCurrencyBody }),
  currencyController.create,
)

currencyRouter.get(
  '/:id',
  authenticate,
  authorize('currency', 'read'),
  validate({ params: idParams }),
  currencyController.getById,
)

currencyRouter.patch(
  '/:id',
  authenticate,
  authorize('currency', 'update'),
  validate({ params: idParams, body: updateCurrencyBody }),
  currencyController.update,
)

currencyRouter.patch(
  '/:id/status',
  authenticate,
  authorize('currency', 'update'),
  validate({ params: idParams, body: masterStatusBody }),
  currencyController.setStatus,
)
