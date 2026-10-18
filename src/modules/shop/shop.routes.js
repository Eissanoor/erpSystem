import { Router } from 'express'
import { validate } from '../../common/middleware/validate.js'
import { authenticate } from '../../common/middleware/authenticate.js'
import { authorize } from '../../common/middleware/authorize.js'
import { idParams, masterStatusBody } from '../../common/validation/common.js'
import { createShopBody, shopListQuery, updateShopBody } from './shop.validation.js'
import * as shopController from './shop.controller.js'

export const shopRouter = Router()

shopRouter.get(
  '/',
  authenticate,
  authorize('shop', 'read'),
  validate({ query: shopListQuery }),
  shopController.list,
)

shopRouter.post(
  '/',
  authenticate,
  authorize('shop', 'create'),
  validate({ body: createShopBody }),
  shopController.create,
)

shopRouter.get(
  '/:id',
  authenticate,
  authorize('shop', 'read'),
  validate({ params: idParams }),
  shopController.getById,
)

shopRouter.patch(
  '/:id',
  authenticate,
  authorize('shop', 'update'),
  validate({ params: idParams, body: updateShopBody }),
  shopController.update,
)

shopRouter.patch(
  '/:id/status',
  authenticate,
  authorize('shop', 'update'),
  validate({ params: idParams, body: masterStatusBody }),
  shopController.setStatus,
)
