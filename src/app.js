import { randomUUID } from 'node:crypto'
import express from 'express'
import helmet from 'helmet'
import cors from 'cors'
import compression from 'compression'
import morgan from 'morgan'
import { apiReference } from '@scalar/express-api-reference'
import { env } from './config/env.js'
import { dbStatus } from './config/db.js'
import { asyncHandler } from './common/utils/asyncHandler.js'
import { sendSuccess } from './common/utils/ApiResponse.js'
import { notFound } from './common/middleware/notFound.js'
import { errorHandler } from './common/middleware/errorHandler.js'
import { buildOpenApiSpec } from './docs/openapi.js'
import { authRouter } from './modules/auth/auth.routes.js'
import { userRouter } from './modules/user/user.routes.js'
import { roleRouter } from './modules/role/role.routes.js'
import { permissionRouter } from './modules/permission/permission.routes.js'
import { branchRouter } from './modules/branch/branch.routes.js'
import { warehouseRouter } from './modules/warehouse/warehouse.routes.js'
import { shopRouter } from './modules/shop/shop.routes.js'
import { employeeRouter } from './modules/employee/employee.routes.js'
import { ownerRouter } from './modules/owner/owner.routes.js'
import { partnershipRouter } from './modules/partnership/partnership.routes.js'
import { currencyRouter } from './modules/currency/currency.routes.js'
import { productCategoryRouter } from './modules/productCategory/productCategory.routes.js'
import { quantityUnitRouter } from './modules/quantityUnit/quantityUnit.routes.js'
import { packingUnitRouter } from './modules/packingUnit/packingUnit.routes.js'
import { productRouter } from './modules/product/product.routes.js'
import { stockBalanceRouter } from './modules/inventory/stockBalance.routes.js'
import { inventoryItemRouter } from './modules/inventory/inventoryItem.routes.js'
import { stockMovementRouter } from './modules/inventory/stockMovement.routes.js'
import { transferRouter } from './modules/inventory/transfer.routes.js'
import { adjustmentRouter } from './modules/inventory/adjustment.routes.js'
import { damageRouter } from './modules/inventory/damage.routes.js'
import { supplierRouter } from './modules/supplier/supplier.routes.js'
import { customerRouter } from './modules/customer/customer.routes.js'
import { payablesRouter } from './modules/payables/payables.routes.js'
import { receivablesRouter } from './modules/receivables/receivables.routes.js'
import { purchaseRouter, purchaseReturnRouter } from './modules/purchase/purchase.routes.js'
import { saleRouter } from './modules/sale/sale.routes.js'
import { saleReturnRouter } from './modules/sale/saleReturn.routes.js'

function requestOrigin(req) {
  const forwarded = req.get('x-forwarded-proto')
  const proto = forwarded ? forwarded.split(',')[0].trim() : req.protocol
  return `${proto}://${req.get('host')}`
}

export function createApp() {
  const app = express()

  app.use(
    helmet({
      contentSecurityPolicy: false,
      crossOriginEmbedderPolicy: false,
      crossOriginResourcePolicy: { policy: 'cross-origin' },
      strictTransportSecurity: env.isProduction,
    }),
  )
  app.use((req, res, next) => {
    res.setHeader('Access-Control-Allow-Private-Network', 'true')
    next()
  })
  app.use(
    cors({
      origin: true,
      credentials: true,
      allowedHeaders: ['Content-Type', 'Authorization', 'Accept', 'X-Request-Id'],
    }),
  )
  app.use(compression({ threshold: 1024 }))
  app.use(express.json({ limit: '1mb' }))
  app.use((req, res, next) => {
    const requestId = req.get('x-request-id') || randomUUID()
    req.id = requestId
    res.setHeader('x-request-id', requestId)
    next()
  })

  if (!env.isProduction) {
    app.use(morgan('dev'))
  }

  app.get(
    '/health',
    asyncHandler(async (req, res) => {
      const db = dbStatus()
      sendSuccess(res, {
        message: db === 'up' ? 'Healthy' : 'Database unavailable',
        data: { db },
        statusCode: db === 'up' ? 200 : 503,
      })
    }),
  )

  app.get('/openapi.json', (req, res) => {
    res.json(buildOpenApiSpec(requestOrigin(req)))
  })

  app.use('/docs', (req, res) => {
    apiReference({
      content: buildOpenApiSpec(requestOrigin(req)),
      // Scalar's hosted proxy cannot reach localhost and the browser shows that as "Failed to fetch".
      proxyUrl: '',
    })(req, res)
  })

  app.use('/api/v1/auth', authRouter)
  app.use('/api/v1/users', userRouter)
  app.use('/api/v1/roles', roleRouter)
  app.use('/api/v1/permissions', permissionRouter)
  app.use('/api/v1/branches', branchRouter)
  app.use('/api/v1/warehouses', warehouseRouter)
  app.use('/api/v1/shops', shopRouter)
  app.use('/api/v1/employees', employeeRouter)
  app.use('/api/v1/owners', ownerRouter)
  app.use('/api/v1/partnerships', partnershipRouter)
  app.use('/api/v1/currencies', currencyRouter)
  app.use('/api/v1/product-categories', productCategoryRouter)
  app.use('/api/v1/quantity-units', quantityUnitRouter)
  app.use('/api/v1/packing-units', packingUnitRouter)
  app.use('/api/v1/products', productRouter)
  app.use('/api/v1/stock-balances', stockBalanceRouter)
  app.use('/api/v1/inventory-items', inventoryItemRouter)
  app.use('/api/v1/stock-movements', stockMovementRouter)
  app.use('/api/v1/transfers', transferRouter)
  app.use('/api/v1/adjustments', adjustmentRouter)
  app.use('/api/v1/damages', damageRouter)
  app.use('/api/v1/suppliers', supplierRouter)
  app.use('/api/v1/customers', customerRouter)
  app.use('/api/v1/supplier-payables', payablesRouter)
  app.use('/api/v1/customer-receivables', receivablesRouter)
  app.use('/api/v1/purchases', purchaseRouter)
  app.use('/api/v1/purchase-returns', purchaseReturnRouter)
  app.use('/api/v1/sales', saleRouter)
  app.use('/api/v1/sale-returns', saleReturnRouter)

  app.use(notFound)
  app.use(errorHandler)

  return app
}
