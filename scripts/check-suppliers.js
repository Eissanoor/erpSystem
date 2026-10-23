import { env } from '../src/config/env.js'
import { connectDb } from '../src/config/db.js'
import { createApp } from '../src/app.js'
import { seedAuth } from '../src/seed/seedAuth.js'
import { Supplier } from '../src/modules/supplier/supplier.model.js'
import { Currency } from '../src/modules/currency/currency.model.js'
import { SupplierInvoice } from '../src/modules/payables/supplierInvoice.model.js'
import { SupplierPayment } from '../src/modules/payables/supplierPayment.model.js'
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
let supplierId
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
  assert(login.json.data.user.permissionCodes.includes('supplier.create'), 'admin can create suppliers')
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
  } else if (pkr.status !== 'active') {
    const activated = await request('PATCH', `/api/v1/currencies/${pkr._id}/status`, {
      token,
      body: { status: 'active' },
    })
    assertStatus(activated, 200, 'activate PKR')
    pkr = activated.json.data
  }

  const branch = await request('POST', '/api/v1/branches', {
    token,
    body: {
      name: 'Supplier Branch',
      code: `sup-b-${stamp}`,
      branchType: 'operating',
      address: 'City Center',
    },
  })
  assertStatus(branch, 201, 'branch')
  branchId = branch.json.data._id

  const code = `S-${stamp}`.toUpperCase().slice(0, 16)
  const created = await request('POST', '/api/v1/suppliers', {
    token,
    body: {
      code,
      name: 'Summit Foods',
      phone: '+92 300 1234567',
      email: `accounts-${stamp}@summitfoods.example.com`,
      address: '18 Market Road, Gulberg III, Lahore, Pakistan',
      currencyId: pkr._id,
      paymentTerms: 'net_30',
      payableAccount: '2100-0008',
      status: 'active',
    },
  })
  assertStatus(created, 201, 'create supplier')
  supplierId = created.json.data._id
  assert(created.json.data.code === code, 'supplier code stored uppercase')
  assert(created.json.data.paymentTermsLabel === 'Net 30', 'payment terms label')
  assert(created.json.data.currencyId.code === 'PKR', 'preferred currency is PKR')
  assert(created.json.data.payableAccountId === null, 'payable account id empty until chart of accounts')
  assert(created.json.data.postsLedger === false, 'create does not post ledger')
  assert(created.json.data.openingBalance === '0', 'no opening balance on create')

  const missing = await request('POST', '/api/v1/suppliers', {
    token,
    body: {
      code: `S-MISS-${stamp}`.toUpperCase().slice(0, 16),
      name: 'Missing terms',
      currencyId: pkr._id,
      payableAccount: 'AP',
    },
  })
  assertStatus(missing, 400, 'payment terms required')

  const duplicate = await request('POST', '/api/v1/suppliers', {
    token,
    body: {
      code,
      name: 'Duplicate',
      currencyId: pkr._id,
      paymentTerms: 'cash',
      payableAccount: 'AP',
    },
  })
  assertStatus(duplicate, 409, 'duplicate supplier code')

  // asOf 2026-10-01 → current 22800, overdue 1-30: 20000, outstanding 42800
  await request('POST', '/api/v1/supplier-payables/invoices', {
    token,
    body: {
      branchId,
      supplierId,
      currencyId: pkr._id,
      purchaseNumber: `PO-2594-${stamp}`.toUpperCase().slice(0, 24),
      invoiceDate: '2026-08-06',
      dueDate: '2026-09-05',
      amount: '8000',
    },
  })
  const openInv = await request('POST', '/api/v1/supplier-payables/invoices', {
    token,
    body: {
      branchId,
      supplierId,
      currencyId: pkr._id,
      purchaseNumber: `PO-2608-${stamp}`.toUpperCase().slice(0, 24),
      invoiceDate: '2026-08-11',
      dueDate: '2026-09-10',
      amount: '20600',
    },
  })
  assertStatus(openInv, 201, 'invoice for allocation')
  await request('POST', '/api/v1/supplier-payables/invoices', {
    token,
    body: {
      branchId,
      supplierId,
      currencyId: pkr._id,
      purchaseNumber: `PO-2630-${stamp}`.toUpperCase().slice(0, 24),
      invoiceDate: '2026-09-15',
      dueDate: '2026-10-15',
      amount: '12800',
    },
  })
  await request('POST', '/api/v1/supplier-payables/invoices', {
    token,
    body: {
      branchId,
      supplierId,
      currencyId: pkr._id,
      purchaseNumber: `PO-2640-${stamp}`.toUpperCase().slice(0, 24),
      invoiceDate: '2026-09-20',
      dueDate: '2026-10-20',
      amount: '10000',
    },
  })
  const payment = await request('POST', '/api/v1/supplier-payables/payments', {
    token,
    body: {
      branchId,
      supplierId,
      currencyId: pkr._id,
      paymentDate: '2026-09-30',
      amount: '8900',
      paymentMethod: 'bank',
      bankName: 'Meridian Bank',
      allocations: [{ invoiceId: openInv.json.data._id, amount: '8600' }],
    },
  })
  assertStatus(payment, 201, 'payment with advance remainder')

  const listed = await request(
    'GET',
    `/api/v1/suppliers?search=${encodeURIComponent(code)}&branchId=${branchId}&asOf=2026-10-01&limit=20`,
    { token },
  )
  assertStatus(listed, 200, 'supplier register')
  const row = listed.json.data.find((item) => item.code === code)
  assert(row, 'list includes the supplier')
  assert(row.outstanding === '42800', 'register outstanding column')
  assert(row.payables.current === '22800', 'register current bucket')
  assert(row.payables.overdue === '20000', 'register overdue')
  assert(listed.json.meta.summary.totalPayable === '42800', 'total payable card')
  assert(listed.json.meta.summary.current === '22800', 'current card')
  assert(listed.json.meta.summary.overdue1to30 === '20000', '1-30 card')
  assert(listed.json.meta.summary.overdueOver30 === '0', 'over 30 card')
  assert(listed.json.meta.summary.suppliersWithBalance === 1, 'suppliers with balance')
  assert(listed.json.meta.totals.outstanding === '42800', 'table footer total')

  const detail = await request(
    'GET',
    `/api/v1/suppliers/${supplierId}?branchId=${branchId}&asOf=2026-10-01`,
    { token },
  )
  assertStatus(detail, 200, 'supplier detail')
  assert(detail.json.data.email === `accounts-${stamp}@summitfoods.example.com`, 'detail keeps email')
  assert(detail.json.data.balanceNote.includes('posted entries'), 'balance note')
  assert(detail.json.data.payablesActivity.outstanding === '42800', 'detail outstanding')
  assert(detail.json.data.payablesActivity.current === '22800', 'detail current')
  assert(detail.json.data.payablesActivity.overdue === '20000', 'detail overdue')
  assert(detail.json.data.payablesActivity.unallocatedAdvance === '300', 'detail unallocated advance')
  assert(detail.json.data.payablesActivity.purchaseLedger.length === 4, 'purchase ledger rows')
  assert(detail.json.data.payablesActivity.latestAllocation.bankName === 'Meridian Bank', 'allocation bank')
  assert(detail.json.data.payablesActivity.latestAllocation.note.includes('PO-2608'), 'allocation note')

  const updated = await request('PATCH', `/api/v1/suppliers/${supplierId}`, {
    token,
    body: {
      paymentTerms: 'net_14',
      payableAccount: '2100-0008-A',
    },
  })
  assertStatus(updated, 200, 'update supplier')
  assert(updated.json.data.paymentTermsLabel === 'Net 14', 'payment terms updated')

  const inactive = await request('PATCH', `/api/v1/suppliers/${supplierId}/status`, {
    token,
    body: { status: 'inactive' },
  })
  assertStatus(inactive, 200, 'deactivate supplier')
  assert(inactive.json.data.statusLabel === 'Inactive', 'inactive status label')

  const specRes = await request('GET', '/openapi.json')
  assertStatus(specRes, 200, 'openapi')
  assert(specRes.json.paths['/api/v1/suppliers'], 'openapi documents suppliers')
  assert(specRes.json.paths['/api/v1/suppliers/{id}/status'], 'openapi documents supplier status')
  assert(specRes.json.components.schemas.Supplier, 'openapi documents supplier detail')
  assert(specRes.json.components.schemas.SupplierPageMeta, 'openapi documents register meta')

  console.log('supplier checks passed')
} finally {
  try {
    if (supplierId) {
      await SupplierLedgerEntry.deleteMany({ supplierId })
      await SupplierPayment.deleteMany({ supplierId })
      await SupplierInvoice.deleteMany({ supplierId })
      await Supplier.deleteMany({ _id: supplierId })
    }
    await Supplier.deleteMany({ code: { $regex: `^S-${stamp}`, $options: 'i' } })
  } catch {
    // ignore cleanup errors
  }
  if (server) await new Promise((resolve) => server.close(resolve))
  await import('mongoose').then((m) => m.default.disconnect())
}
