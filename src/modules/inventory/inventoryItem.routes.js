import { Router } from 'express'
import { validate } from '../../common/middleware/validate.js'
import { authenticate } from '../../common/middleware/authenticate.js'
import { authorize } from '../../common/middleware/authorize.js'
import { inventoryItemListQuery } from './inventoryItem.validation.js'
import * as inventoryItemController from './inventoryItem.controller.js'

export const inventoryItemRouter = Router()

inventoryItemRouter.get(
  '/',
  authenticate,
  authorize('stock', 'read'),
  validate({ query: inventoryItemListQuery }),
  inventoryItemController.list,
)
