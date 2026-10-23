import { env } from '../src/config/env.js'
import { connectDb } from '../src/config/db.js'
import { createApp } from '../src/app.js'
import { seedAuth } from '../src/seed/seedAuth.js'
import { Currency } from '../src/modules/currency/currency.model.js'
import { ProductCategory } from '../src/modules/productCategory/productCategory.model.js'
import { QuantityUnit } from '../src/modules/quantityUnit/quantityUnit.model.js'
import { Customer } from '../src/modules/customer/customer.model.js'
import { Sale } from '../src/modules/sale/sale.model.js'
import { SaleItem } from '../src/modules/sale/saleItem.model.js'
import { CustomerInvoice } from '../src/modules/receivables/customerInvoice.model.js'
import { CustomerReceipt } from '../src/modules/receivables/customerReceipt.model.js'
import { CustomerLedgerEntry } from '../src/modules/receivables/customerLedgerEntry.model.js'
import { StockBalance } from '../src/modules/inventory/stockBalance.model.js'
import { StockMovement } from '../src/modules/inventory/stockMovement.model.js'
import { Purchase } from '../src/modules/purchase/purchase.model.js'
import { PurchaseItem } from '../src/modules/purchase/purchaseItem.model.js'
import { SupplierInvoice } from '../src/modules/payables/supplierInvoice.model.js'
import { SupplierLedgerEntry } from '../src/modules/payables/supplierLedgerEntry.model.js'
import { Supplier } from '../src/modules/supplier/supplier.model.js'

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
let productId
let supplierId
let saleId

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
  assert(login.json.data.user.permissionCodes.includes('sale.create'), 'admin can create sales')
  assert(login.json.data.user.permissionCodes.includes('sale.post'), 'admin can post sales')
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
      name: 'Sales Branch',
      code: `sal-b-${stamp}`,
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
      code: `sal-w-${stamp}`,
      address: 'City Center',
    },
  })
  assertStatus(warehouse, 201, 'warehouse')
  warehouseId = warehouse.json.data._id

  const customer = await request('POST', '/api/v1/customers', {
    token,
    body: {
      code: `C-S-${stamp}`.toUpperCase().slice(0, 16),
      name: 'Harbor Kitchens',
      currencyId: pkr._id,
      creditLimit: '50000',
      paymentTerms: 'net_14',
      receivableAccount: 'AR Harbor',
      status: 'active',
    },
  })
  assertStatus(customer, 201, 'customer')
  customerId = customer.json.data._id

  const supplier = await request('POST', '/api/v1/suppliers', {
    token,
    body: {
      code: `S-S-${stamp}`.toUpperCase().slice(0, 16),
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
    name: 'Sales Category',
    code: `SAL-CAT-${stamp}`.toUpperCase(),
    status: 'active',
  })

  const product = await request('POST', '/api/v1/products', {
    token,
    body: {
      categoryId: category._id,
      sku: `sal-${stamp}`,
      name: 'Retail Pack',
      quantityUnitId: unit._id,
      costPrice: '10',
      salePrice: '25',
      reorderLevel: '5',
      status: 'active',
    },
  })
  assertStatus(product, 201, 'product')
  productId = product.json.data._id

  // Seed stock via purchase post
  const purchase = await request('POST', '/api/v1/purchases', {
    token,
    body: {
      branchId,
      warehouseId,
      supplierId,
      currencyId: pkr._id,
      purchaseDate: '2026-09-01',
      taxRate: '0',
      lines: [{ productId, quantity: '100', unitPrice: '10' }],
    },
  })
  assertStatus(purchase, 201, 'seed purchase')
  await request('POST', `/api/v1/purchases/${purchase.json.data._id}/approve`, { token })
  await request('POST', `/api/v1/purchases/${purchase.json.data._id}/post`, { token })

  const draft = await request('POST', '/api/v1/sales', {
    token,
    body: {
      branchId,
      warehouseId,
      customerId,
      currencyId: pkr._id,
      saleDate: '2026-10-01',
      taxRate: '5',
      shippingAmount: '45',
      paidAmount: '500',
      receiptMethod: 'bank',
      bankName: 'Meridian Bank',
      customerReference: 'CCG-PO-4882',
      notes: 'Deliver before 10:00 AM',
      createShipmentAfterPost: true,
      shippingMethod: 'standard',
      shippingEta: '2026-10-02',
      lines: [
        { productId, quantity: '10', unitPrice: '100', discountPercent: '5', taxRate: '5' },
      ],
    },
  })
  assertStatus(draft, 201, 'create sale')
  saleId = draft.json.data._id
  assert(draft.json.data.statusLabel === 'Draft', 'draft status')
  assert(draft.json.data.draftLabel.startsWith('Draft SL-'), 'draft label')
  assert(draft.json.data.formNote.includes('reserved when the sale is approved'), 'form note')
  assert(draft.json.data.customerReference === 'CCG-PO-4882', 'customer reference')
  assert(draft.json.data.notes === 'Deliver before 10:00 AM', 'internal note')
  assert(draft.json.data.terms === 'Net 14', 'terms from customer')
  // 10*100=1000, 5% disc=50, net=950, tax 5%=47.5, ship=45 → total 1042.5
  assert(draft.json.data.subtotal === '1000', 'subtotal')
  assert(draft.json.data.discount === '50', 'line discount')
  assert(draft.json.data.tax === '47.5', 'line tax')
  assert(draft.json.data.shippingAmount === '45', 'shipping')
  assert(draft.json.data.total === '1042.5', 'grand total')
  assert(draft.json.data.paidAmount === '500', 'paid amount')
  assert(draft.json.data.receivable === '542.5', 'receivable balance')
  assert(draft.json.data.paymentState === 'partially_paid', 'payment state')
  assert(draft.json.data.paymentStateLabel === 'Partially paid (PKR)', 'payment state label')
  assert(draft.json.data.createShipmentAfterPost === true, 'shipment toggle')
  assert(draft.json.data.shippingMethod === 'standard', 'shipping method')
  assert(draft.json.data.lines[0].discountLabel === '5%', 'line discount %')
  assert(draft.json.data.lines[0].taxLabel === '5%', 'line tax %')
  assert(draft.json.data.stockAvailable === true, 'stock available badge')
  assert(draft.json.data.stockUnchanged === true, 'draft no stock-out')
  assert(draft.json.data.canPost === false, 'cannot post while draft')
  assert(draft.json.data.postingPreview.lines[0].account === 'Customer AR', 'AR preview')

  const approved = await request('POST', `/api/v1/sales/${saleId}/approve`, { token })
  assertStatus(approved, 200, 'approve')
  assert(approved.json.data.statusLabel === 'Approved', 'approved label')
  assert(approved.json.data.workspaceStatusLabel === 'Approved', 'workspace approved')
  assert(approved.json.data.inventoryReserved === true, 'inventory reserved on approve')
  assert(approved.json.data.canPost === true, 'can post when approved')

  const stockBefore = await StockBalance.findOne({
    warehouseId,
    productId,
    inventoryItemId: null,
  }).lean()
  const beforeQty = stockBefore ? String(stockBefore.quantity) : '0'

  const posted = await request('POST', `/api/v1/sales/${saleId}/post`, { token })
  assertStatus(posted, 200, 'post')
  assert(posted.json.data.statusLabel === 'Posted', 'posted status')
  assert(posted.json.data.workspaceStatus === 'part_paid', 'part paid badge')
  assert(posted.json.data.workspaceStatusLabel === 'Part paid', 'part paid label')
  assert(posted.json.data.receivableInvoiceId, 'receivable invoice linked')
  assert(posted.json.data.receiptId, 'receipt linked')
  assert(posted.json.data.stockUnchanged === false, 'stock changed after post')

  const stockAfter = await StockBalance.findOne({
    warehouseId,
    productId,
    inventoryItemId: null,
  }).lean()
  assert(String(stockAfter.quantity) !== beforeQty, 'stock decreased')
  assert(
    await StockMovement.exists({ referenceId: saleId, movementType: 'sale' }),
    'sale movement created',
  )

  const invoice = await CustomerInvoice.findById(posted.json.data.receivableInvoiceId).lean()
  assert(invoice.invoiceNumber === posted.json.data.saleNumber, 'AR invoice uses SL number')
  assert(String(invoice.paidAmount) === '500', 'invoice allocated')

  const listed = await request(
    'GET',
    `/api/v1/sales?branchId=${branchId}&search=Harbor&limit=20`,
    { token },
  )
  assertStatus(listed, 200, 'sales register')
  const row = listed.json.data.find((item) => item._id === saleId)
  assert(row, 'register includes sale')
  assert(row.document === posted.json.data.saleNumber, 'document column')
  assert(row.customerName === 'Harbor Kitchens', 'customer column')
  assert(row.total === '1042.5', 'total column')
  assert(row.paidAmount === '500', 'paid column')
  assert(row.receivable === '542.5', 'receivable column')
  assert(row.workspaceStatusLabel === 'Part paid', 'status badge')

  const partPaid = await request(
    'GET',
    `/api/v1/sales?branchId=${branchId}&status=part_paid&limit=20`,
    { token },
  )
  assertStatus(partPaid, 200, 'part paid filter')
  assert(partPaid.json.data.some((item) => item._id === saleId), 'part paid list includes sale')

  const workspace = await request(
    'GET',
    `/api/v1/sales/workspace?branchId=${branchId}&month=2026-10&asOf=2026-10-01`,
    { token },
  )
  assertStatus(workspace, 200, 'workspace')
  assert(workspace.json.data.summary.netSales === '1042.5', 'net sales card')
  assert(Number(workspace.json.data.summary.receivable) >= 542.5, 'receivable card')
  assert(workspace.json.data.summary.averageOrder === '1043', 'average order')

  const cancelledDraft = await request('POST', '/api/v1/sales', {
    token,
    body: {
      branchId,
      warehouseId,
      customerId,
      currencyId: pkr._id,
      saleDate: '2026-09-29',
      lines: [{ productId, quantity: '1', unitPrice: '1980' }],
    },
  })
  assertStatus(cancelledDraft, 201, 'cancel candidate')
  const cancelled = await request('POST', `/api/v1/sales/${cancelledDraft.json.data._id}/cancel`, {
    token,
  })
  assertStatus(cancelled, 200, 'cancel')
  assert(cancelled.json.data.workspaceStatusLabel === 'Cancelled', 'cancelled badge')

  const specRes = await request('GET', '/openapi.json')
  assertStatus(specRes, 200, 'openapi')
  assert(specRes.json.paths['/api/v1/sales/workspace'], 'openapi documents workspace')
  assert(specRes.json.paths['/api/v1/sales'], 'openapi documents sales')
  assert(specRes.json.components.schemas.SalesWorkspace, 'openapi workspace schema')
  assert(specRes.json.components.schemas.SaleWrite, 'openapi sale write schema')

  console.log('sales checks passed')
} finally {
  try {
    if (saleId) {
      await SaleItem.deleteMany({ saleId })
      await Sale.deleteMany({ _id: saleId })
    }
    if (customerId) {
      await CustomerLedgerEntry.deleteMany({ customerId })
      await CustomerReceipt.deleteMany({ customerId })
      await CustomerInvoice.deleteMany({ customerId })
      await SaleItem.deleteMany({})
      await Sale.deleteMany({ customerId })
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
    // ignore cleanup errors
  }
  if (server) await new Promise((resolve) => server.close(resolve))
  await import('mongoose').then((m) => m.default.disconnect())
}
