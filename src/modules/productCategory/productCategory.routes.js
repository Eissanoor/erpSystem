import { Router } from 'express'
import { validate } from '../../common/middleware/validate.js'
import { authenticate } from '../../common/middleware/authenticate.js'
import { authorize } from '../../common/middleware/authorize.js'
import { idParams, masterStatusBody } from '../../common/validation/common.js'
import { categoryDetailQuery, categoryListQuery, createCategoryBody, updateCategoryBody } from './productCategory.validation.js'
import * as categoryController from './productCategory.controller.js'

export const productCategoryRouter = Router()

productCategoryRouter.get(
  '/',
  authenticate,
  authorize('product_category', 'read'),
  validate({ query: categoryListQuery }),
  categoryController.list,
)

productCategoryRouter.post(
  '/',
  authenticate,
  authorize('product_category', 'create'),
  validate({ body: createCategoryBody }),
  categoryController.create,
)

productCategoryRouter.get(
  '/tree',
  authenticate,
  authorize('product_category', 'read'),
  categoryController.tree,
)

productCategoryRouter.get(
  '/:id',
  authenticate,
  authorize('product_category', 'read'),
  validate({ params: idParams, query: categoryDetailQuery }),
  categoryController.getById,
)

productCategoryRouter.patch(
  '/:id',
  authenticate,
  authorize('product_category', 'update'),
  validate({ params: idParams, body: updateCategoryBody }),
  categoryController.update,
)

productCategoryRouter.patch(
  '/:id/status',
  authenticate,
  authorize('product_category', 'update'),
  validate({ params: idParams, body: masterStatusBody }),
  categoryController.setStatus,
)
