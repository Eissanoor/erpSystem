import { env } from '../src/config/env.js'
import { connectDb } from '../src/config/db.js'
import { createApp } from '../src/app.js'
import { seedAuth } from '../src/seed/seedAuth.js'
import { Currency } from '../src/modules/currency/currency.model.js'
import { Supplier } from '../src/modules/supplier/supplier.model.js'
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
const asOf = '2026-10-01'
let branchId
let summitId
let northId

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
  assert(login.json.data.user.permissionCodes.includes('payable.create'), 'admin can create payables')
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
      name: 'Payables Branch',
      code: `pay-b-${stamp}`,
      branchType: 'operating',
      address: 'City Center',
    },
  })
  assertStatus(branch, 201, 'branch')
  branchId = branch.json.data._id

  const summit = await request('POST', '/api/v1/suppliers', {
    token,
    body: {
      code: `S-8-${stamp}`.toUpperCase().slice(0, 16),
      name: 'Summit Foods',
      currencyId: pkr._id,
      paymentTerms: 'net_30',
      payableAccount: 'AP 2100-0008',
      status: 'active',
    },
  })
  assertStatus(summit, 201, 'summit supplier')
  summitId = summit.json.data._id

  const north = await request('POST', '/api/v1/suppliers', {
    token,
    body: {
      code: `S-9-${stamp}`.toUpperCase().slice(0, 16),
      name: 'Northline Wholesale',
      currencyId: pkr._id,
      paymentTerms: 'net_14',
      payableAccount: 'AP 2100-0009',
      status: 'active',
    },
  })
  assertStatus(north, 201, 'north supplier')
  northId = north.json.data._id

  async function invoice(body) {
    const created = await request('POST', '/api/v1/supplier-payables/invoices', { token, body })
    assertStatus(created, 201, `invoice ${body.purchaseNumber}`)
    return created.json.data
  }

  // asOf 2026-10-01
  // Summit: overdue 1-30 (Sep 10 → 21 days): 12000 after later payment on 20600
  //         overdue 1-30 (Sep 5 → 26 days): 8000
  //         current due Oct 15: 12800
  //         current due Oct 20: 10000
  const po2594 = await invoice({
    branchId,
    supplierId: summitId,
    currencyId: pkr._id,
    purchaseNumber: `PO-2594-${stamp}`.toUpperCase().slice(0, 24),
    invoiceDate: '2026-08-06',
    dueDate: '2026-09-05',
    amount: '8000',
  })
  const po2608 = await invoice({
    branchId,
    supplierId: summitId,
    currencyId: pkr._id,
    purchaseNumber: `PO-2608-${stamp}`.toUpperCase().slice(0, 24),
    invoiceDate: '2026-08-11',
    dueDate: '2026-09-10',
    amount: '20600',
  })
  const po2630 = await invoice({
    branchId,
    supplierId: summitId,
    currencyId: pkr._id,
    purchaseNumber: `PO-2630-${stamp}`.toUpperCase().slice(0, 24),
    invoiceDate: '2026-09-15',
    dueDate: '2026-10-15',
    amount: '12800',
  })
  await invoice({
    branchId,
    supplierId: summitId,
    currencyId: pkr._id,
    purchaseNumber: `PO-2640-${stamp}`.toUpperCase().slice(0, 24),
    invoiceDate: '2026-09-20',
    dueDate: '2026-10-20',
    amount: '10000',
  })

  // Northline: current 20000, 31-60 overdue 15000 (due Aug 1 → 61 days → d61), 1-30 overdue 5000
  await invoice({
    branchId,
    supplierId: northId,
    currencyId: pkr._id,
    purchaseNumber: `PO-N1-${stamp}`.toUpperCase().slice(0, 24),
    invoiceDate: '2026-09-20',
    dueDate: '2026-10-10',
    amount: '20000',
  })
  await invoice({
    branchId,
    supplierId: northId,
    currencyId: pkr._id,
    purchaseNumber: `PO-N2-${stamp}`.toUpperCase().slice(0, 24),
    invoiceDate: '2026-08-20',
    dueDate: '2026-09-15',
    amount: '5000',
  })
  await invoice({
    branchId,
    supplierId: northId,
    currencyId: pkr._id,
    purchaseNumber: `PO-N3-${stamp}`.toUpperCase().slice(0, 24),
    invoiceDate: '2026-06-20',
    dueDate: '2026-08-01',
    amount: '15000',
  })

  const payment = await request('POST', '/api/v1/supplier-payables/payments', {
    token,
    body: {
      branchId,
      supplierId: summitId,
      currencyId: pkr._id,
      paymentDate: '2026-09-30',
      amount: '8900',
      paymentMethod: 'bank',
      bankName: 'Meridian Bank',
      allocations: [{ invoiceId: po2608._id, amount: '8600' }],
    },
  })
  assertStatus(payment, 201, 'payment')
  assert(payment.json.data.allocatedAmount === '8600', 'allocated amount')
  assert(payment.json.data.unallocatedAmount === '300', 'unallocated advance')
  assert(payment.json.data.allocations[0].purchaseNumber === po2608.purchaseNumber, 'allocation links PO')

  const overAlloc = await request('POST', '/api/v1/supplier-payables/payments', {
    token,
    body: {
      branchId,
      supplierId: summitId,
      amount: '100',
      paymentMethod: 'cash',
      allocations: [{ invoiceId: po2594._id, amount: '9000' }],
    },
  })
  assertStatus(overAlloc, 400, 'over allocation rejected')

  const aging = await request(
    'GET',
    `/api/v1/supplier-payables/aging?branchId=${branchId}&asOf=${asOf}&supplierId=${summitId}`,
    { token },
  )
  assertStatus(aging, 200, 'aging')
  assert(aging.json.data.summary.totalPayable === '42800', 'summit total payable')
  assert(aging.json.data.summary.current === '22800', 'summit current 12800+10000')
  assert(aging.json.data.summary.overdue1to30 === '20000', 'summit overdue 8000+12000')
  assert(aging.json.data.summary.overdueOver30 === '0', 'summit no over-30')

  const overview = aging.json.data.selectedSupplier
  assert(overview.supplierName === 'Summit Foods', 'quick view name')
  assert(overview.outstanding === '42800', 'quick view outstanding')
  assert(overview.overdue === '20000', 'quick view overdue')
  assert(overview.unallocatedAdvance === '300', 'quick view unallocated')
  assert(overview.paymentTermsLabel === 'Net 30', 'quick view terms')
  assert(overview.followUp.length === 2, 'follow-up overdue invoices')
  assert(overview.latestAllocation.bankName === 'Meridian Bank', 'latest allocation bank')
  assert(overview.latestAllocation.amount === '8600', 'latest allocation amount')
  assert(String(overview.nextDue.amount) === '12800', 'next due amount')

  const allAging = await request(
    'GET',
    `/api/v1/supplier-payables/aging?branchId=${branchId}&asOf=${asOf}`,
    { token },
  )
  assertStatus(allAging, 200, 'all aging')
  assert(allAging.json.data.summary.totalPayable === '82800', 'branch total payable')
  assert(allAging.json.data.summary.current === '42800', 'branch current')
  assert(allAging.json.data.summary.overdue1to30 === '25000', 'branch 1-30')
  assert(allAging.json.data.summary.overdueOver30 === '15000', 'branch over 30')
  assert(allAging.json.data.rows.length === 2, 'two supplier rows')
  assert(allAging.json.data.totals.balance === '82800', 'totals balance')

  const invoices = await request(
    'GET',
    `/api/v1/supplier-payables/suppliers/${summitId}/invoices?branchId=${branchId}&asOf=${asOf}&limit=20`,
    { token },
  )
  assertStatus(invoices, 200, 'supplier invoices')
  const open2608 = invoices.json.data.find((row) => row._id === po2608._id)
  assert(open2608.paidAmount === '8600', 'invoice paid amount')
  assert(open2608.outstanding === '12000', 'invoice outstanding')
  assert(open2608.isOverdue === true, 'invoice overdue flag')

  const ledger = await request(
    'GET',
    `/api/v1/supplier-payables/suppliers/${summitId}/ledger?branchId=${branchId}&limit=50`,
    { token },
  )
  assertStatus(ledger, 200, 'ledger')
  assert(ledger.json.data.length === 5, 'four purchases plus one payment')
  assert(ledger.json.data[0].credit === '8000', 'first purchase credits payable')
  const payRow = ledger.json.data.find((row) => row.sourceType === 'payment')
  assert(payRow.debit === '8900', 'payment debits the full paid amount')
  // Ledger net = invoice outstanding (42800) minus unallocated advance (300)
  assert(ledger.json.data[ledger.json.data.length - 1].balance === '42500', 'running balance nets unallocated advance')

  const specRes = await request('GET', '/openapi.json')
  assertStatus(specRes, 200, 'openapi')
  assert(specRes.json.paths['/api/v1/supplier-payables/aging'], 'openapi documents aging')
  assert(specRes.json.paths['/api/v1/supplier-payables/payments'], 'openapi documents payments')
  assert(specRes.json.components.schemas.SupplierAging, 'openapi aging schema')
  assert(specRes.json.components.schemas.SupplierPaymentWrite, 'openapi payment write schema')

  console.log('payables checks passed')
} finally {
  try {
    if (summitId || northId) {
      const ids = [summitId, northId].filter(Boolean)
      await SupplierLedgerEntry.deleteMany({ supplierId: { $in: ids } })
      await SupplierPayment.deleteMany({ supplierId: { $in: ids } })
      await SupplierInvoice.deleteMany({ supplierId: { $in: ids } })
      await Supplier.deleteMany({ _id: { $in: ids } })
    }
  } catch {
    // ignore cleanup errors
  }
  if (server) await new Promise((resolve) => server.close(resolve))
  await import('mongoose').then((m) => m.default.disconnect())
}
