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
import { Supplier } from '../supplier/supplier.model.js'
import { PAYMENT_TERMS_LABELS } from '../supplier/supplier.constants.js'
import { PAYMENT_METHOD_LABELS, TERMS_DAYS } from './payables.constants.js'
import { SupplierInvoice } from './supplierInvoice.model.js'
import { SupplierPayment } from './supplierPayment.model.js'
import { SupplierLedgerEntry } from './supplierLedgerEntry.model.js'

const INVOICE_SORT = ['dueDate', 'invoiceDate', 'purchaseNumber', 'createdAt']
const PAYMENT_SORT = ['paymentDate', 'paymentNumber', 'createdAt']
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

async function assertSupplier(supplierId) {
  const supplier = await Supplier.findById(supplierId)
    .select('_id code name paymentTerms payableAccount currencyId status')
    .lean()
  if (!supplier || supplier.status !== 'active') {
    throw new ApiError(400, 'Inactive supplier', [
      { field: 'supplierId', message: 'Supplier must be active' },
    ])
  }
  return supplier
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

async function resolveCurrencyId(explicitId, supplier) {
  const currencyId = explicitId || supplier.currencyId
  if (!currencyId) {
    throw new ApiError(400, 'Currency required', [
      { field: 'currencyId', message: 'Currency is required' },
    ])
  }
  await assertCurrency(currencyId)
  return currencyId
}

async function latestBalance(supplierId, branchId, session) {
  const filter = { supplierId }
  if (branchId) filter.branchId = branchId
  const last = await SupplierLedgerEntry.findOne(filter)
    .sort({ entryDate: -1, createdAt: -1 })
    .select('balance')
    .session(session || null)
    .lean()
  return last ? asDecimal(last.balance) : new Decimal(0)
}

async function appendLedger({
  branchId,
  supplierId,
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
  const previous = await latestBalance(supplierId, branchId, session)
  const balance = previous.plus(asDecimal(credit)).minus(asDecimal(debit))
  const [entry] = await SupplierLedgerEntry.create(
    [
      {
        branchId,
        supplierId,
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

function presentInvoice(doc, asOf = new Date()) {
  const amount = asDecimal(doc.amount)
  const paid = asDecimal(doc.paidAmount)
  const outstanding = amount.minus(paid)
  const days = daysPastDue(doc.dueDate, asOf)
  return {
    _id: doc._id,
    purchaseNumber: doc.purchaseNumber,
    branchId: doc.branchId,
    supplierId: doc.supplierId,
    currencyId: doc.currencyId,
    invoiceDate: doc.invoiceDate,
    dueDate: doc.dueDate,
    amount: amount.toFixed(),
    paidAmount: paid.toFixed(),
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

function presentPayment(doc) {
  return {
    _id: doc._id,
    paymentNumber: doc.paymentNumber,
    branchId: doc.branchId,
    supplierId: doc.supplierId,
    currencyId: doc.currencyId,
    paymentDate: doc.paymentDate,
    amount: asDecimal(doc.amount).toFixed(),
    allocatedAmount: asDecimal(doc.allocatedAmount).toFixed(),
    unallocatedAmount: asDecimal(doc.unallocatedAmount).toFixed(),
    paymentMethod: doc.paymentMethod,
    paymentMethodLabel: PAYMENT_METHOD_LABELS[doc.paymentMethod] || '',
    bankName: doc.bankName || '',
    status: doc.status,
    allocations: (doc.allocations || []).map((row) => ({
      _id: row._id,
      invoiceId: row.invoiceId,
      purchaseNumber: row.purchaseNumber,
      amount: asDecimal(row.amount).toFixed(),
    })),
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
  return SupplierInvoice.find({ ...filter, status: 'posted' })
    .select(
      'purchaseNumber branchId supplierId currencyId invoiceDate dueDate amount paidAmount status notes createdAt updatedAt',
    )
    .lean()
}

function outstandingOf(invoice) {
  return asDecimal(invoice.amount).minus(asDecimal(invoice.paidAmount))
}

export async function aging(query, user) {
  const asOf = query.asOf ? new Date(query.asOf) : new Date()
  const filter = scopeToBranches({ status: 'posted' }, user)
  if (query.branchId) filter.branchId = query.branchId
  if (query.supplierId) filter.supplierId = query.supplierId
  if (query.currencyId) filter.currencyId = query.currencyId

  const invoices = await loadOpenInvoices(filter)
  const bySupplier = new Map()

  for (const invoice of invoices) {
    const outstanding = outstandingOf(invoice)
    if (outstanding.lte(0)) continue
    const key = String(invoice.supplierId)
    if (!bySupplier.has(key)) {
      bySupplier.set(key, { supplierId: invoice.supplierId, buckets: emptyBuckets(), invoices: [] })
    }
    const row = bySupplier.get(key)
    const bucket = bucketKey(daysPastDue(invoice.dueDate, asOf))
    row.buckets[bucket] = row.buckets[bucket].plus(outstanding)
    row.invoices.push(invoice)
  }

  const supplierIds = [...bySupplier.keys()]
  const suppliers = await Supplier.find({ _id: { $in: supplierIds } })
    .select('code name paymentTerms payableAccount currencyId')
    .lean()
  const supplierMap = new Map(suppliers.map((row) => [String(row._id), row]))

  const totals = emptyBuckets()
  const rows = []
  for (const entry of bySupplier.values()) {
    const supplier = supplierMap.get(String(entry.supplierId))
    if (!supplier) continue
    const moneyBuckets = presentMoneyBuckets(entry.buckets)
    totals.current = totals.current.plus(entry.buckets.current)
    totals.d1_30 = totals.d1_30.plus(entry.buckets.d1_30)
    totals.d31_60 = totals.d31_60.plus(entry.buckets.d31_60)
    totals.d61 = totals.d61.plus(entry.buckets.d61)
    rows.push({
      supplierId: supplier._id,
      supplierCode: supplier.code,
      supplierName: supplier.name,
      payableAccount: supplier.payableAccount,
      paymentTerms: supplier.paymentTerms,
      paymentTermsLabel: PAYMENT_TERMS_LABELS[supplier.paymentTerms] || '',
      ...moneyBuckets,
    })
  }

  rows.sort((left, right) => left.supplierName.localeCompare(right.supplierName))

  const totalPayable = totals.current.plus(totals.d1_30).plus(totals.d31_60).plus(totals.d61)
  const summary = {
    totalPayable: totalPayable.toFixed(),
    current: totals.current.toFixed(),
    overdue1to30: totals.d1_30.toFixed(),
    overdueOver30: totals.d31_60.plus(totals.d61).toFixed(),
    asOf: startOfDay(asOf).toISOString(),
  }

  let selected = null
  if (query.supplierId) {
    selected = await supplierOverview(query.supplierId, { ...query, asOf }, user)
  }

  return {
    summary,
    totals: presentMoneyBuckets(totals),
    rows,
    selectedSupplier: selected,
  }
}

export async function balancesBySupplier(query, user) {
  const asOf = query.asOf ? new Date(query.asOf) : new Date()
  const filter = scopeToBranches({ status: 'posted' }, user)
  if (query.branchId) filter.branchId = query.branchId
  if (query.currencyId) filter.currencyId = query.currencyId
  if (query.supplierIds?.length) filter.supplierId = { $in: query.supplierIds }

  const invoices = await loadOpenInvoices(filter)
  const map = new Map()
  const totals = emptyBuckets()

  for (const invoice of invoices) {
    const open = outstandingOf(invoice)
    if (open.lte(0)) continue
    const key = String(invoice.supplierId)
    if (!map.has(key)) {
      map.set(key, { buckets: emptyBuckets(), outstanding: new Decimal(0) })
    }
    const row = map.get(key)
    const bucket = bucketKey(daysPastDue(invoice.dueDate, asOf))
    row.buckets[bucket] = row.buckets[bucket].plus(open)
    row.outstanding = row.outstanding.plus(open)
    totals[bucket] = totals[bucket].plus(open)
  }

  const bySupplier = new Map()
  for (const [key, row] of map.entries()) {
    bySupplier.set(key, {
      outstanding: row.outstanding.toFixed(),
      current: row.buckets.current.toFixed(),
      d1_30: row.buckets.d1_30.toFixed(),
      d31_60: row.buckets.d31_60.toFixed(),
      d61: row.buckets.d61.toFixed(),
      overdue: row.buckets.d1_30.plus(row.buckets.d31_60).plus(row.buckets.d61).toFixed(),
      overdueOver30: row.buckets.d31_60.plus(row.buckets.d61).toFixed(),
    })
  }

  const totalPayable = totals.current.plus(totals.d1_30).plus(totals.d31_60).plus(totals.d61)
  return {
    asOf: startOfDay(asOf).toISOString(),
    bySupplier,
    summary: {
      totalPayable: totalPayable.toFixed(),
      current: totals.current.toFixed(),
      overdue1to30: totals.d1_30.toFixed(),
      overdueOver30: totals.d31_60.plus(totals.d61).toFixed(),
      suppliersWithBalance: bySupplier.size,
    },
  }
}

export async function supplierOverview(supplierId, query, user) {
  const asOf = query.asOf ? new Date(query.asOf) : new Date()
  const supplier = assertFound(
    await Supplier.findById(supplierId)
      .select('code name paymentTerms payableAccount currencyId status')
      .lean(),
    'Supplier not found',
  )

  const filter = scopeToBranches({ supplierId, status: 'posted' }, user)
  if (query.branchId) filter.branchId = query.branchId
  if (query.currencyId) filter.currencyId = query.currencyId

  const [invoices, payments] = await Promise.all([
    loadOpenInvoices(filter),
    SupplierPayment.find({ ...filter, status: 'posted' })
      .select(
        'unallocatedAmount allocations paymentNumber paymentDate bankName amount allocatedAmount notes',
      )
      .sort({ paymentDate: -1, createdAt: -1 })
      .lean(),
  ])

  let outstanding = new Decimal(0)
  let overdue = new Decimal(0)
  let current = new Decimal(0)
  let nextDue = null
  const followUp = []
  const purchaseLedger = []

  for (const invoice of invoices) {
    const open = outstandingOf(invoice)
    const amount = asDecimal(invoice.amount)
    const paid = asDecimal(invoice.paidAmount)
    purchaseLedger.push({
      _id: invoice._id,
      purchaseNumber: invoice.purchaseNumber,
      dueDate: invoice.dueDate,
      invoiceDate: invoice.invoiceDate,
      amount: amount.toFixed(),
      paidAmount: paid.toFixed(),
      outstanding: Decimal.max(open, 0).toFixed(),
      isOverdue: open.gt(0) && daysPastDue(invoice.dueDate, asOf) > 0,
    })
    if (open.lte(0)) continue
    outstanding = outstanding.plus(open)
    const days = daysPastDue(invoice.dueDate, asOf)
    if (days > 0) {
      overdue = overdue.plus(open)
      followUp.push({
        purchaseNumber: invoice.purchaseNumber,
        dueDate: invoice.dueDate,
        outstanding: open.toFixed(),
        daysPastDue: days,
      })
    } else {
      current = current.plus(open)
    }
    const candidate = {
      dueDate: invoice.dueDate,
      amount: open.toFixed(),
      purchaseNumber: invoice.purchaseNumber,
      days,
    }
    if (days <= 0) {
      if (!nextDue || nextDue.days > 0 || new Date(invoice.dueDate) < new Date(nextDue.dueDate)) {
        nextDue = candidate
      }
    } else if (!nextDue) {
      nextDue = candidate
    }
  }

  purchaseLedger.sort((left, right) => new Date(left.dueDate) - new Date(right.dueDate))
  followUp.sort((left, right) => right.daysPastDue - left.daysPastDue)

  let unallocatedAdvance = new Decimal(0)
  for (const payment of payments) {
    unallocatedAdvance = unallocatedAdvance.plus(asDecimal(payment.unallocatedAmount))
  }

  const latestPayment = payments[0] || null
  const latestAllocation =
    latestPayment?.allocations?.length > 0
      ? {
          paymentNumber: latestPayment.paymentNumber,
          paymentDate: latestPayment.paymentDate,
          bankName: latestPayment.bankName || '',
          amount: asDecimal(latestPayment.allocations[0].amount).toFixed(),
          purchaseNumber: latestPayment.allocations[0].purchaseNumber,
          note: latestPayment.bankName
            ? `${latestPayment.paymentNumber} · PKR ${asDecimal(latestPayment.allocations[0].amount).toFixed()} allocated via ${latestPayment.bankName}. Applied to ${latestPayment.allocations[0].purchaseNumber}.`
            : `${latestPayment.paymentNumber} · PKR ${asDecimal(latestPayment.allocations[0].amount).toFixed()} allocated. Applied to ${latestPayment.allocations[0].purchaseNumber}.`,
        }
      : null

  return {
    supplierId: supplier._id,
    supplierCode: supplier.code,
    supplierName: supplier.name,
    payableAccount: supplier.payableAccount,
    paymentTerms: supplier.paymentTerms,
    paymentTermsLabel: PAYMENT_TERMS_LABELS[supplier.paymentTerms] || '',
    outstanding: outstanding.toFixed(),
    current: current.toFixed(),
    overdue: overdue.toFixed(),
    unallocatedAdvance: unallocatedAdvance.toFixed(),
    nextDue,
    followUp,
    purchaseLedger,
    latestAllocation,
    asOf: startOfDay(asOf).toISOString(),
  }
}

export async function listInvoices(query, user) {
  const page = pagination(query, INVOICE_SORT)
  const asOf = query.asOf ? new Date(query.asOf) : new Date()
  const filter = scopeToBranches(listQuery(query, { searchFields: ['purchaseNumber'] }), user)
  if (query.branchId) filter.branchId = query.branchId
  if (query.supplierId) filter.supplierId = query.supplierId
  if (query.currencyId) filter.currencyId = query.currencyId

  const [items, total] = await Promise.all([
    SupplierInvoice.find(filter)
      .sort(page.sort)
      .skip(page.skip)
      .limit(page.limit)
      .lean(),
    SupplierInvoice.countDocuments(filter),
  ])

  let presented = items.map((row) => presentInvoice(row, asOf))
  if (query.overdueOnly) {
    presented = presented.filter((row) => row.isOverdue)
  }
  return { items: presented, meta: page.meta(total) }
}

export async function listSupplierInvoices(supplierId, query, user) {
  return listInvoices({ ...query, supplierId }, user)
}

export async function getInvoice(id, user) {
  const doc = await SupplierInvoice.findOne(scopeToBranches({ _id: id }, user)).lean()
  return presentInvoice(assertFound(doc, 'Invoice not found'))
}

export async function createInvoiceInSession(body, user, session) {
  const branch = await assertBranch(body.branchId, user)
  const supplier = await assertSupplier(body.supplierId)
  const currencyId = await resolveCurrencyId(body.currencyId, supplier)
  const invoiceDate = body.invoiceDate ? new Date(body.invoiceDate) : new Date()
  const termsDays = TERMS_DAYS[supplier.paymentTerms] ?? 30
  const dueDate = body.dueDate ? new Date(body.dueDate) : addDays(startOfDay(invoiceDate), termsDays)
  const amount = asDecimal(body.amount)
  if (amount.lte(0)) {
    throw new ApiError(400, 'Invalid amount', [
      { field: 'amount', message: 'Amount must be positive' },
    ])
  }

  const purchaseNumber = body.purchaseNumber
    ? String(body.purchaseNumber).trim().toUpperCase()
    : await documentNumber.next('PO', session)

  const [doc] = await SupplierInvoice.create(
    [
      {
        purchaseNumber,
        branchId: branch._id,
        supplierId: supplier._id,
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
    supplierId: supplier._id,
    currencyId,
    entryDate: invoiceDate,
    sourceType: 'purchase',
    sourceId: doc._id,
    sourceNumber: purchaseNumber,
    debit: '0',
    credit: amount.toFixed(),
    description: body.notes || `Purchase ${purchaseNumber}`,
    session,
  })

  return presentInvoice(doc.toObject ? doc.toObject() : doc)
}

export async function creditPayableInSession(
  { branchId, supplierId, currencyId, sourceNumber, amount, entryDate, description },
  session,
) {
  const creditAmount = asDecimal(amount)
  if (creditAmount.lte(0)) {
    throw new ApiError(400, 'Invalid amount', [
      { field: 'amount', message: 'Amount must be positive' },
    ])
  }
  await appendLedger({
    branchId,
    supplierId,
    currencyId,
    entryDate: entryDate || new Date(),
    sourceType: 'payment',
    sourceId: supplierId,
    sourceNumber,
    debit: creditAmount.toFixed(),
    credit: '0',
    description: description || `Return credit ${sourceNumber}`,
    session,
  })
}

export async function createInvoice(body, user) {
  try {
    return await withTransaction(async (session) => createInvoiceInSession(body, user, session))
  } catch (error) {
    rethrowDuplicate(error, 'purchaseNumber', 'Purchase number already exists')
  }
}

export async function applyAdvanceInSession(
  { paymentId, supplierId, invoiceId, purchaseNumber, amount },
  session,
) {
  const applyAmount = asDecimal(amount)
  if (applyAmount.lte(0)) return null

  const payment = await SupplierPayment.findOne({
    _id: paymentId,
    supplierId,
    status: 'posted',
  }).session(session)
  if (!payment) {
    throw new ApiError(400, 'Unknown advance payment', [
      { field: 'advancePaymentId', message: 'Posted supplier advance not found' },
    ])
  }
  const available = asDecimal(payment.unallocatedAmount)
  if (applyAmount.gt(available)) {
    throw new ApiError(400, 'Advance exceeds unallocated', [
      {
        field: 'paidAmount',
        message: 'Applied advance cannot exceed unallocated payment amount',
      },
    ])
  }

  payment.unallocatedAmount = money.toDecimal(available.minus(applyAmount).toFixed())
  payment.allocatedAmount = money.toDecimal(
    asDecimal(payment.allocatedAmount).plus(applyAmount).toFixed(),
  )
  if (invoiceId) {
    payment.allocations.push({
      invoiceId,
      purchaseNumber: purchaseNumber || '',
      amount: money.toDecimal(applyAmount.toFixed()),
    })
    const invoice = await SupplierInvoice.findById(invoiceId).session(session)
    if (invoice) {
      const nextPaid = asDecimal(invoice.paidAmount).plus(applyAmount)
      if (nextPaid.gt(asDecimal(invoice.amount))) {
        throw new ApiError(400, 'Advance exceeds invoice', [
          { field: 'paidAmount', message: 'Applied advance cannot exceed invoice amount' },
        ])
      }
      invoice.paidAmount = money.toDecimal(nextPaid.toFixed())
      await invoice.save({ session })
    }
  }
  await payment.save({ session })
  return presentPayment(payment.toObject())
}

export async function listPayments(query, user) {
  const page = pagination(query, PAYMENT_SORT)
  const filter = scopeToBranches(listQuery(query, { searchFields: ['paymentNumber', 'bankName'] }), user)
  if (query.branchId) filter.branchId = query.branchId
  if (query.supplierId) filter.supplierId = query.supplierId
  if (query.currencyId) filter.currencyId = query.currencyId

  const [items, total] = await Promise.all([
    SupplierPayment.find(filter).sort(page.sort).skip(page.skip).limit(page.limit).lean(),
    SupplierPayment.countDocuments(filter),
  ])
  return { items: items.map(presentPayment), meta: page.meta(total) }
}

export async function getPayment(id, user) {
  const doc = await SupplierPayment.findOne(scopeToBranches({ _id: id }, user)).lean()
  return presentPayment(assertFound(doc, 'Payment not found'))
}

export async function createPayment(body, user) {
  const branch = await assertBranch(body.branchId, user)
  const supplier = await assertSupplier(body.supplierId)
  const currencyId = await resolveCurrencyId(body.currencyId, supplier)
  const paymentDate = body.paymentDate ? new Date(body.paymentDate) : new Date()
  const amount = asDecimal(body.amount)
  const allocations = body.allocations || []

  let allocated = new Decimal(0)
  for (const row of allocations) {
    allocated = allocated.plus(asDecimal(row.amount))
  }
  if (allocated.gt(amount)) {
    throw new ApiError(400, 'Allocation exceeds payment', [
      { field: 'allocations', message: 'Allocated amount cannot exceed payment amount' },
    ])
  }

  return withTransaction(async (session) => {
    const mapped = []
    for (let index = 0; index < allocations.length; index += 1) {
      const row = allocations[index]
      const invoice = await SupplierInvoice.findOne({
        _id: row.invoiceId,
        supplierId: supplier._id,
        branchId: branch._id,
        status: 'posted',
      }).session(session)
      if (!invoice) {
        throw new ApiError(400, 'Unknown invoice', [
          { field: `allocations.${index}.invoiceId`, message: 'Invoice not found for this supplier' },
        ])
      }
      const open = outstandingOf(invoice)
      const apply = asDecimal(row.amount)
      if (apply.gt(open)) {
        throw new ApiError(400, 'Over-allocation', [
          {
            field: `allocations.${index}.amount`,
            message: 'Allocation cannot exceed invoice outstanding',
          },
        ])
      }
      invoice.paidAmount = money.toDecimal(asDecimal(invoice.paidAmount).plus(apply).toFixed())
      await invoice.save({ session })
      mapped.push({
        invoiceId: invoice._id,
        purchaseNumber: invoice.purchaseNumber,
        amount: money.toDecimal(apply.toFixed()),
      })
    }

    const paymentNumber = await documentNumber.next('PAY', session)
    const unallocated = amount.minus(allocated)
    const [payment] = await SupplierPayment.create(
      [
        {
          paymentNumber,
          branchId: branch._id,
          supplierId: supplier._id,
          currencyId,
          paymentDate,
          amount: money.toDecimal(amount.toFixed()),
          allocatedAmount: money.toDecimal(allocated.toFixed()),
          unallocatedAmount: money.toDecimal(unallocated.toFixed()),
          paymentMethod: body.paymentMethod,
          bankName: body.paymentMethod === 'bank' ? String(body.bankName || '').trim() : '',
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
      supplierId: supplier._id,
      currencyId,
      entryDate: paymentDate,
      sourceType: 'payment',
      sourceId: payment._id,
      sourceNumber: paymentNumber,
      debit: amount.toFixed(),
      credit: '0',
      description:
        body.paymentMethod === 'bank'
          ? `Payment ${paymentNumber} via ${String(body.bankName || '').trim()}`
          : `Payment ${paymentNumber}`,
      session,
    })

    return presentPayment(payment.toObject())
  })
}

export async function listLedger(supplierId, query, user) {
  const page = pagination(query, LEDGER_SORT)
  assertFound(await Supplier.findById(supplierId).select('_id').lean(), 'Supplier not found')
  const filter = scopeToBranches({ supplierId }, user)
  if (query.branchId) filter.branchId = query.branchId
  if (query.currencyId) filter.currencyId = query.currencyId
  if (query.from || query.to) {
    filter.entryDate = {}
    if (query.from) filter.entryDate.$gte = new Date(query.from)
    if (query.to) filter.entryDate.$lte = new Date(query.to)
  }

  const [items, total] = await Promise.all([
    SupplierLedgerEntry.find(filter)
      .sort({ entryDate: 1, createdAt: 1 })
      .skip(page.skip)
      .limit(page.limit)
      .lean(),
    SupplierLedgerEntry.countDocuments(filter),
  ])

  return { items: items.map(presentLedger), meta: page.meta(total) }
}
