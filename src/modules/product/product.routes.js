import { Router } from 'express'
import { validate } from '../../common/middleware/validate.js'
import { authenticate } from '../../common/middleware/authenticate.js'
import { authorize } from '../../common/middleware/authorize.js'
import { idParams, masterStatusBody } from '../../common/validation/common.js'
import { createProductBody, productListQuery, updateProductBody } from './product.validation.js'
import * as productController from './product.controller.js'

export const productRouter = Router()

productRouter.get(
  '/',
  authenticate,
  authorize('product', 'read'),
  validate({ query: productListQuery }),
  productController.list,
)

productRouter.post(
  '/',
  authenticate,
  authorize('product', 'create'),
  validate({ body: createProductBody }),
  productController.create,
)

productRouter.get(
  '/:id',
  authenticate,
  authorize('product', 'read'),
  validate({ params: idParams }),
  productController.getById,
)

productRouter.patch(
  '/:id',
  authenticate,
  authorize('product', 'update'),
  validate({ params: idParams, body: updateProductBody }),
  productController.update,
)

productRouter.patch(
  '/:id/status',
  authenticate,
  authorize('product', 'update'),
  validate({ params: idParams, body: masterStatusBody }),
  productController.setStatus,
)
