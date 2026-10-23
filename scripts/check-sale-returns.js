import { env } from '../src/config/env.js'
import { connectDb } from '../src/config/db.js'
import { createApp } from '../src/app.js'
import { seedAuth } from '../src/seed/seedAuth.js'
import { Currency } from '../src/modules/currency/currency.model.js'
import { ProductCategory } from '../src/modules/productCategory/productCategory.model.js'
import { QuantityUnit } from '../src/modules/quantityUnit/quantityUnit.model.js'
import { Customer } from '../src/modules/customer/customer.model.js'
import { Supplier } from '../src/modules/supplier/supplier.model.js'
import { Sale } from '../src/modules/sale/sale.model.js'
import { SaleItem } from '../src/modules/sale/saleItem.model.js'
import { SaleReturn } from '../src/modules/sale/saleReturn.model.js'
import { CustomerInvoice } from '../src/modules/receivables/customerInvoice.model.js'
import { CustomerReceipt } from '../src/modules/receivables/customerReceipt.model.js'
import { CustomerLedgerEntry } from '../src/modules/receivables/customerLedgerEntry.model.js'
import { StockBalance } from '../src/modules/inventory/stockBalance.model.js'
import { StockMovement } from '../src/modules/inventory/stockMovement.model.js'
import { Purchase } from '../src/modules/purchase/purchase.model.js'
import { PurchaseItem } from '../src/modules/purchase/purchaseItem.model.js'
import { SupplierInvoice } from '../src/modules/payables/supplierInvoice.model.js'
import { SupplierLedgerEntry } from '../src/modules/payables/supplierLedgerEntry.model.js'

function assert(condition, message) {
  if (!condition) throw new Error(message)
}

async function listen(app) {
  return new Promise((resolve) => {
    const server = app.listen(0, '127.0.0.1', () => resolve(server))
  })
}

function client(base) {
  return async function request(method, path, { token, body } = {}) {
    const headers = {}
    if (body !== undefined) headers['content-type'] = 'application/json'
    if (token) headers.authorization = `Bearer ${token}`
    const response = await fetch(`${base}${path}`, {
      method,
      headers,
      body: body === undefined ? undefined : JSON.stringify(body),
    })
    const json = await response.json()
    return { status: response.status, json }
  }
}

function assertStatus(response, status, label) {
  if (response.status !== status) {
    throw new Error(`${label}: expected ${status}, got ${response.status} ${JSON.stringify(response.json)}`)
  }
}

let server
const stamp = Date.now().toString(36)
let branchId
let warehouseId
let customerId
let supplierId
let productId
let saleId
let returnId

try {
  await connectDb()
  await seedAuth()
  const app = createApp()
  server = await listen(app)
  const request = client(`http://127.0.0.1:${server.address().port}`)

  const login = await request('POST', '/api/v1/auth/login', {
    body: { email: env.seedAdminEmail, password: env.seedAdminPassword },
  })
  assertStatus(login, 200, 'admin login')
  assert(login.json.data.user.permissionCodes.includes('sale_return.create'), 'can create returns')
  assert(login.json.data.user.permissionCodes.includes('sale_return.post'), 'can post returns')
  const token = login.json.data.accessToken

  let pkr = await Currency.findOne({ code: 'PKR' }).lean()
  if (!pkr) {
    const created = await request('POST', '/api/v1/currencies', {
      token,
      body: {
        name: 'Pakistani Rupee',
        code: 'PKR',
        symbol: 'Rs',
        decimalPlaces: 2,
        isBaseCurrency: true,
        status: 'active',
      },
    })
    assertStatus(created, 201, 'create PKR')
    pkr = created.json.data
  }

  const branch = await request('POST', '/api/v1/branches', {
    token,
    body: {
      name: 'Return Branch',
      code: `srr-b-${stamp}`,
      branchType: 'operating',
      address: 'City Center',
    },
  })
  assertStatus(branch, 201, 'branch')
  branchId = branch.json.data._id

  const warehouse = await request('POST', '/api/v1/warehouses', {
    token,
    body: {
      branchId,
      name: 'Main Warehouse',
      code: `srr-w-${stamp}`,
      address: 'City Center',
    },
  })
  assertStatus(warehouse, 201, 'warehouse')
  warehouseId = warehouse.json.data._id

  const customer = await request('POST', '/api/v1/customers', {
    token,
    body: {
      code: `C-R-${stamp}`.toUpperCase().slice(0, 16),
      name: 'Coastal Café Group',
      currencyId: pkr._id,
      creditLimit: '50000',
      paymentTerms: 'net_14',
      receivableAccount: 'AR Coastal',
      status: 'active',
    },
  })
  assertStatus(customer, 201, 'customer')
  customerId = customer.json.data._id

  const supplier = await request('POST', '/api/v1/suppliers', {
    token,
    body: {
      code: `S-R-${stamp}`.toUpperCase().slice(0, 16),
      name: 'Stock Supplier',
      currencyId: pkr._id,
      paymentTerms: 'cash',
      payableAccount: 'AP Stock',
      status: 'active',
    },
  })
  assertStatus(supplier, 201, 'supplier')
  supplierId = supplier.json.data._id

  let unit = await QuantityUnit.findOne({ shortCode: 'PCS' }).lean()
  if (!unit) {
    unit = await QuantityUnit.create({
      name: 'Piece',
      shortCode: 'PCS',
      decimalAllowed: false,
      status: 'active',
    })
  }

  const category = await ProductCategory.create({
    name: 'Return Category',
    code: `SRR-CAT-${stamp}`.toUpperCase(),
    status: 'active',
  })

  const product = await request('POST', '/api/v1/products', {
    token,
    body: {
      categoryId: category._id,
      sku: `srr-${stamp}`,
      name: 'Arabica Coffee 1 kg',
      quantityUnitId: unit._id,
      costPrice: '10.30',
      salePrice: '18.90',
      reorderLevel: '5',
      status: 'active',
    },
  })
  assertStatus(product, 201, 'product')
  productId = product.json.data._id

  const purchase = await request('POST', '/api/v1/purchases', {
    token,
    body: {
      branchId,
      warehouseId,
      supplierId,
      currencyId: pkr._id,
      purchaseDate: '2026-09-01',
      taxRate: '0',
      lines: [{ productId, quantity: '50', unitPrice: '10.30' }],
    },
  })
  assertStatus(purchase, 201, 'seed purchase')
  await request('POST', `/api/v1/purchases/${purchase.json.data._id}/approve`, { token })
  await request('POST', `/api/v1/purchases/${purchase.json.data._id}/post`, { token })

  const sale = await request('POST', '/api/v1/sales', {
    token,
    body: {
      branchId,
      warehouseId,
      customerId,
      currencyId: pkr._id,
      saleDate: '2026-09-26',
      taxRate: '5',
      lines: [{ productId, quantity: '24', unitPrice: '18.90', taxRate: '5' }],
    },
  })
  assertStatus(sale, 201, 'create sale')
  saleId = sale.json.data._id
  await request('POST', `/api/v1/sales/${saleId}/approve`, { token })
  const postedSale = await request('POST', `/api/v1/sales/${saleId}/post`, { token })
  assertStatus(postedSale, 200, 'post sale')

  const stockBefore = await StockBalance.findOne({
    warehouseId,
    productId,
    inventoryItemId: null,
  }).lean()
  const beforeQty = Number(String(stockBefore.quantity))

  const draft = await request('POST', '/api/v1/sale-returns', {
    token,
    body: {
      branchId,
      warehouseId,
      customerId,
      saleId,
      currencyId: pkr._id,
      returnDate: '2026-10-01',
      reason: 'Customer over-order',
      condition: 'unopened_resalable',
      returnNote:
        'Four unopened units accepted for return. Customer requests credit against the original invoice in PKR; no cash refund.',
      taxRate: '5',
      lines: [
        {
          saleItemId: sale.json.data.lines[0]._id,
          productId,
          quantity: '2',
          unitPrice: '18.90',
          taxRate: '5',
        },
      ],
    },
  })
  assertStatus(draft, 201, 'create return')
  returnId = draft.json.data._id
  assert(draft.json.data.statusLabel === 'Draft', 'draft status')
  assert(draft.json.data.conditionLabel === 'Unopened - Resalable', 'condition')
  assert(draft.json.data.reason === 'Customer over-order', 'reason')
  assert(draft.json.data.subtotal === '37.8', 'subtotal 2*18.90')
  assert(draft.json.data.tax === '1.89', 'tax 5%')
  assert(draft.json.data.total === '39.69', 'credit total')
  assert(draft.json.data.stockUnchanged === true, 'no stock on draft')
  assert(draft.json.data.canPost === false, 'cannot post draft')
  assert(draft.json.data.lines[0].soldQuantity === '24', 'sold qty on line')
  assert(draft.json.data.postingPreview.lines[0].account === 'Sales Returns', 'journal preview')
  assert(draft.json.data.history.length >= 1, 'history started')

  const approved = await request('POST', `/api/v1/sale-returns/${returnId}/approve`, { token })
  assertStatus(approved, 200, 'approve')
  assert(approved.json.data.statusSummary === 'Approved return', 'approved summary')
  assert(approved.json.data.canPost === true, 'can post')
  assert(approved.json.data.workflow.approved.current === true, 'workflow approved')
  assert(approved.json.data.stockUnchanged === true, 'approval does not move stock')

  const posted = await request('POST', `/api/v1/sale-returns/${returnId}/post`, { token })
  assertStatus(posted, 200, 'post')
  assert(posted.json.data.statusLabel === 'Posted', 'posted')
  assert(posted.json.data.stockUnchanged === false, 'stock changed')
  assert(
    await StockMovement.exists({ referenceId: returnId, movementType: 'sales_return' }),
    'sales_return movement',
  )

  const stockAfter = await StockBalance.findOne({
    warehouseId,
    productId,
    inventoryItemId: null,
  }).lean()
  assert(Number(String(stockAfter.quantity)) === beforeQty + 2, 'stock-in 2 units')

  const item = await SaleItem.findById(sale.json.data.lines[0]._id).lean()
  assert(String(item.returnedQuantity) === '2', 'sale line returned qty')

  const invoice = await CustomerInvoice.findById(postedSale.json.data.receivableInvoiceId).lean()
  assert(Number(String(invoice.paidAmount)) === 39.69, 'AR invoice credited via paidAmount')

  const ledger = await CustomerLedgerEntry.find({
    customerId,
    sourceType: 'sales_return',
  }).lean()
  assert(ledger.length >= 1, 'AR credit ledger entry')
  assert(String(ledger[0].credit) === '39.69', 'credit amount')

  const detail = await request('GET', `/api/v1/sale-returns/${returnId}`, { token })
  assertStatus(detail, 200, 'detail')
  assert(detail.json.data.saleId.saleNumber === postedSale.json.data.saleNumber, 'original sale')
  assert(
    detail.json.data.stockImpactSummary.toLowerCase().includes('credit'),
    'impact summary',
  )

  const specRes = await request('GET', '/openapi.json')
  assertStatus(specRes, 200, 'openapi')
  assert(specRes.json.paths['/api/v1/sale-returns'], 'openapi documents sale returns')
  assert(specRes.json.components.schemas.SaleReturn, 'openapi SaleReturn schema')

  console.log('sale-return checks passed')
} finally {
  try {
    if (returnId) await SaleReturn.deleteMany({ _id: returnId })
    if (saleId) {
      await SaleItem.deleteMany({ saleId })
      await Sale.deleteMany({ _id: saleId })
    }
    if (customerId) {
      await CustomerLedgerEntry.deleteMany({ customerId })
      await CustomerReceipt.deleteMany({ customerId })
      await CustomerInvoice.deleteMany({ customerId })
      await Customer.deleteMany({ _id: customerId })
    }
    if (supplierId) {
      await SupplierLedgerEntry.deleteMany({ supplierId })
      await SupplierInvoice.deleteMany({ supplierId })
      await PurchaseItem.deleteMany({})
      await Purchase.deleteMany({ supplierId })
      await Supplier.deleteMany({ _id: supplierId })
    }
    if (productId) {
      await StockMovement.deleteMany({ productId })
      await StockBalance.deleteMany({ productId })
    }
  } catch {
    // ignore
  }
  if (server) await new Promise((resolve) => server.close(resolve))
  await import('mongoose').then((m) => m.default.disconnect())
}
