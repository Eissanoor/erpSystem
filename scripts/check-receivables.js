import { env } from '../src/config/env.js'
import { connectDb } from '../src/config/db.js'
import { createApp } from '../src/app.js'
import { seedAuth } from '../src/seed/seedAuth.js'
import { Currency } from '../src/modules/currency/currency.model.js'
import { Customer } from '../src/modules/customer/customer.model.js'
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
const asOf = '2026-10-01'
let branchId
let coastalId
let harborId

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
  assert(login.json.data.user.permissionCodes.includes('receivable.create'), 'admin can create receivables')
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
      name: 'Receivables Branch',
      code: `ar-b-${stamp}`,
      branchType: 'operating',
      address: 'City Center',
    },
  })
  assertStatus(branch, 201, 'branch')
  branchId = branch.json.data._id

  const coastal = await request('POST', '/api/v1/customers', {
    token,
    body: {
      code: `C-18-${stamp}`.toUpperCase().slice(0, 16),
      name: 'Coastal Café Group',
      currencyId: pkr._id,
      creditLimit: '25000',
      paymentTerms: 'net_14',
      receivableAccount: 'AR 1200-0018',
      status: 'active',
    },
  })
  assertStatus(coastal, 201, 'coastal customer')
  coastalId = coastal.json.data._id

  const harbor = await request('POST', '/api/v1/customers', {
    token,
    body: {
      code: `C-19-${stamp}`.toUpperCase().slice(0, 16),
      name: 'Harbor Retail',
      currencyId: pkr._id,
      creditLimit: '50000',
      paymentTerms: 'net_30',
      receivableAccount: 'AR 1200-0019',
      status: 'active',
    },
  })
  assertStatus(harbor, 201, 'harbor customer')
  harborId = harbor.json.data._id

  async function invoice(body) {
    const created = await request('POST', '/api/v1/customer-receivables/invoices', { token, body })
    assertStatus(created, 201, `invoice ${body.invoiceNumber}`)
    return created.json.data
  }

  // asOf 2026-10-01 — Coastal: SL-09052 overdue 14 days (due Sep 17), amount 15000
  // after 5000 receipt → outstanding 10000 overdue; current invoices 8400 → total 18400
  const sl9052 = await invoice({
    branchId,
    customerId: coastalId,
    currencyId: pkr._id,
    invoiceNumber: `SL-9052-${stamp}`.toUpperCase().slice(0, 24),
    invoiceDate: '2026-09-03',
    dueDate: '2026-09-17',
    amount: '15000',
  })
  await invoice({
    branchId,
    customerId: coastalId,
    currencyId: pkr._id,
    invoiceNumber: `SL-9060-${stamp}`.toUpperCase().slice(0, 24),
    invoiceDate: '2026-09-20',
    dueDate: '2026-10-04',
    amount: '4400',
  })
  await invoice({
    branchId,
    customerId: coastalId,
    currencyId: pkr._id,
    invoiceNumber: `SL-9068-${stamp}`.toUpperCase().slice(0, 24),
    invoiceDate: '2026-09-25',
    dueDate: '2026-10-09',
    amount: '4000',
  })

  // Harbor: current 20000, 1-30 overdue 8000, over 30: 12000
  await invoice({
    branchId,
    customerId: harborId,
    currencyId: pkr._id,
    invoiceNumber: `SL-H1-${stamp}`.toUpperCase().slice(0, 24),
    invoiceDate: '2026-09-20',
    dueDate: '2026-10-20',
    amount: '20000',
  })
  await invoice({
    branchId,
    customerId: harborId,
    currencyId: pkr._id,
    invoiceNumber: `SL-H2-${stamp}`.toUpperCase().slice(0, 24),
    invoiceDate: '2026-08-20',
    dueDate: '2026-09-15',
    amount: '8000',
  })
  await invoice({
    branchId,
    customerId: harborId,
    currencyId: pkr._id,
    invoiceNumber: `SL-H3-${stamp}`.toUpperCase().slice(0, 24),
    invoiceDate: '2026-07-01',
    dueDate: '2026-08-01',
    amount: '12000',
  })

  const receipt = await request('POST', '/api/v1/customer-receivables/receipts', {
    token,
    body: {
      branchId,
      customerId: coastalId,
      currencyId: pkr._id,
      receiptDate: '2026-09-30',
      amount: '5000',
      receiptMethod: 'bank',
      bankName: 'Meridian Bank',
      voucherNumber: 'JV-01844',
      allocations: [{ invoiceId: sl9052._id, amount: '5000' }],
    },
  })
  assertStatus(receipt, 201, 'receipt')
  assert(receipt.json.data.allocatedAmount === '5000', 'allocated amount')
  assert(receipt.json.data.unallocatedAmount === '0', 'fully allocated')
  assert(receipt.json.data.allocations[0].invoiceNumber === sl9052.invoiceNumber, 'allocation links SL')
  assert(receipt.json.data.voucherNumber === 'JV-01844', 'voucher stored')

  const overAlloc = await request('POST', '/api/v1/customer-receivables/receipts', {
    token,
    body: {
      branchId,
      customerId: coastalId,
      amount: '100',
      receiptMethod: 'cash',
      allocations: [{ invoiceId: sl9052._id, amount: '9000' }],
    },
  })
  assertStatus(overAlloc, 400, 'over allocation rejected')

  const aging = await request(
    'GET',
    `/api/v1/customer-receivables/aging?branchId=${branchId}&asOf=${asOf}&customerId=${coastalId}`,
    { token },
  )
  assertStatus(aging, 200, 'aging')
  assert(aging.json.data.summary.totalReceivable === '18400', 'coastal total receivable')
  assert(aging.json.data.summary.current === '8400', 'coastal current')
  assert(aging.json.data.summary.overdue1to30 === '10000', 'coastal overdue 1-30')
  assert(aging.json.data.summary.overdueOver30 === '0', 'coastal no over-30')

  const overview = aging.json.data.selectedCustomer
  assert(overview.customerName === 'Coastal Café Group', 'quick view name')
  assert(overview.creditLimit === '25000', 'credit limit')
  assert(overview.outstanding === '18400', 'outstanding')
  assert(overview.availableCredit === '6600', 'available credit')
  assert(overview.overdue === '10000', 'overdue')
  assert(overview.paymentTermsLabel === 'Net 14', 'terms')
  assert(overview.collectionAttention.daysPastDue === 14, 'collection attention days')
  assert(overview.collectionAttention.message.includes('SL-9052'), 'collection attention invoice')
  assert(overview.latestAllocation.bankName === 'Meridian Bank', 'latest allocation bank')
  assert(overview.latestAllocation.amount === '5000', 'latest allocation amount')
  assert(overview.outstandingInvoices.length === 3, 'three invoices in panel')

  const allAging = await request(
    'GET',
    `/api/v1/customer-receivables/aging?branchId=${branchId}&asOf=${asOf}`,
    { token },
  )
  assertStatus(allAging, 200, 'all aging')
  assert(allAging.json.data.summary.totalReceivable === '58400', 'branch total receivable')
  assert(allAging.json.data.summary.current === '28400', 'branch current')
  assert(allAging.json.data.summary.overdue1to30 === '18000', 'branch 1-30')
  assert(allAging.json.data.summary.overdueOver30 === '12000', 'branch over 30')
  assert(allAging.json.data.rows.length === 2, 'two customer rows')
  assert(allAging.json.data.totals.balance === '58400', 'totals balance')

  const invoices = await request(
    'GET',
    `/api/v1/customer-receivables/customers/${coastalId}/invoices?branchId=${branchId}&asOf=${asOf}&limit=20`,
    { token },
  )
  assertStatus(invoices, 200, 'customer invoices')
  const open9052 = invoices.json.data.find((row) => row._id === sl9052._id)
  assert(open9052.paidAmount === '5000', 'invoice paid amount')
  assert(open9052.outstanding === '10000', 'invoice outstanding')
  assert(open9052.isOverdue === true, 'invoice overdue flag')

  const ledger = await request(
    'GET',
    `/api/v1/customer-receivables/customers/${coastalId}/ledger?branchId=${branchId}&limit=50`,
    { token },
  )
  assertStatus(ledger, 200, 'ledger')
  assert(ledger.json.data.length === 4, 'three sales plus one receipt')
  assert(ledger.json.data[0].debit === '15000', 'first sale debits receivable')
  const recRow = ledger.json.data.find((row) => row.sourceType === 'receipt')
  assert(recRow.credit === '5000', 'receipt credits receivable')
  assert(ledger.json.data[ledger.json.data.length - 1].balance === '18400', 'running balance')

  const specRes = await request('GET', '/openapi.json')
  assertStatus(specRes, 200, 'openapi')
  assert(specRes.json.paths['/api/v1/customer-receivables/aging'], 'openapi documents aging')
  assert(specRes.json.paths['/api/v1/customer-receivables/receipts'], 'openapi documents receipts')
  assert(specRes.json.components.schemas.CustomerAging, 'openapi aging schema')
  assert(specRes.json.components.schemas.CustomerReceiptWrite, 'openapi receipt write schema')

  console.log('receivables checks passed')
} finally {
  try {
    if (coastalId || harborId) {
      const ids = [coastalId, harborId].filter(Boolean)
      await CustomerLedgerEntry.deleteMany({ customerId: { $in: ids } })
      await CustomerReceipt.deleteMany({ customerId: { $in: ids } })
      await CustomerInvoice.deleteMany({ customerId: { $in: ids } })
      await Customer.deleteMany({ _id: { $in: ids } })
    }
  } catch {
    // ignore cleanup errors
  }
  if (server) await new Promise((resolve) => server.close(resolve))
  await import('mongoose').then((m) => m.default.disconnect())
}
