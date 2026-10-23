import { env } from '../src/config/env.js'
import { connectDb } from '../src/config/db.js'
import { createApp } from '../src/app.js'
import { seedAuth } from '../src/seed/seedAuth.js'
import { Customer } from '../src/modules/customer/customer.model.js'
import { Currency } from '../src/modules/currency/currency.model.js'
import { CustomerInvoice } from '../src/modules/receivables/customerInvoice.model.js'
import { CustomerReceipt } from '../src/modules/receivables/customerReceipt.model.js'
import { CustomerLedgerEntry } from '../src/modules/receivables/customerLedgerEntry.model.js'

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
let customerId
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
  assert(login.json.data.user.permissionCodes.includes('customer.create'), 'admin can create customers')
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
      name: 'Customer Branch',
      code: `cus-b-${stamp}`,
      branchType: 'operating',
      address: 'City Center',
    },
  })
  assertStatus(branch, 201, 'branch')
  branchId = branch.json.data._id

  const code = `C-${stamp}`.toUpperCase().slice(0, 16)
  const created = await request('POST', '/api/v1/customers', {
    token,
    body: {
      code,
      name: 'Coastal Café Group',
      contactName: 'Maya Reed',
      phone: '+92 300 1234567',
      email: `maya-${stamp}@coastalcafe.local`,
      address: '18 Market Road, Gulberg III, Lahore, Pakistan',
      currencyId: pkr._id,
      creditLimit: '25000.00',
      paymentTerms: 'net_14',
      receivableAccount: '1200-0018',
      status: 'active',
    },
  })
  assertStatus(created, 201, 'create customer')
  customerId = created.json.data._id
  assert(created.json.data.code === code, 'customer code stored uppercase')
  assert(created.json.data.contactName === 'Maya Reed', 'contact name')
  assert(created.json.data.contact === 'Maya Reed', 'contact column')
  assert(created.json.data.paymentTermsLabel === 'Net 14', 'payment terms label')
  assert(created.json.data.arApAccount.label === '1200-0018 / --', 'AR/AP label')
  assert(created.json.data.receivable === '0', 'no receivable on create')
  assert(created.json.data.payable === '0', 'payable always 0 on customer')
  assert(created.json.data.postsLedger === false, 'create does not post ledger')

  const missing = await request('POST', '/api/v1/customers', {
    token,
    body: {
      code: `C-MISS-${stamp}`.toUpperCase().slice(0, 16),
      name: 'Missing terms',
      currencyId: pkr._id,
      receivableAccount: 'AR',
    },
  })
  assertStatus(missing, 400, 'payment terms required')

  const duplicate = await request('POST', '/api/v1/customers', {
    token,
    body: {
      code,
      name: 'Duplicate',
      currencyId: pkr._id,
      paymentTerms: 'cash',
      receivableAccount: 'AR',
    },
  })
  assertStatus(duplicate, 409, 'duplicate customer code')

  // asOf 2026-10-01 → current 8400 + overdue 10000 = 18400 after partial receipt
  await request('POST', '/api/v1/customer-receivables/invoices', {
    token,
    body: {
      branchId,
      customerId,
      currencyId: pkr._id,
      invoiceNumber: `SL-9052-${stamp}`.toUpperCase().slice(0, 24),
      invoiceDate: '2026-09-03',
      dueDate: '2026-09-17',
      amount: '15000',
    },
  })
  const openInv = await request('POST', '/api/v1/customer-receivables/invoices', {
    token,
    body: {
      branchId,
      customerId,
      currencyId: pkr._id,
      invoiceNumber: `SL-9060-${stamp}`.toUpperCase().slice(0, 24),
      invoiceDate: '2026-09-20',
      dueDate: '2026-10-04',
      amount: '8400',
    },
  })
  assertStatus(openInv, 201, 'current invoice')
  const overdueInv = await CustomerInvoice.findOne({
    customerId,
    invoiceNumber: { $regex: '^SL-9052' },
  }).lean()
  const payment = await request('POST', '/api/v1/customer-receivables/receipts', {
    token,
    body: {
      branchId,
      customerId,
      currencyId: pkr._id,
      receiptDate: '2026-09-30',
      amount: '5000',
      receiptMethod: 'bank',
      bankName: 'Meridian Bank',
      allocations: [{ invoiceId: overdueInv._id, amount: '5000' }],
    },
  })
  assertStatus(payment, 201, 'receipt')

  const listed = await request(
    'GET',
    `/api/v1/customers?search=${encodeURIComponent(code)}&branchId=${branchId}&asOf=2026-10-01&limit=20`,
    { token },
  )
  assertStatus(listed, 200, 'customer register')
  const row = listed.json.data.find((item) => item.code === code)
  assert(row, 'list includes the customer')
  assert(row.contact === 'Maya Reed', 'register contact column')
  assert(row.receivable === '18400', 'register receivable')
  assert(row.outstanding === '18400', 'register outstanding')
  assert(row.payable === '0', 'register payable')
  assert(row.availableCredit === '6600', 'available credit 25000-18400')
  assert(listed.json.meta.summary.receivableBalance === '18400', 'receivable balance card')
  assert(listed.json.meta.summary.creditCustomers >= 1, 'credit customers card')
  assert(listed.json.meta.summary.active >= 1, 'active count')
  assert(listed.json.meta.totals.receivable === '18400', 'table footer receivable')

  const detail = await request(
    'GET',
    `/api/v1/customers/${customerId}?branchId=${branchId}&asOf=2026-10-01`,
    { token },
  )
  assertStatus(detail, 200, 'customer detail')
  assert(detail.json.data.email === `maya-${stamp}@coastalcafe.local`, 'detail keeps email')
  assert(detail.json.data.creditLimit === '25000', 'detail credit limit')
  assert(detail.json.data.availableCredit === '6600', 'detail available credit')
  assert(detail.json.data.balanceNote.includes('stay separate'), 'party accounts note')
  assert(detail.json.data.ledgerPath.includes('/ledger'), 'open ledger path')
  assert(detail.json.data.receivablesActivity.outstanding === '18400', 'activity outstanding')
  assert(detail.json.data.receivablesActivity.overdue === '10000', 'activity overdue')

  const updated = await request('PATCH', `/api/v1/customers/${customerId}`, {
    token,
    body: {
      contactName: 'Maya Reed-Updated',
      receivableAccount: '1200-0018-A',
    },
  })
  assertStatus(updated, 200, 'update customer')
  assert(updated.json.data.contactName === 'Maya Reed-Updated', 'contact updated')

  const inactive = await request('PATCH', `/api/v1/customers/${customerId}/status`, {
    token,
    body: { status: 'inactive' },
  })
  assertStatus(inactive, 200, 'deactivate customer')
  assert(inactive.json.data.statusLabel === 'Inactive', 'inactive status label')

  const specRes = await request('GET', '/openapi.json')
  assertStatus(specRes, 200, 'openapi')
  assert(specRes.json.paths['/api/v1/customers'], 'openapi documents customers')
  assert(specRes.json.components.schemas.CustomerPageMeta, 'openapi documents register meta')

  console.log('customer checks passed')
} finally {
  try {
    if (customerId) {
      await CustomerLedgerEntry.deleteMany({ customerId })
      await CustomerReceipt.deleteMany({ customerId })
      await CustomerInvoice.deleteMany({ customerId })
      await Customer.deleteMany({ _id: customerId })
    }
    await Customer.deleteMany({ code: { $regex: `^C-${stamp}`, $options: 'i' } })
  } catch {
    // ignore cleanup errors
  }
  if (server) await new Promise((resolve) => server.close(resolve))
  await import('mongoose').then((m) => m.default.disconnect())
}
