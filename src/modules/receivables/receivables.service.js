import { Decimal } from 'decimal.js'
import { ApiError } from '../../common/utils/ApiError.js'
import { assertFound } from '../../common/utils/assert.js'
import { pagination } from '../../common/utils/pagination.js'
import { listQuery } from '../../common/utils/listQuery.js'
import { documentNumber } from '../../common/utils/documentNumber.js'
import { money } from '../../common/utils/money.js'
import { rethrowDuplicate } from '../../common/utils/duplicateKey.js'
import { scopeToBranches } from '../../common/utils/scopeToBranches.js'
import { withTransaction } from '../../common/utils/withTransaction.js'
import { decimalText } from '../product/refs.js'
import { Branch } from '../branch/branch.model.js'
import { Currency } from '../currency/currency.model.js'
import { Customer } from '../customer/customer.model.js'
import { PAYMENT_TERMS_LABELS } from '../customer/customer.constants.js'
import { RECEIPT_METHOD_LABELS, TERMS_DAYS } from './receivables.constants.js'
import { CustomerInvoice } from './customerInvoice.model.js'
import { CustomerReceipt } from './customerReceipt.model.js'
import { CustomerLedgerEntry } from './customerLedgerEntry.model.js'

const INVOICE_SORT = ['dueDate', 'invoiceDate', 'invoiceNumber', 'createdAt']
const RECEIPT_SORT = ['receiptDate', 'receiptNumber', 'createdAt']
const LEDGER_SORT = ['entryDate', 'createdAt']

function asDecimal(value) {
  return new Decimal(decimalText(value) || '0')
}

function startOfDay(value) {
  const date = new Date(value)
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()))
}

function addDays(date, days) {
  const next = new Date(date)
  next.setUTCDate(next.getUTCDate() + days)
  return next
}

function daysPastDue(dueDate, asOf) {
  const due = startOfDay(dueDate).getTime()
  const as = startOfDay(asOf).getTime()
  return Math.floor((as - due) / 86_400_000)
}

function bucketKey(days) {
  if (days <= 0) return 'current'
  if (days <= 30) return 'd1_30'
  if (days <= 60) return 'd31_60'
  return 'd61'
}

function emptyBuckets() {
  return {
    current: new Decimal(0),
    d1_30: new Decimal(0),
    d31_60: new Decimal(0),
    d61: new Decimal(0),
  }
}

function presentMoneyBuckets(buckets) {
  return {
    current: buckets.current.toFixed(),
    d1_30: buckets.d1_30.toFixed(),
    d31_60: buckets.d31_60.toFixed(),
    d61: buckets.d61.toFixed(),
    balance: buckets.current.plus(buckets.d1_30).plus(buckets.d31_60).plus(buckets.d61).toFixed(),
  }
}

async function assertBranch(branchId, user) {
  const scoped = scopeToBranches({ branchId }, user)
  if (scoped.branchId && typeof scoped.branchId === 'object' && Array.isArray(scoped.branchId.$in)) {
    throw new ApiError(403, 'Branch outside access', [
      { field: 'branchId', message: 'Branch is outside your access' },
    ])
  }
  const branch = await Branch.findById(branchId).select('_id name code status').lean()
  if (!branch || branch.status !== 'active') {
    throw new ApiError(400, 'Inactive branch', [
      { field: 'branchId', message: 'Branch must be active' },
    ])
  }
  return branch
}

async function assertCustomer(customerId) {
  const customer = await Customer.findById(customerId)
    .select('_id code name paymentTerms receivableAccount currencyId creditLimit status')
    .lean()
  if (!customer || customer.status !== 'active') {
    throw new ApiError(400, 'Inactive customer', [
      { field: 'customerId', message: 'Customer must be active' },
    ])
  }
  return customer
}

async function assertCurrency(currencyId) {
  const currency = await Currency.findById(currencyId).select('_id code name symbol status').lean()
  if (!currency || currency.status !== 'active') {
    throw new ApiError(400, 'Inactive currency', [
      { field: 'currencyId', message: 'Currency must be active' },
    ])
  }
  return currency
}

async function resolveCurrencyId(explicitId, customer) {
  const currencyId = explicitId || customer.currencyId
  if (!currencyId) {
    throw new ApiError(400, 'Currency required', [
      { field: 'currencyId', message: 'Currency is required' },
    ])
  }
  await assertCurrency(currencyId)
  return currencyId
}

async function latestBalance(customerId, branchId, session) {
  const filter = { customerId }
  if (branchId) filter.branchId = branchId
  const last = await CustomerLedgerEntry.findOne(filter)
    .sort({ entryDate: -1, createdAt: -1 })
    .select('balance')
    .session(session || null)
    .lean()
  return last ? asDecimal(last.balance) : new Decimal(0)
}

async function appendLedger({
  branchId,
  customerId,
  currencyId,
  entryDate,
  sourceType,
  sourceId,
  sourceNumber,
  debit,
  credit,
  description,
  session,
}) {
  // AR: sales DR increase balance; receipts CR decrease balance
  const previous = await latestBalance(customerId, branchId, session)
  const balance = previous.plus(asDecimal(debit)).minus(asDecimal(credit))
  const [entry] = await CustomerLedgerEntry.create(
    [
      {
        branchId,
        customerId,
        currencyId,
        entryDate,
        sourceType,
        sourceId,
        sourceNumber,
        debit: money.toDecimal(debit),
        credit: money.toDecimal(credit),
        balance: money.toDecimal(balance.toFixed()),
        description: description || '',
      },
    ],
    { session },
  )
  return entry
}

function outstandingOf(invoice) {
  return asDecimal(invoice.amount).minus(asDecimal(invoice.paidAmount))
}

function presentInvoice(doc, asOf = new Date()) {
  const amount = asDecimal(doc.amount)
  const paid = asDecimal(doc.paidAmount)
  const outstanding = amount.minus(paid)
  const days = daysPastDue(doc.dueDate, asOf)
  return {
    _id: doc._id,
    invoiceNumber: doc.invoiceNumber,
    branchId: doc.branchId,
    customerId: doc.customerId,
    currencyId: doc.currencyId,
    invoiceDate: doc.invoiceDate,
    dueDate: doc.dueDate,
    amount: amount.toFixed(),
    paidAmount: paid.toFixed(),
    allocatedAmount: paid.toFixed(),
    outstanding: outstanding.toFixed(),
    status: doc.status,
    daysPastDue: Math.max(days, 0),
    isOverdue: days > 0 && outstanding.gt(0),
    agingBucket: outstanding.gt(0) ? bucketKey(days) : null,
    notes: doc.notes || '',
    createdAt: doc.createdAt,
    updatedAt: doc.updatedAt,
  }
}

function presentReceipt(doc) {
  const allocated = asDecimal(doc.allocatedAmount)
  const unallocated = asDecimal(doc.unallocatedAmount)
  const first = (doc.allocations || [])[0]
  return {
    _id: doc._id,
    receiptNumber: doc.receiptNumber,
    branchId: doc.branchId,
    customerId: doc.customerId,
    currencyId: doc.currencyId,
    receiptDate: doc.receiptDate,
    amount: asDecimal(doc.amount).toFixed(),
    allocatedAmount: allocated.toFixed(),
    unallocatedAmount: unallocated.toFixed(),
    receiptMethod: doc.receiptMethod,
    receiptMethodLabel: RECEIPT_METHOD_LABELS[doc.receiptMethod] || '',
    bankName: doc.bankName || '',
    voucherNumber: doc.voucherNumber || '',
    status: doc.status,
    allocations: (doc.allocations || []).map((row) => ({
      _id: row._id,
      invoiceId: row.invoiceId,
      invoiceNumber: row.invoiceNumber,
      amount: asDecimal(row.amount).toFixed(),
    })),
    allocationNote: first
      ? [
          `Receipt ${doc.receiptNumber} · PKR ${asDecimal(first.amount).toFixed()} allocated.`,
          doc.bankName ? `${doc.bankName}` : null,
          doc.receiptDate
            ? new Date(doc.receiptDate).toLocaleString('en-US', {
                month: 'short',
                day: 'numeric',
                timeZone: 'UTC',
              })
            : null,
          doc.voucherNumber ? `Voucher ${doc.voucherNumber}` : null,
          `Applied to ${first.invoiceNumber}; unallocated amount PKR ${unallocated.toFixed()}.`,
        ]
          .filter(Boolean)
          .join(' · ')
          .replace(' · Applied', '. Applied')
      : '',
    notes: doc.notes || '',
    createdAt: doc.createdAt,
    updatedAt: doc.updatedAt,
  }
}

function presentLedger(doc) {
  return {
    _id: doc._id,
    entryDate: doc.entryDate,
    sourceType: doc.sourceType,
    sourceId: doc.sourceId,
    sourceNumber: doc.sourceNumber,
    debit: asDecimal(doc.debit).gt(0) ? asDecimal(doc.debit).toFixed() : null,
    credit: asDecimal(doc.credit).gt(0) ? asDecimal(doc.credit).toFixed() : null,
    balance: asDecimal(doc.balance).toFixed(),
    description: doc.description || '',
    createdAt: doc.createdAt,
  }
}

async function loadOpenInvoices(filter) {
  return CustomerInvoice.find({ ...filter, status: 'posted' })
    .select(
      'invoiceNumber branchId customerId currencyId invoiceDate dueDate amount paidAmount status notes createdAt updatedAt',
    )
    .lean()
}

export async function balancesByCustomer(query, user) {
  const asOf = query.asOf ? new Date(query.asOf) : new Date()
  const filter = scopeToBranches({ status: 'posted' }, user)
  if (query.branchId) filter.branchId = query.branchId
  if (query.currencyId) filter.currencyId = query.currencyId
  if (query.customerIds?.length) filter.customerId = { $in: query.customerIds }

  const invoices = await loadOpenInvoices(filter)
  const map = new Map()
  const totals = emptyBuckets()

  for (const invoice of invoices) {
    const open = outstandingOf(invoice)
    if (open.lte(0)) continue
    const key = String(invoice.customerId)
    if (!map.has(key)) {
      map.set(key, { buckets: emptyBuckets(), outstanding: new Decimal(0) })
    }
    const row = map.get(key)
    const bucket = bucketKey(daysPastDue(invoice.dueDate, asOf))
    row.buckets[bucket] = row.buckets[bucket].plus(open)
    row.outstanding = row.outstanding.plus(open)
    totals[bucket] = totals[bucket].plus(open)
  }

  const byCustomer = new Map()
  for (const [key, row] of map.entries()) {
    byCustomer.set(key, {
      outstanding: row.outstanding.toFixed(),
      current: row.buckets.current.toFixed(),
      d1_30: row.buckets.d1_30.toFixed(),
      d31_60: row.buckets.d31_60.toFixed(),
      d61: row.buckets.d61.toFixed(),
      overdue: row.buckets.d1_30.plus(row.buckets.d31_60).plus(row.buckets.d61).toFixed(),
      overdueOver30: row.buckets.d31_60.plus(row.buckets.d61).toFixed(),
    })
  }

  const totalReceivable = totals.current.plus(totals.d1_30).plus(totals.d31_60).plus(totals.d61)
  return {
    asOf: startOfDay(asOf).toISOString(),
    byCustomer,
    summary: {
      totalReceivable: totalReceivable.toFixed(),
      current: totals.current.toFixed(),
      overdue1to30: totals.d1_30.toFixed(),
      overdueOver30: totals.d31_60.plus(totals.d61).toFixed(),
      customersWithBalance: byCustomer.size,
    },
  }
}

export async function aging(query, user) {
  const asOf = query.asOf ? new Date(query.asOf) : new Date()
  const filter = scopeToBranches({ status: 'posted' }, user)
  if (query.branchId) filter.branchId = query.branchId
  if (query.customerId) filter.customerId = query.customerId
  if (query.currencyId) filter.currencyId = query.currencyId

  const invoices = await loadOpenInvoices(filter)
  const byCustomer = new Map()

  for (const invoice of invoices) {
    const outstanding = outstandingOf(invoice)
    if (outstanding.lte(0)) continue
    const key = String(invoice.customerId)
    if (!byCustomer.has(key)) {
      byCustomer.set(key, { customerId: invoice.customerId, buckets: emptyBuckets() })
    }
    const row = byCustomer.get(key)
    const bucket = bucketKey(daysPastDue(invoice.dueDate, asOf))
    row.buckets[bucket] = row.buckets[bucket].plus(outstanding)
  }

  const customerIds = [...byCustomer.keys()]
  const customers = await Customer.find({ _id: { $in: customerIds } })
    .select('code name paymentTerms receivableAccount currencyId creditLimit')
    .lean()
  const customerMap = new Map(customers.map((row) => [String(row._id), row]))

  const totals = emptyBuckets()
  const rows = []
  for (const entry of byCustomer.values()) {
    const customer = customerMap.get(String(entry.customerId))
    if (!customer) continue
    const moneyBuckets = presentMoneyBuckets(entry.buckets)
    totals.current = totals.current.plus(entry.buckets.current)
    totals.d1_30 = totals.d1_30.plus(entry.buckets.d1_30)
    totals.d31_60 = totals.d31_60.plus(entry.buckets.d31_60)
    totals.d61 = totals.d61.plus(entry.buckets.d61)
    rows.push({
      customerId: customer._id,
      customerCode: customer.code,
      customerName: customer.name,
      receivableAccount: customer.receivableAccount,
      paymentTerms: customer.paymentTerms,
      paymentTermsLabel: PAYMENT_TERMS_LABELS[customer.paymentTerms] || '',
      creditLimit: decimalText(customer.creditLimit) || '0',
      ...moneyBuckets,
    })
  }

  rows.sort((left, right) => left.customerName.localeCompare(right.customerName))

  const totalReceivable = totals.current.plus(totals.d1_30).plus(totals.d31_60).plus(totals.d61)
  const summary = {
    totalReceivable: totalReceivable.toFixed(),
    current: totals.current.toFixed(),
    overdue1to30: totals.d1_30.toFixed(),
    overdueOver30: totals.d31_60.plus(totals.d61).toFixed(),
    asOf: startOfDay(asOf).toISOString(),
  }

  let selected = null
  if (query.customerId) {
    selected = await customerOverview(query.customerId, { ...query, asOf }, user)
  }

  return {
    summary,
    totals: presentMoneyBuckets(totals),
    rows,
    selectedCustomer: selected,
  }
}

export async function customerOverview(customerId, query, user) {
  const asOf = query.asOf ? new Date(query.asOf) : new Date()
  const customer = assertFound(
    await Customer.findById(customerId)
      .select('code name paymentTerms receivableAccount currencyId creditLimit status')
      .lean(),
    'Customer not found',
  )

  const filter = scopeToBranches({ customerId, status: 'posted' }, user)
  if (query.branchId) filter.branchId = query.branchId
  if (query.currencyId) filter.currencyId = query.currencyId

  const [invoices, receipts] = await Promise.all([
    loadOpenInvoices(filter),
    CustomerReceipt.find({ ...filter, status: 'posted' })
      .select(
        'unallocatedAmount allocations receiptNumber receiptDate bankName voucherNumber amount allocatedAmount',
      )
      .sort({ receiptDate: -1, createdAt: -1 })
      .lean(),
  ])

  let outstanding = new Decimal(0)
  let overdue = new Decimal(0)
  let current = new Decimal(0)
  const followUp = []
  const outstandingInvoices = []

  for (const invoice of invoices) {
    const open = outstandingOf(invoice)
    const amount = asDecimal(invoice.amount)
    const paid = asDecimal(invoice.paidAmount)
    const days = daysPastDue(invoice.dueDate, asOf)
    outstandingInvoices.push({
      _id: invoice._id,
      invoiceNumber: invoice.invoiceNumber,
      dueDate: invoice.dueDate,
      invoiceDate: invoice.invoiceDate,
      amount: amount.toFixed(),
      allocatedAmount: paid.toFixed(),
      paidAmount: paid.toFixed(),
      outstanding: Decimal.max(open, 0).toFixed(),
      isOverdue: open.gt(0) && days > 0,
      daysPastDue: Math.max(days, 0),
    })
    if (open.lte(0)) continue
    outstanding = outstanding.plus(open)
    if (days > 0) {
      overdue = overdue.plus(open)
      followUp.push({
        invoiceNumber: invoice.invoiceNumber,
        dueDate: invoice.dueDate,
        outstanding: open.toFixed(),
        daysPastDue: days,
      })
    } else {
      current = current.plus(open)
    }
  }

  outstandingInvoices.sort((left, right) => new Date(left.dueDate) - new Date(right.dueDate))
  followUp.sort((left, right) => right.daysPastDue - left.daysPastDue)

  let unallocatedAdvance = new Decimal(0)
  for (const receipt of receipts) {
    unallocatedAdvance = unallocatedAdvance.plus(asDecimal(receipt.unallocatedAmount))
  }

  const latestReceipt = receipts[0] || null
  const latestAllocation =
    latestReceipt?.allocations?.length > 0
      ? {
          receiptNumber: latestReceipt.receiptNumber,
          receiptDate: latestReceipt.receiptDate,
          bankName: latestReceipt.bankName || '',
          voucherNumber: latestReceipt.voucherNumber || '',
          amount: asDecimal(latestReceipt.allocations[0].amount).toFixed(),
          invoiceNumber: latestReceipt.allocations[0].invoiceNumber,
          unallocatedAmount: asDecimal(latestReceipt.unallocatedAmount).toFixed(),
          note: [
            `Receipt ${latestReceipt.receiptNumber} · PKR ${asDecimal(latestReceipt.allocations[0].amount).toFixed()} allocated.`,
            latestReceipt.bankName || null,
            latestReceipt.voucherNumber ? `Voucher ${latestReceipt.voucherNumber}` : null,
            `Applied to ${latestReceipt.allocations[0].invoiceNumber}; unallocated amount PKR ${asDecimal(latestReceipt.unallocatedAmount).toFixed()}.`,
          ]
            .filter(Boolean)
            .join(' · ')
            .replace(' · Applied', '. Applied'),
        }
      : null

  const creditLimit = asDecimal(decimalText(customer.creditLimit) || '0')
  const availableCredit = Decimal.max(creditLimit.minus(outstanding), 0)

  const topFollowUp = followUp[0] || null
  const collectionAttention = topFollowUp
    ? {
        invoiceNumber: topFollowUp.invoiceNumber,
        daysPastDue: topFollowUp.daysPastDue,
        message: latestAllocation
          ? `Invoice ${topFollowUp.invoiceNumber} is ${topFollowUp.daysPastDue} days overdue. Latest receipt ${latestAllocation.receiptNumber} allocated PKR ${latestAllocation.amount} to this invoice.`
          : `Invoice ${topFollowUp.invoiceNumber} is ${topFollowUp.daysPastDue} days overdue.`,
      }
    : null

  return {
    customerId: customer._id,
    customerCode: customer.code,
    customerName: customer.name,
    receivableAccount: customer.receivableAccount,
    paymentTerms: customer.paymentTerms,
    paymentTermsLabel: PAYMENT_TERMS_LABELS[customer.paymentTerms] || '',
    creditLimit: creditLimit.toFixed(),
    outstanding: outstanding.toFixed(),
    availableCredit: availableCredit.toFixed(),
    current: current.toFixed(),
    overdue: overdue.toFixed(),
    unallocatedAdvance: unallocatedAdvance.toFixed(),
    followUp,
    collectionAttention,
    outstandingInvoices,
    latestAllocation,
    asOf: startOfDay(asOf).toISOString(),
  }
}

export async function listInvoices(query, user) {
  const page = pagination(query, INVOICE_SORT)
  const asOf = query.asOf ? new Date(query.asOf) : new Date()
  const filter = scopeToBranches(listQuery(query, { searchFields: ['invoiceNumber'] }), user)
  if (query.branchId) filter.branchId = query.branchId
  if (query.customerId) filter.customerId = query.customerId
  if (query.currencyId) filter.currencyId = query.currencyId

  const [items, total] = await Promise.all([
    CustomerInvoice.find(filter).sort(page.sort).skip(page.skip).limit(page.limit).lean(),
    CustomerInvoice.countDocuments(filter),
  ])

  let presented = items.map((row) => presentInvoice(row, asOf))
  if (query.overdueOnly) {
    presented = presented.filter((row) => row.isOverdue)
  }
  return { items: presented, meta: page.meta(total) }
}

export async function listCustomerInvoices(customerId, query, user) {
  return listInvoices({ ...query, customerId }, user)
}

export async function getInvoice(id, user) {
  const doc = await CustomerInvoice.findOne(scopeToBranches({ _id: id }, user)).lean()
  return presentInvoice(assertFound(doc, 'Invoice not found'))
}

export async function createInvoiceInSession(body, user, session) {
  const branch = await assertBranch(body.branchId, user)
  const customer = await assertCustomer(body.customerId)
  const currencyId = await resolveCurrencyId(body.currencyId, customer)
  const invoiceDate = body.invoiceDate ? new Date(body.invoiceDate) : new Date()
  const termsDays = TERMS_DAYS[customer.paymentTerms] ?? 30
  const dueDate = body.dueDate ? new Date(body.dueDate) : addDays(startOfDay(invoiceDate), termsDays)
  const amount = asDecimal(body.amount)
  if (amount.lte(0)) {
    throw new ApiError(400, 'Invalid amount', [
      { field: 'amount', message: 'Amount must be positive' },
    ])
  }

  const invoiceNumber = body.invoiceNumber
    ? String(body.invoiceNumber).trim().toUpperCase()
    : await documentNumber.next('SL', session)

  const [doc] = await CustomerInvoice.create(
    [
      {
        invoiceNumber,
        branchId: branch._id,
        customerId: customer._id,
        currencyId,
        invoiceDate,
        dueDate,
        amount: money.toDecimal(amount.toFixed()),
        paidAmount: money.toDecimal('0'),
        status: 'posted',
        notes: body.notes || '',
        createdBy: user?._id || null,
      },
    ],
    { session },
  )

  await appendLedger({
    branchId: branch._id,
    customerId: customer._id,
    currencyId,
    entryDate: invoiceDate,
    sourceType: 'sale',
    sourceId: doc._id,
    sourceNumber: invoiceNumber,
    debit: amount.toFixed(),
    credit: '0',
    description: body.notes || `Sale ${invoiceNumber}`,
    session,
  })

  return presentInvoice(doc.toObject ? doc.toObject() : doc)
}

export async function createInvoice(body, user) {
  try {
    return await withTransaction(async (session) => createInvoiceInSession(body, user, session))
  } catch (error) {
    rethrowDuplicate(error, 'invoiceNumber', 'Invoice number already exists')
  }
}

export async function creditReceivableInSession(
  {
    branchId,
    customerId,
    currencyId,
    sourceNumber,
    amount,
    entryDate,
    description,
    invoiceId = null,
  },
  session,
) {
  const creditAmount = asDecimal(amount)
  if (creditAmount.lte(0)) {
    throw new ApiError(400, 'Invalid amount', [
      { field: 'amount', message: 'Amount must be positive' },
    ])
  }

  if (invoiceId) {
    const invoice = await CustomerInvoice.findOne({
      _id: invoiceId,
      customerId,
      status: 'posted',
    }).session(session)
    if (invoice) {
      const open = asDecimal(invoice.amount).minus(asDecimal(invoice.paidAmount))
      const applyAmt = Decimal.min(creditAmount, Decimal.max(open, 0))
      if (applyAmt.gt(0)) {
        invoice.paidAmount = money.toDecimal(asDecimal(invoice.paidAmount).plus(applyAmt).toFixed())
        await invoice.save({ session })
      }
    }
  }

  await appendLedger({
    branchId,
    customerId,
    currencyId,
    entryDate: entryDate || new Date(),
    sourceType: 'sales_return',
    sourceId: invoiceId || customerId,
    sourceNumber,
    debit: '0',
    credit: creditAmount.toFixed(),
    description: description || `Sales return credit ${sourceNumber}`,
    session,
  })
}

export async function listReceipts(query, user) {
  const page = pagination(query, RECEIPT_SORT)
  const filter = scopeToBranches(
    listQuery(query, { searchFields: ['receiptNumber', 'bankName', 'voucherNumber'] }),
    user,
  )
  if (query.branchId) filter.branchId = query.branchId
  if (query.customerId) filter.customerId = query.customerId
  if (query.currencyId) filter.currencyId = query.currencyId

  const [items, total] = await Promise.all([
    CustomerReceipt.find(filter).sort(page.sort).skip(page.skip).limit(page.limit).lean(),
    CustomerReceipt.countDocuments(filter),
  ])
  return { items: items.map(presentReceipt), meta: page.meta(total) }
}

export async function getReceipt(id, user) {
  const doc = await CustomerReceipt.findOne(scopeToBranches({ _id: id }, user)).lean()
  return presentReceipt(assertFound(doc, 'Receipt not found'))
}

export async function createReceiptInSession(body, user, session) {
  const branch = await assertBranch(body.branchId, user)
  const customer = await assertCustomer(body.customerId)
  const currencyId = await resolveCurrencyId(body.currencyId, customer)
  const receiptDate = body.receiptDate ? new Date(body.receiptDate) : new Date()
  const amount = asDecimal(body.amount)
  const allocations = body.allocations || []

  let allocated = new Decimal(0)
  for (const row of allocations) {
    allocated = allocated.plus(asDecimal(row.amount))
  }
  if (allocated.gt(amount)) {
    throw new ApiError(400, 'Allocation exceeds receipt', [
      { field: 'allocations', message: 'Allocated amount cannot exceed receipt amount' },
    ])
  }

  const mapped = []
  for (let index = 0; index < allocations.length; index += 1) {
    const row = allocations[index]
    const invoice = await CustomerInvoice.findOne({
      _id: row.invoiceId,
      customerId: customer._id,
      branchId: branch._id,
      status: 'posted',
    }).session(session)
    if (!invoice) {
      throw new ApiError(400, 'Unknown invoice', [
        { field: `allocations.${index}.invoiceId`, message: 'Invoice not found for this customer' },
      ])
    }
    const open = outstandingOf(invoice)
    const applyAmt = asDecimal(row.amount)
    if (applyAmt.gt(open)) {
      throw new ApiError(400, 'Over-allocation', [
        {
          field: `allocations.${index}.amount`,
          message: 'Allocation cannot exceed invoice outstanding',
        },
      ])
    }
    invoice.paidAmount = money.toDecimal(asDecimal(invoice.paidAmount).plus(applyAmt).toFixed())
    await invoice.save({ session })
    mapped.push({
      invoiceId: invoice._id,
      invoiceNumber: invoice.invoiceNumber,
      amount: money.toDecimal(applyAmt.toFixed()),
    })
  }

  const receiptNumber = await documentNumber.next('REC', session)
  const unallocated = amount.minus(allocated)
  const [receipt] = await CustomerReceipt.create(
    [
      {
        receiptNumber,
        branchId: branch._id,
        customerId: customer._id,
        currencyId,
        receiptDate,
        amount: money.toDecimal(amount.toFixed()),
        allocatedAmount: money.toDecimal(allocated.toFixed()),
        unallocatedAmount: money.toDecimal(unallocated.toFixed()),
        receiptMethod: body.receiptMethod,
        bankName: body.receiptMethod === 'bank' ? String(body.bankName || '').trim() : '',
        voucherNumber: body.voucherNumber ? String(body.voucherNumber).trim().toUpperCase() : '',
        status: 'posted',
        allocations: mapped,
        notes: body.notes || '',
        createdBy: user?._id || null,
      },
    ],
    { session },
  )

  await appendLedger({
    branchId: branch._id,
    customerId: customer._id,
    currencyId,
    entryDate: receiptDate,
    sourceType: 'receipt',
    sourceId: receipt._id,
    sourceNumber: receiptNumber,
    debit: '0',
    credit: amount.toFixed(),
    description:
      body.receiptMethod === 'bank'
        ? `Receipt ${receiptNumber} via ${String(body.bankName || '').trim()}`
        : `Receipt ${receiptNumber}`,
    session,
  })

  return presentReceipt(receipt.toObject())
}

export async function createReceipt(body, user) {
  return withTransaction(async (session) => createReceiptInSession(body, user, session))
}

export async function listLedger(customerId, query, user) {
  const page = pagination(query, LEDGER_SORT)
  assertFound(await Customer.findById(customerId).select('_id').lean(), 'Customer not found')
  const filter = scopeToBranches({ customerId }, user)
  if (query.branchId) filter.branchId = query.branchId
  if (query.currencyId) filter.currencyId = query.currencyId
  if (query.from || query.to) {
    filter.entryDate = {}
    if (query.from) filter.entryDate.$gte = new Date(query.from)
    if (query.to) filter.entryDate.$lte = new Date(query.to)
  }

  const [items, total] = await Promise.all([
    CustomerLedgerEntry.find(filter)
      .sort({ entryDate: 1, createdAt: 1 })
      .skip(page.skip)
      .limit(page.limit)
      .lean(),
    CustomerLedgerEntry.countDocuments(filter),
  ])

  return { items: items.map(presentLedger), meta: page.meta(total) }
}
