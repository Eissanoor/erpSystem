import { env } from '../src/config/env.js'
import { connectDb } from '../src/config/db.js'
import { createApp } from '../src/app.js'
import { seedAuth } from '../src/seed/seedAuth.js'
import { Currency } from '../src/modules/currency/currency.model.js'
import { ProductCategory } from '../src/modules/productCategory/productCategory.model.js'
import { QuantityUnit } from '../src/modules/quantityUnit/quantityUnit.model.js'
import { Product } from '../src/modules/product/product.model.js'
import { Supplier } from '../src/modules/supplier/supplier.model.js'
import { Purchase } from '../src/modules/purchase/purchase.model.js'
import { PurchaseItem } from '../src/modules/purchase/purchaseItem.model.js'
import { PurchaseReturn } from '../src/modules/purchase/purchaseReturn.model.js'
import { SupplierInvoice } from '../src/modules/payables/supplierInvoice.model.js'
import { SupplierLedgerEntry } from '../src/modules/payables/supplierLedgerEntry.model.js'
import { StockBalance } from '../src/modules/inventory/stockBalance.model.js'
import { StockMovement } from '../src/modules/inventory/stockMovement.model.js'

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
let supplierId
let productId

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
  assert(login.json.data.user.permissionCodes.includes('purchase.create'), 'admin can create purchases')
  assert(login.json.data.user.permissionCodes.includes('purchase.post'), 'admin can post purchases')
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
      name: 'Purchase Branch',
      code: `pur-b-${stamp}`,
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
      code: `pur-w-${stamp}`,
      address: 'City Center',
    },
  })
  assertStatus(warehouse, 201, 'warehouse')
  warehouseId = warehouse.json.data._id

  const supplier = await request('POST', '/api/v1/suppliers', {
    token,
    body: {
      code: `S-P-${stamp}`.toUpperCase().slice(0, 16),
      name: 'Atlas Foods Trading',
      currencyId: pkr._id,
      paymentTerms: 'net_30',
      payableAccount: 'AP Atlas',
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

  let category = await ProductCategory.findOne({ code: `PUR-CAT-${stamp}`.toUpperCase() }).lean()
  if (!category) {
    category = await ProductCategory.create({
      name: 'Purchase Category',
      code: `PUR-CAT-${stamp}`.toUpperCase(),
      status: 'active',
    })
  }

  const product = await request('POST', '/api/v1/products', {
    token,
    body: {
      categoryId: category._id,
      sku: `pur-${stamp}`,
      name: 'Bulk Sugar 25 kg',
      quantityUnitId: unit._id,
      costPrice: '12.40',
      salePrice: '18.90',
      reorderLevel: '10',
      status: 'active',
    },
  })
  assertStatus(product, 201, 'product')
  productId = product.json.data._id

  const month = '2026-09'
  const draft = await request('POST', '/api/v1/purchases', {
    token,
    body: {
      branchId,
      warehouseId,
      supplierId,
      currencyId: pkr._id,
      purchaseDate: '2026-09-30',
      supplierInvoiceNo: 'SF-INV-2684',
      receivedByName: 'Sara Noor',
      taxRate: '5',
      discountMethod: 'document',
      paidAmount: '0',
      receivingNote: 'CF-2610-A - Inspect on arrival',
      notes: 'Replenish low-stock coffee and cleaner',
      lines: [{ productId, quantity: '10', unitPrice: '1842', discountAmount: '0' }],
    },
  })
  assertStatus(draft, 201, 'create purchase')
  assert(draft.json.data.statusLabel === 'Draft', 'draft status')
  assert(draft.json.data.workflow.draft.current === true, 'workflow highlights draft')
  assert(draft.json.data.receivingStateLabel === 'Ordered', 'starts ordered')
  assert(draft.json.data.supplierInvoiceNo === 'SF-INV-2684', 'supplier invoice stored')
  assert(draft.json.data.receivedByName === 'Sara Noor', 'received by stored')
  assert(draft.json.data.subtotal === '18420', 'gross subtotal')
  assert(draft.json.data.netSubtotal === '18420', 'net subtotal')
  assert(draft.json.data.tax === '921', '5% tax of net')
  assert(draft.json.data.total === '19341', 'grand total')
  assert(draft.json.data.balanceAmount === '19341', 'full credit balance')
  assert(draft.json.data.totals.grandTotal === '19341', 'totals sidebar')
  assert(draft.json.data.postingPreview.lines.length === 3, 'posting preview journal')
  assert(draft.json.data.postingPreview.lines[0].account === 'Inventory', 'inventory DR preview')
  assert(draft.json.data.stockUnchanged === true, 'draft has no stock-in')
  assert(draft.json.data.canPost === false, 'cannot post while draft')
  assert(draft.json.data.lines.length === 1, 'lines returned')
  assert(draft.json.data.lines[0].lineNet === '18420', 'line net')

  const locked = await request('PATCH', `/api/v1/purchases/${draft.json.data._id}`, {
    token,
    body: { notes: 'before approve' },
  })
  assertStatus(locked, 200, 'patch draft')

  const approved = await request('POST', `/api/v1/purchases/${draft.json.data._id}/approve`, { token })
  assertStatus(approved, 200, 'approve')
  assert(approved.json.data.statusLabel === 'Approved', 'approved label')

  const patchApproved = await request('PATCH', `/api/v1/purchases/${draft.json.data._id}`, {
    token,
    body: { notes: 'nope' },
  })
  assertStatus(patchApproved, 409, 'patch approved locked')

  const receivePart = await request('POST', `/api/v1/purchases/${draft.json.data._id}/receive`, {
    token,
    body: {
      lines: [{ itemId: draft.json.data.lines[0]._id, quantity: '4' }],
    },
  })
  assertStatus(receivePart, 200, 'part receive')
  assert(receivePart.json.data.receivingStateLabel === 'Part received', 'part received label')
  assert(receivePart.json.data.lines[0].receivedQuantity === '4', 'received qty')

  const stock = await StockBalance.findOne({
    warehouseId,
    productId,
    inventoryItemId: null,
  }).lean()
  assert(String(stock.quantity) === '4', 'stock increased on receive')

  const posted = await request('POST', `/api/v1/purchases/${draft.json.data._id}/post`, { token })
  assertStatus(posted, 200, 'post purchase')
  assert(posted.json.data.statusLabel === 'Posted', 'posted label')
  assert(posted.json.data.workflow.posted.done === true, 'workflow marks posted')
  assert(posted.json.data.receivingStateLabel === 'Received', 'post receives remaining qty')
  assert(posted.json.data.payableInvoiceId, 'payable invoice linked')
  assert(posted.json.data.stockUnchanged === false, 'posted has stock impact')

  const stockPosted = await StockBalance.findOne({
    warehouseId,
    productId,
    inventoryItemId: null,
  }).lean()
  assert(String(stockPosted.quantity) === '10', 'post receives remaining 6 into stock')

  const invoice = await SupplierInvoice.findById(posted.json.data.payableInvoiceId).lean()
  assert(invoice, 'payable invoice exists')
  assert(String(invoice.amount) === '19341', 'payable amount matches grand total')
  assert(invoice.purchaseNumber === posted.json.data.purchaseNumber, 'same PO number')

  const second = await request('POST', '/api/v1/purchases', {
    token,
    body: {
      branchId,
      warehouseId,
      supplierId,
      currencyId: pkr._id,
      purchaseDate: '2026-09-28',
      lines: [{ productId, quantity: '2', unitPrice: '9430' }],
    },
  })
  assertStatus(second, 201, 'second purchase')
  await request('POST', `/api/v1/purchases/${second.json.data._id}/approve`, { token })
  const qc = await request('POST', `/api/v1/purchases/${second.json.data._id}/receive`, {
    token,
    body: {
      qualityCheck: true,
      lines: [{ itemId: second.json.data.lines[0]._id, quantity: '1' }],
    },
  })
  assertStatus(qc, 200, 'quality check receive')
  assert(qc.json.data.receivingStateLabel === 'Quality check', 'quality check label')

  const ret = await request('POST', '/api/v1/purchase-returns', {
    token,
    body: {
      branchId,
      warehouseId,
      supplierId,
      purchaseId: posted.json.data._id,
      currencyId: pkr._id,
      returnDate: '2026-09-29',
      reason: 'Incorrect items supplied',
      supplierAuthorization: 'SF-RMA-0094',
      supplierNote:
        'Supplier accepted unopened goods supplied against the wrong order. Credit note requested.',
      taxRate: '5',
      lines: [
        {
          purchaseItemId: posted.json.data.lines[0]._id,
          productId,
          batchNumber: 'CF-2609-A',
          quantity: '1',
          unitPrice: '1842',
        },
      ],
    },
  })
  assertStatus(ret, 201, 'create return')
  assert(ret.json.data.statusLabel === 'Draft', 'return draft')
  assert(ret.json.data.workflow.draft.current === true, 'workflow draft')
  assert(ret.json.data.reason === 'Incorrect items supplied', 'reason stored')
  assert(ret.json.data.supplierAuthorization === 'SF-RMA-0094', 'RMA stored')
  assert(ret.json.data.subtotal === '1842', 'return subtotal')
  assert(ret.json.data.tax === '92.1', 'tax reversal 5%')
  assert(ret.json.data.total === '1934.1', 'supplier credit total')
  assert(ret.json.data.totals.supplierCredit === '1934.1', 'sidebar supplier credit')
  assert(ret.json.data.postingPreview.lines[0].account === 'Supplier AP', 'AP DR preview')
  assert(ret.json.data.stockUnchanged === true, 'no stock-out while draft')
  assert(ret.json.data.canPost === false, 'cannot post while draft')
  assert(ret.json.data.history.length >= 1, 'audit history started')

  const approvedRet = await request('POST', `/api/v1/purchase-returns/${ret.json.data._id}/approve`, {
    token,
  })
  assertStatus(approvedRet, 200, 'approve return')
  assert(approvedRet.json.data.statusLabel === 'Approved', 'approved label')
  assert(approvedRet.json.data.canPost === true, 'can post when approved')
  assert(approvedRet.json.data.workflow.approved.current === true, 'workflow approved')

  const credited = await request('POST', `/api/v1/purchase-returns/${ret.json.data._id}/post`, {
    token,
  })
  assertStatus(credited, 200, 'post return')
  assert(credited.json.data.statusLabel === 'Posted', 'posted label')
  assert(credited.json.data.stockUnchanged === false, 'stock moved on post')
  assert(credited.json.data.workspaceLabel === 'Credited', 'workspace alias for posted')

  const stockAfter = await StockBalance.findOne({
    warehouseId,
    productId,
    inventoryItemId: null,
  }).lean()
  // first PO posted to 10, second PO +1 → 11, return −1 → 10
  assert(String(stockAfter.quantity) === '10', 'stock after return credit')

  const workspace = await request(
    'GET',
    `/api/v1/purchases/workspace?branchId=${branchId}&month=${month}`,
    { token },
  )
  assertStatus(workspace, 200, 'workspace')
  assert(Number(workspace.json.data.summary.monthPurchases) >= 18420, 'month purchases card')
  assert(workspace.json.data.summary.openOrders >= 1, 'open orders card')
  assert(Number(workspace.json.data.summary.returnsTotal) >= 1842, 'returns card')
  assert(Number(workspace.json.data.receivingPipeline.part_received) >= 0, 'pipeline part received')
  assert(workspace.json.data.recentReturns.some((row) => row.returnNumber === credited.json.data.returnNumber), 'recent returns')

  const listed = await request(
    'GET',
    `/api/v1/purchases?branchId=${branchId}&receivingState=received&limit=20`,
    { token },
  )
  assertStatus(listed, 200, 'list purchases')
  assert(
    listed.json.data.some((row) => row.purchaseNumber === posted.json.data.purchaseNumber),
    'list filters receiving state',
  )

  const doublePost = await request('POST', `/api/v1/purchases/${posted.json.data._id}/post`, { token })
  assertStatus(doublePost, 400, 'double post rejected')

  const specRes = await request('GET', '/openapi.json')
  assertStatus(specRes, 200, 'openapi')
  assert(specRes.json.paths['/api/v1/purchases/workspace'], 'openapi workspace')
  assert(specRes.json.paths['/api/v1/purchases/{id}/receive'], 'openapi receive')
  assert(specRes.json.paths['/api/v1/purchase-returns/{id}/approve'], 'openapi return approve')
  assert(specRes.json.paths['/api/v1/purchase-returns/{id}/post'], 'openapi return post')
  assert(specRes.json.components.schemas.PurchasesWorkspace, 'openapi workspace schema')
  assert(specRes.json.components.schemas.PurchaseReturn, 'openapi return detail')

  console.log('purchase checks passed')
} finally {
  try {
    const purchases = await Purchase.find({
      branchId,
    })
      .select('_id purchaseNumber')
      .lean()
    const purchaseIds = purchases.map((row) => row._id)
    const numbers = purchases.map((row) => row.purchaseNumber)
    await PurchaseItem.deleteMany({ purchaseId: { $in: purchaseIds } })
    await PurchaseReturn.deleteMany({ branchId })
    await Purchase.deleteMany({ _id: { $in: purchaseIds } })
    await SupplierInvoice.deleteMany({ purchaseNumber: { $in: numbers } })
    await SupplierLedgerEntry.deleteMany({
      $or: [{ sourceNumber: { $in: numbers } }, { supplierId }],
    })
    await StockMovement.deleteMany({ productId })
    await StockBalance.deleteMany({ productId })
    if (productId) await Product.deleteMany({ _id: productId })
    if (supplierId) await Supplier.deleteMany({ _id: supplierId })
  } catch {
    // ignore cleanup errors
  }
  if (server) await new Promise((resolve) => server.close(resolve))
  await import('mongoose').then((m) => m.default.disconnect())
}
