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
import { Product } from '../product/product.model.js'
import { Branch } from '../branch/branch.model.js'
import { Warehouse } from '../warehouse/warehouse.model.js'
import { Currency } from '../currency/currency.model.js'
import { Customer } from '../customer/customer.model.js'
import { PackingUnit } from '../packingUnit/packingUnit.model.js'
import { User } from '../user/user.model.js'
import { apply } from '../inventory/inventory.service.js'
import { StockBalance } from '../inventory/stockBalance.model.js'
import { CustomerInvoice } from '../receivables/customerInvoice.model.js'
import { PAYMENT_TERMS_LABELS } from '../customer/customer.constants.js'
import {
  createInvoiceInSession,
  createReceiptInSession,
} from '../receivables/receivables.service.js'
import { TERMS_DAYS } from '../receivables/receivables.constants.js'
import {
  PAYMENT_STATE_LABELS,
  SALE_STATUS_LABELS,
  SALE_WORKSPACE_STATUS_LABELS,
  SHIPPING_METHOD_LABELS,
} from './sale.constants.js'
import { Sale } from './sale.model.js'
import { SaleItem } from './saleItem.model.js'

const SALE_SORT = ['saleDate', 'saleNumber', 'total', 'createdAt']

function asDecimal(value) {
  return new Decimal(decimalText(value) || '0')
}

function startOfMonth(yearMonth) {
  const [year, month] = yearMonth.split('-').map(Number)
  return new Date(Date.UTC(year, month - 1, 1))
}

function endOfMonth(yearMonth) {
  const [year, month] = yearMonth.split('-').map(Number)
  return new Date(Date.UTC(year, month, 0, 23, 59, 59, 999))
}

function startOfDay(value) {
  const date = new Date(value)
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()))
}

function endOfDay(value) {
  const date = startOfDay(value)
  date.setUTCHours(23, 59, 59, 999)
  return date
}

function previousMonth(yearMonth) {
  const start = startOfMonth(yearMonth)
  start.setUTCMonth(start.getUTCMonth() - 1)
  return `${start.getUTCFullYear()}-${String(start.getUTCMonth() + 1).padStart(2, '0')}`
}

function currentMonthKey(date = new Date()) {
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, '0')}`
}

function addDays(date, days) {
  const next = new Date(date)
  next.setUTCDate(next.getUTCDate() + days)
  return next
}

function percentChange(current, previous) {
  if (previous.gt(0)) return current.minus(previous).div(previous).times(100).toFixed(1)
  if (current.gt(0)) return '100.0'
  return '0.0'
}

function workspaceStatus(doc) {
  const paid = asDecimal(doc.paidAmount)
  const balance = asDecimal(doc.balanceAmount)
  if (doc.status === 'posted' && paid.gt(0) && balance.gt(0)) return 'part_paid'
  return doc.status
}

function workspaceStatusLabel(doc) {
  return SALE_WORKSPACE_STATUS_LABELS[workspaceStatus(doc)] || SALE_STATUS_LABELS[doc.status] || ''
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
    throw new ApiError(400, 'Inactive branch', [{ field: 'branchId', message: 'Branch must be active' }])
  }
  return branch
}

async function assertWarehouse(warehouseId, branchId) {
  const warehouse = await Warehouse.findById(warehouseId).select('_id name code branchId status').lean()
  if (!warehouse || warehouse.status !== 'active') {
    throw new ApiError(400, 'Inactive warehouse', [
      { field: 'warehouseId', message: 'Warehouse must be active' },
    ])
  }
  if (String(warehouse.branchId) !== String(branchId)) {
    throw new ApiError(400, 'Warehouse branch mismatch', [
      { field: 'warehouseId', message: 'Warehouse does not belong to this branch' },
    ])
  }
  return warehouse
}

async function assertCustomer(customerId) {
  const customer = await Customer.findById(customerId)
    .select('_id code name paymentTerms currencyId creditLimit status')
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

async function mapLines(lines, headerTaxRate = '0') {
  const mapped = []
  let gross = new Decimal(0)
  let lineDiscountTotal = new Decimal(0)
  let lineNetTotal = new Decimal(0)
  const taxRate = asDecimal(headerTaxRate)

  for (let index = 0; index < lines.length; index += 1) {
    const row = lines[index]
    const product = await Product.findById(row.productId)
      .select('_id sku name status costPrice packingUnitId quantityUnitId')
      .populate([
        {
          path: 'packingUnitId',
          select: 'name shortCode conversionQuantity quantityUnitId',
          populate: { path: 'quantityUnitId', select: 'name shortCode' },
        },
        { path: 'quantityUnitId', select: 'name shortCode' },
      ])
      .lean()
    if (!product || product.status !== 'active') {
      throw new ApiError(400, 'Inactive product', [
        { field: `lines.${index}.productId`, message: 'Product must be active' },
      ])
    }

    let packing = product.packingUnitId || null
    if (row.packingUnitId) {
      packing = await PackingUnit.findById(row.packingUnitId)
        .select('name shortCode conversionQuantity quantityUnitId status')
        .populate({ path: 'quantityUnitId', select: 'name shortCode' })
        .lean()
      if (!packing || packing.status !== 'active') {
        throw new ApiError(400, 'Inactive packing unit', [
          { field: `lines.${index}.packingUnitId`, message: 'Packing unit must be active' },
        ])
      }
    }

    const quantity = asDecimal(row.quantity)
    const unitPrice = asDecimal(row.unitPrice)
    const factor = packing ? asDecimal(packing.conversionQuantity) : asDecimal('1')
    const stockQuantity = quantity.times(factor)
    const lineGross = quantity.times(unitPrice)
    let discountPercent = asDecimal(row.discountPercent || '0')
    let discountAmount = asDecimal(row.discountAmount || '0')
    if (row.discountPercent != null && row.discountAmount == null) {
      discountAmount = lineGross.times(discountPercent).div(100)
    } else if (row.discountAmount != null && row.discountPercent == null && lineGross.gt(0)) {
      discountPercent = discountAmount.div(lineGross).times(100)
    } else if (row.discountPercent != null && row.discountAmount != null) {
      discountAmount = asDecimal(row.discountAmount)
      discountPercent = asDecimal(row.discountPercent)
    }
    if (discountAmount.gt(lineGross)) {
      throw new ApiError(400, 'Line discount too high', [
        { field: `lines.${index}.discountAmount`, message: 'Discount cannot exceed line gross' },
      ])
    }
    const lineNet = lineGross.minus(discountAmount)
    const lineTaxRate = row.taxRate != null ? asDecimal(row.taxRate) : taxRate
    const taxAmount = lineNet.times(lineTaxRate).div(100)
    const lineTotalWithTax = lineNet.plus(taxAmount)
    const unitShort = packing?.quantityUnitId?.shortCode || product.quantityUnitId?.shortCode || ''
    const packingLabel = packing
      ? `${packing.name || packing.shortCode} × ${factor.toFixed()}`
      : product.quantityUnitId
        ? `${product.quantityUnitId.shortCode || product.quantityUnitId.name} × 1`
        : '× 1'

    gross = gross.plus(lineGross)
    lineDiscountTotal = lineDiscountTotal.plus(discountAmount)
    lineNetTotal = lineNetTotal.plus(lineNet)

    mapped.push({
      productId: product._id,
      packingUnitId: packing?._id || null,
      packingLabel,
      packingFactor: money.toDecimal(factor.toFixed()),
      quantity: money.toDecimal(quantity.toFixed()),
      stockQuantity: money.toDecimal(stockQuantity.toFixed()),
      unitPrice: money.toDecimal(unitPrice.toFixed()),
      discountPercent: money.toDecimal(discountPercent.toFixed()),
      discountAmount: money.toDecimal(discountAmount.toFixed()),
      taxRate: money.toDecimal(lineTaxRate.toFixed()),
      taxAmount: money.toDecimal(taxAmount.toFixed()),
      lineNet: money.toDecimal(lineNet.toFixed()),
      lineTotal: money.toDecimal(lineTotalWithTax.toFixed()),
      _product: product,
      _unitShort: unitShort,
      _lineTax: taxAmount,
    })
  }
  return { mapped, gross, lineDiscountTotal, lineNetTotal }
}

function totalsFrom({
  gross,
  lineDiscountTotal,
  lineTaxTotal,
  taxRate,
  documentDiscount,
  shippingAmount,
  paidAmount,
  discountMethod,
}) {
  const method = discountMethod || 'line'
  let discount = asDecimal(documentDiscount || '0')
  if (method === 'line' || (!documentDiscount && lineDiscountTotal.gt(0))) {
    discount = lineDiscountTotal
  }
  if (discount.lt(lineDiscountTotal) && method === 'document' && lineDiscountTotal.gt(0)) {
    discount = lineDiscountTotal
  }
  if (discount.gt(gross)) {
    throw new ApiError(400, 'Invalid discount', [
      { field: 'discount', message: 'Discount cannot exceed subtotal' },
    ])
  }
  const netSubtotal = gross.minus(discount)
  const rate = asDecimal(taxRate || '0')
  // Prefer summed line tax when lines carry per-line rates; else header rate on net
  const tax =
    lineTaxTotal != null && asDecimal(lineTaxTotal).gt(0)
      ? asDecimal(lineTaxTotal)
      : netSubtotal.times(rate).div(100)
  const shipping = asDecimal(shippingAmount || '0')
  if (shipping.lt(0)) {
    throw new ApiError(400, 'Invalid shipping', [
      { field: 'shippingAmount', message: 'Shipping cannot be negative' },
    ])
  }
  const total = netSubtotal.plus(tax).plus(shipping)
  const paid = asDecimal(paidAmount || '0')
  if (paid.lt(0) || paid.gt(total)) {
    throw new ApiError(400, 'Invalid paid amount', [
      { field: 'paidAmount', message: 'paidAmount must be between 0 and total' },
    ])
  }
  return {
    subtotal: money.toDecimal(gross.toFixed()),
    discount: money.toDecimal(discount.toFixed()),
    netSubtotal: money.toDecimal(netSubtotal.toFixed()),
    taxRate: money.toDecimal(rate.toFixed()),
    tax: money.toDecimal(tax.toFixed()),
    shippingAmount: money.toDecimal(shipping.toFixed()),
    total: money.toDecimal(total.toFixed()),
    paidAmount: money.toDecimal(paid.toFixed()),
    balanceAmount: money.toDecimal(total.minus(paid).toFixed()),
    discountMethod: method,
    taxBasis: 'net_subtotal',
  }
}

function paymentStateOf(paidAmount, total) {
  const paid = asDecimal(paidAmount)
  const grand = asDecimal(total)
  if (paid.lte(0)) return 'unpaid'
  if (paid.gte(grand)) return 'paid'
  return 'partially_paid'
}

function postingPreview(amounts) {
  const net = asDecimal(amounts.netSubtotal)
  const tax = asDecimal(amounts.tax)
  const shipping = asDecimal(amounts.shippingAmount || '0')
  const total = asDecimal(amounts.total)
  const salesCredit = net.plus(shipping)
  return {
    balanced: salesCredit.plus(tax).eq(total),
    previewOnly: true,
    lines: [
      { account: 'Customer AR', debit: total.toFixed(), credit: null },
      { account: 'Sales', debit: null, credit: net.toFixed() },
      ...(shipping.gt(0)
        ? [{ account: 'Shipping Income', debit: null, credit: shipping.toFixed() }]
        : []),
      { account: 'Output Tax', debit: null, credit: tax.toFixed() },
    ],
  }
}

function workflow(doc) {
  return {
    draft: { done: true, current: doc.status === 'draft', at: doc.createdAt },
    approved: {
      done: ['approved', 'posted'].includes(doc.status),
      current: doc.status === 'approved',
      at: doc.approvedAt || null,
    },
    posted: { done: doc.status === 'posted', current: doc.status === 'posted', at: doc.postedAt || null },
  }
}

function itemWriteFields(row) {
  return {
    productId: row.productId,
    packingUnitId: row.packingUnitId,
    packingLabel: row.packingLabel,
    packingFactor: row.packingFactor,
    quantity: row.quantity,
    stockQuantity: row.stockQuantity,
    unitPrice: row.unitPrice,
    discountPercent: row.discountPercent,
    discountAmount: row.discountAmount,
    taxRate: row.taxRate,
    taxAmount: row.taxAmount,
    lineNet: row.lineNet,
    lineTotal: row.lineTotal,
  }
}

function presentItem(item, product, stockOnHand = null, unitShort = '') {
  const taxRate = asDecimal(item.taxRate)
  const discountPercent = asDecimal(item.discountPercent || '0')
  const needed = asDecimal(item.stockQuantity || item.quantity)
  const onHand = asDecimal(stockOnHand || '0')
  return {
    _id: item._id,
    productId: product?._id || item.productId,
    sku: product?.sku || '',
    productName: product?.name || '',
    packingUnitId: item.packingUnitId || null,
    packingLabel: item.packingLabel || '',
    packingFactor: asDecimal(item.packingFactor || '1').toFixed(),
    quantity: asDecimal(item.quantity).toFixed(),
    stockQuantity: needed.toFixed(),
    stockOnHand: stockOnHand,
    stockAvailable: onHand.gte(needed),
    unit: unitShort,
    unitShortCode: unitShort,
    unitPrice: asDecimal(item.unitPrice).toFixed(),
    discountPercent: discountPercent.toFixed(),
    discountLabel: `${discountPercent.toFixed()}%`,
    discountAmount: asDecimal(item.discountAmount).toFixed(),
    taxRate: taxRate.toFixed(),
    taxLabel: `${taxRate.toFixed()}%`,
    taxAmount: asDecimal(item.taxAmount).toFixed(),
    lineNet: asDecimal(item.lineNet || item.lineTotal).toFixed(),
    lineTotal: asDecimal(item.lineTotal).toFixed(),
  }
}

function presentSale(doc, items = [], extras = {}) {
  const amounts = {
    subtotal: asDecimal(doc.subtotal).toFixed(),
    discount: asDecimal(doc.discount).toFixed(),
    netSubtotal: asDecimal(
      doc.netSubtotal || asDecimal(doc.subtotal).minus(asDecimal(doc.discount)),
    ).toFixed(),
    taxRate: asDecimal(doc.taxRate).toFixed(),
    tax: asDecimal(doc.tax).toFixed(),
    shippingAmount: asDecimal(doc.shippingAmount || '0').toFixed(),
    total: asDecimal(doc.total).toFixed(),
    paidAmount: asDecimal(doc.paidAmount).toFixed(),
    balanceAmount: asDecimal(doc.balanceAmount).toFixed(),
  }
  const customer = doc.customerId
  const branch = doc.branchId
  const warehouse = doc.warehouseId
  const currency = doc.currencyId
  const paymentTerms = customer?.paymentTerms || extras.paymentTerms || ''
  const wsStatus = workspaceStatus(doc)
  const paymentState = paymentStateOf(amounts.paidAmount, amounts.total)
  const stockAvailable = items.length > 0 && items.every((row) => row.stockAvailable !== false)
  const shippingMethod = doc.shippingMethod || 'none'

  return {
    _id: doc._id,
    saleNumber: doc.saleNumber,
    document: doc.saleNumber,
    draftLabel: doc.status === 'draft' ? `Draft ${doc.saleNumber}` : doc.saleNumber,
    formNote:
      'Inventory is reserved when the sale is approved. All amounts are in PKR.',
    branchId: branch ? { _id: branch._id, code: branch.code, name: branch.name } : doc.branchId,
    warehouseId: warehouse
      ? { _id: warehouse._id, code: warehouse.code, name: warehouse.name }
      : doc.warehouseId,
    customerId: customer
      ? {
          _id: customer._id,
          code: customer.code,
          name: customer.name,
          paymentTerms,
          paymentTermsLabel: PAYMENT_TERMS_LABELS[paymentTerms] || '',
        }
      : doc.customerId,
    currencyId: currency
      ? { _id: currency._id, code: currency.code, name: currency.name, symbol: currency.symbol || '' }
      : doc.currencyId,
    exchangeRate: asDecimal(doc.exchangeRate || '1').toFixed(6),
    saleDate: doc.saleDate,
    dueDate: doc.dueDate,
    terms: PAYMENT_TERMS_LABELS[paymentTerms] || '',
    paymentTerms,
    paymentTermsLabel: PAYMENT_TERMS_LABELS[paymentTerms] || '',
    soldById: doc.soldById || null,
    soldByName: doc.soldByName || '',
    status: doc.status,
    statusLabel: SALE_STATUS_LABELS[doc.status] || '',
    workspaceStatus: wsStatus,
    workspaceStatusLabel: workspaceStatusLabel(doc),
    workflow: workflow(doc),
    discountMethod: doc.discountMethod || 'line',
    taxBasis: doc.taxBasis || 'net_subtotal',
    ...amounts,
    receivable: amounts.balanceAmount,
    paymentState,
    paymentStateLabel: PAYMENT_STATE_LABELS[paymentState] || '',
    totals: {
      subtotal: amounts.subtotal,
      discount: amounts.discount,
      discountSigned: `-${amounts.discount}`,
      netSubtotal: amounts.netSubtotal,
      tax: amounts.tax,
      taxRate: amounts.taxRate,
      taxLabel: `Tax (${amounts.taxRate}%)`,
      shipping: amounts.shippingAmount,
      shippingAmount: amounts.shippingAmount,
      grandTotal: amounts.total,
      paidAmount: amounts.paidAmount,
      receivable: amounts.balanceAmount,
      receivableBadge: `Receivable PKR ${amounts.balanceAmount}`,
    },
    postingPreview: postingPreview(amounts),
    receiptMethod: doc.receiptMethod || '',
    bankName: doc.bankName || '',
    customerReference: doc.customerReference || '',
    createShipmentAfterPost: Boolean(doc.createShipmentAfterPost),
    shippingMethod,
    shippingMethodLabel: SHIPPING_METHOD_LABELS[shippingMethod] || '',
    shippingEta: doc.shippingEta || null,
    stockAvailable,
    stockAvailableLabel: stockAvailable ? 'Stock available' : 'Insufficient stock',
    stockImpactSummary: extras.stockImpactSummary || '',
    stockUnchanged: doc.status === 'draft' || doc.status === 'approved',
    inventoryReserved: Boolean(doc.reservedAt) && doc.status === 'approved',
    canApprove: doc.status === 'draft',
    canPost: doc.status === 'approved',
    canCancel: ['draft', 'approved'].includes(doc.status),
    notes: doc.notes || '',
    approvedAt: doc.approvedAt,
    reservedAt: doc.reservedAt,
    postedAt: doc.postedAt,
    receivableInvoiceId: doc.receivableInvoiceId,
    receiptId: doc.receiptId,
    lines: items,
    createdAt: doc.createdAt,
    updatedAt: doc.updatedAt,
  }
}

function presentListRow(doc) {
  const customer = doc.customerId
  const branch = doc.branchId
  const warehouse = doc.warehouseId
  const wsStatus = workspaceStatus(doc)
  return {
    _id: doc._id,
    saleNumber: doc.saleNumber,
    document: doc.saleNumber,
    saleDate: doc.saleDate,
    customerId: customer
      ? { _id: customer._id, code: customer.code, name: customer.name }
      : doc.customerId,
    customerName: customer?.name || '',
    branchId: branch ? { _id: branch._id, code: branch.code, name: branch.name } : doc.branchId,
    branchName: branch?.name || '',
    warehouseId: warehouse
      ? { _id: warehouse._id, code: warehouse.code, name: warehouse.name }
      : doc.warehouseId,
    warehouseName: warehouse?.name || '',
    total: asDecimal(doc.total).toFixed(),
    paidAmount: asDecimal(doc.paidAmount).toFixed(),
    receivable: asDecimal(doc.balanceAmount).toFixed(),
    balanceAmount: asDecimal(doc.balanceAmount).toFixed(),
    status: doc.status,
    statusLabel: SALE_STATUS_LABELS[doc.status] || '',
    workspaceStatus: wsStatus,
    workspaceStatusLabel: workspaceStatusLabel(doc),
    createdAt: doc.createdAt,
    updatedAt: doc.updatedAt,
  }
}

async function stockOnHand(warehouseId, productId) {
  const balance = await StockBalance.findOne({
    warehouseId,
    productId,
    inventoryItemId: null,
  })
    .select('quantity')
    .lean()
  return balance ? asDecimal(balance.quantity).toFixed() : '0'
}

function stockImpactSummary(items, warehouseName) {
  if (!items.length) return ''
  const parts = items.map((row) => {
    const qty = asDecimal(row.stockQuantity).toFixed()
    const unit = row.unitShortCode || 'units'
    return `${qty} ${unit}`
  })
  return `Posting issues ${parts.join(', ')} from ${warehouseName || 'warehouse'} and posts customer receivable.`
}

async function resolveSoldBy(body, user) {
  if (body.soldById) {
    const person = await User.findById(body.soldById).select('name').lean()
    if (!person) {
      throw new ApiError(400, 'Unknown user', [
        { field: 'soldById', message: 'Sold-by user does not exist' },
      ])
    }
    return { soldById: person._id, soldByName: person.name }
  }
  if (body.soldByName) {
    return { soldById: null, soldByName: String(body.soldByName).trim() }
  }
  if (user?._id) {
    return { soldById: user._id, soldByName: user.name || '' }
  }
  return { soldById: null, soldByName: '' }
}

async function loadSale(id, user) {
  const doc = await Sale.findOne(scopeToBranches({ _id: id }, user))
    .populate([
      { path: 'customerId', select: 'code name paymentTerms' },
      { path: 'warehouseId', select: 'code name branchId' },
      { path: 'branchId', select: 'code name' },
      { path: 'currencyId', select: 'code name symbol' },
      { path: 'soldById', select: 'name email' },
    ])
    .lean()
  assertFound(doc, 'Sale not found')
  const items = await SaleItem.find({ saleId: id }).lean()
  const products = await Product.find({ _id: { $in: items.map((row) => row.productId) } })
    .select('sku name quantityUnitId')
    .populate({ path: 'quantityUnitId', select: 'name shortCode' })
    .lean()
  const productMap = new Map(products.map((row) => [String(row._id), row]))
  const presentedLines = []
  for (const item of items) {
    const product = productMap.get(String(item.productId))
    const onHand = await stockOnHand(doc.warehouseId?._id || doc.warehouseId, item.productId)
    presentedLines.push(
      presentItem(item, product, onHand, product?.quantityUnitId?.shortCode || ''),
    )
  }
  return presentSale(doc, presentedLines, {
    paymentTerms: doc.customerId?.paymentTerms,
    stockImpactSummary: stockImpactSummary(presentedLines, doc.warehouseId?.name),
  })
}

export async function workspace(query, user) {
  const month = query.month || currentMonthKey()
  const prev = previousMonth(month)
  const branchFilter = scopeToBranches({}, user)
  if (query.branchId) branchFilter.branchId = query.branchId

  const monthStart = startOfMonth(month)
  const monthEnd = endOfMonth(month)
  const prevStart = startOfMonth(prev)
  const prevEnd = endOfMonth(prev)
  const asOf = query.asOf ? new Date(query.asOf) : new Date()
  const todayStart = startOfDay(asOf)
  const todayEnd = endOfDay(asOf)

  const postedFilter = { ...branchFilter, status: 'posted' }
  const [
    monthRows,
    prevRows,
    todayRows,
    openInvoices,
    prevCount,
  ] = await Promise.all([
    Sale.find({ ...postedFilter, saleDate: { $gte: monthStart, $lte: monthEnd } })
      .select('total')
      .lean(),
    Sale.find({ ...postedFilter, saleDate: { $gte: prevStart, $lte: prevEnd } })
      .select('total')
      .lean(),
    Sale.find({ ...postedFilter, postedAt: { $gte: todayStart, $lte: todayEnd } })
      .select('total')
      .lean(),
    CustomerInvoice.find({ ...branchFilter, status: 'posted' })
      .select('amount paidAmount dueDate')
      .lean(),
    Sale.countDocuments({ ...postedFilter, saleDate: { $gte: prevStart, $lte: prevEnd } }),
  ])

  const netSales = monthRows.reduce((sum, row) => sum.plus(asDecimal(row.total)), new Decimal(0))
  const prevSales = prevRows.reduce((sum, row) => sum.plus(asDecimal(row.total)), new Decimal(0))
  const postedToday = todayRows.reduce((sum, row) => sum.plus(asDecimal(row.total)), new Decimal(0))
  const monthCount = monthRows.length
  const averageOrder = monthCount > 0 ? netSales.div(monthCount) : new Decimal(0)
  const prevAverage = prevCount > 0 ? prevSales.div(prevCount) : new Decimal(0)

  let receivable = new Decimal(0)
  let overdueCount = 0
  for (const invoice of openInvoices) {
    const open = asDecimal(invoice.amount).minus(asDecimal(invoice.paidAmount))
    if (open.lte(0)) continue
    receivable = receivable.plus(open)
    if (startOfDay(invoice.dueDate) < todayStart) overdueCount += 1
  }

  return {
    month,
    asOf: todayStart.toISOString(),
    summary: {
      netSales: netSales.toFixed(),
      netSalesChangePercent: percentChange(netSales, prevSales),
      postedToday: postedToday.toFixed(),
      postedTodayCount: todayRows.length,
      receivable: receivable.toFixed(),
      overdueCount,
      averageOrder: averageOrder.toFixed(0),
      averageOrderChangePercent: percentChange(averageOrder, prevAverage),
    },
  }
}

export async function list(query, user) {
  const page = pagination(query, SALE_SORT)
  const filter = scopeToBranches(
    listQuery({ ...query, status: undefined, search: undefined }, { searchFields: [] }),
    user,
  )
  if (query.branchId) filter.branchId = query.branchId
  if (query.warehouseId) filter.warehouseId = query.warehouseId
  if (query.customerId) filter.customerId = query.customerId

  const partPaidOnly = query.status === 'part_paid'
  if (partPaidOnly) {
    filter.status = 'posted'
  } else if (query.status) {
    filter.status = query.status
  }

  if (query.from || query.to) {
    filter.saleDate = {}
    if (query.from) filter.saleDate.$gte = new Date(query.from)
    if (query.to) filter.saleDate.$lte = new Date(query.to)
  }

  if (query.search) {
    const term = String(query.search).trim().replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
    const customers = await Customer.find({
      $or: [
        { name: { $regex: term, $options: 'i' } },
        { code: { $regex: term, $options: 'i' } },
      ],
    })
      .select('_id')
      .lean()
    const customerIds = customers.map((row) => row._id)
    const numberOr = [{ saleNumber: { $regex: term, $options: 'i' } }]
    if (customerIds.length) numberOr.push({ customerId: { $in: customerIds } })
    filter.$or = numberOr
  }

  if (partPaidOnly) {
    const all = await Sale.find(filter)
      .populate([
        { path: 'customerId', select: 'code name' },
        { path: 'warehouseId', select: 'code name' },
        { path: 'branchId', select: 'code name' },
      ])
      .sort(page.sort)
      .lean()
    const filtered = all
      .map(presentListRow)
      .filter((row) => asDecimal(row.paidAmount).gt(0) && asDecimal(row.receivable).gt(0))
    const total = filtered.length
    const items = filtered.slice(page.skip, page.skip + page.limit)
    return { items, meta: page.meta(total) }
  }

  const [items, total] = await Promise.all([
    Sale.find(filter)
      .populate([
        { path: 'customerId', select: 'code name' },
        { path: 'warehouseId', select: 'code name' },
        { path: 'branchId', select: 'code name' },
      ])
      .sort(page.sort)
      .skip(page.skip)
      .limit(page.limit)
      .lean(),
    Sale.countDocuments(filter),
  ])

  return { items: items.map(presentListRow), meta: page.meta(total) }
}

export async function getById(id, user) {
  return loadSale(id, user)
}

export async function create(body, user) {
  const branch = await assertBranch(body.branchId, user)
  const warehouse = await assertWarehouse(body.warehouseId, branch._id)
  const customer = await assertCustomer(body.customerId)
  const currencyId = body.currencyId || customer.currencyId
  await assertCurrency(currencyId)
  const taxRate = body.taxRate || '0'
  const { mapped, gross, lineDiscountTotal } = await mapLines(body.lines, taxRate)
  const lineTaxTotal = mapped.reduce((sum, row) => sum.plus(asDecimal(row.taxAmount)), new Decimal(0))
  const amounts = totalsFrom({
    gross,
    lineDiscountTotal,
    lineTaxTotal,
    taxRate,
    documentDiscount: body.discount,
    shippingAmount: body.shippingAmount || '0',
    paidAmount: body.paidAmount || '0',
    discountMethod: body.discountMethod || 'line',
  })
  const saleDate = body.saleDate ? new Date(body.saleDate) : new Date()
  const termsDays = TERMS_DAYS[customer.paymentTerms] ?? 30
  const dueDate = body.dueDate ? new Date(body.dueDate) : addDays(saleDate, termsDays)
  const soldBy = await resolveSoldBy(body, user)
  const createShipment = Boolean(body.createShipmentAfterPost)
  const shippingMethod = createShipment
    ? body.shippingMethod || 'standard'
    : body.shippingMethod || 'none'

  try {
    return await withTransaction(async (session) => {
      const saleNumber = await documentNumber.next('SL', session)
      const [doc] = await Sale.create(
        [
          {
            saleNumber,
            branchId: branch._id,
            warehouseId: warehouse._id,
            customerId: customer._id,
            currencyId,
            exchangeRate: money.toDecimal(body.exchangeRate || '1'),
            saleDate,
            dueDate,
            ...soldBy,
            status: 'draft',
            ...amounts,
            receiptMethod:
              body.receiptMethod || (asDecimal(amounts.paidAmount).gt(0) ? 'cash' : ''),
            bankName:
              body.receiptMethod === 'bank' ? String(body.bankName || '').trim() : '',
            customerReference: body.customerReference
              ? String(body.customerReference).trim().toUpperCase()
              : '',
            notes: body.notes || '',
            createShipmentAfterPost: createShipment,
            shippingMethod,
            shippingEta: body.shippingEta ? new Date(body.shippingEta) : null,
            createdBy: user?._id || null,
          },
        ],
        { session },
      )
      await SaleItem.insertMany(
        mapped.map((row) => ({ saleId: doc._id, ...itemWriteFields(row) })),
        { session },
      )
      return doc._id
    }).then((id) => loadSale(id, user))
  } catch (error) {
    rethrowDuplicate(error, 'saleNumber', 'Sale number already exists')
  }
}

export async function update(id, body, user) {
  const doc = assertFound(await Sale.findOne(scopeToBranches({ _id: id }, user)), 'Sale not found')
  if (doc.status !== 'draft') {
    throw new ApiError(409, 'Sale is locked', [
      { field: 'status', message: 'Only a draft sale can be edited' },
    ])
  }
  if (body.warehouseId) {
    await assertWarehouse(body.warehouseId, doc.branchId)
    doc.warehouseId = body.warehouseId
  }
  if (body.customerId) {
    const customer = await assertCustomer(body.customerId)
    doc.customerId = customer._id
    if (!body.currencyId) doc.currencyId = customer.currencyId
  }
  if (body.currencyId) {
    await assertCurrency(body.currencyId)
    doc.currencyId = body.currencyId
  }
  if (body.exchangeRate != null) doc.exchangeRate = money.toDecimal(body.exchangeRate)
  if (body.saleDate) doc.saleDate = new Date(body.saleDate)
  if (Object.prototype.hasOwnProperty.call(body, 'dueDate')) {
    doc.dueDate = body.dueDate ? new Date(body.dueDate) : null
  }
  if (body.notes != null) doc.notes = body.notes
  if (body.customerReference != null) {
    doc.customerReference = String(body.customerReference).trim().toUpperCase()
  }
  if (body.soldById != null || body.soldByName != null) {
    Object.assign(doc, await resolveSoldBy(body, user))
  }
  if (body.receiptMethod != null) doc.receiptMethod = body.receiptMethod || ''
  if (body.bankName != null || body.receiptMethod === 'bank') {
    doc.bankName = doc.receiptMethod === 'bank' ? String(body.bankName || doc.bankName || '').trim() : ''
  }
  if (body.discountMethod) doc.discountMethod = body.discountMethod
  if (body.createShipmentAfterPost != null) {
    doc.createShipmentAfterPost = Boolean(body.createShipmentAfterPost)
  }
  if (body.shippingMethod != null) doc.shippingMethod = body.shippingMethod
  if (Object.prototype.hasOwnProperty.call(body, 'shippingEta')) {
    doc.shippingEta = body.shippingEta ? new Date(body.shippingEta) : null
  }
  if (doc.createShipmentAfterPost && (!doc.shippingMethod || doc.shippingMethod === 'none')) {
    doc.shippingMethod = 'standard'
  }

  const taxRate = body.taxRate ?? decimalText(doc.taxRate) ?? '0'
  if (body.lines) {
    const { mapped, gross, lineDiscountTotal } = await mapLines(body.lines, taxRate)
    const lineTaxTotal = mapped.reduce((sum, row) => sum.plus(asDecimal(row.taxAmount)), new Decimal(0))
    const amounts = totalsFrom({
      gross,
      lineDiscountTotal,
      lineTaxTotal,
      taxRate,
      documentDiscount: body.discount ?? decimalText(doc.discount),
      shippingAmount: body.shippingAmount ?? decimalText(doc.shippingAmount),
      paidAmount: body.paidAmount ?? decimalText(doc.paidAmount),
      discountMethod: body.discountMethod || doc.discountMethod || 'line',
    })
    Object.assign(doc, amounts)
    await SaleItem.deleteMany({ saleId: doc._id })
    await SaleItem.insertMany(mapped.map((row) => ({ saleId: doc._id, ...itemWriteFields(row) })))
  } else if (
    body.taxRate != null ||
    body.discount != null ||
    body.paidAmount != null ||
    body.shippingAmount != null ||
    body.discountMethod != null
  ) {
    const items = await SaleItem.find({ saleId: doc._id }).lean()
    const lineDiscountTotal = items.reduce(
      (sum, row) => sum.plus(asDecimal(row.discountAmount)),
      new Decimal(0),
    )
    const lineTaxTotal = items.reduce((sum, row) => sum.plus(asDecimal(row.taxAmount)), new Decimal(0))
    const amounts = totalsFrom({
      gross: asDecimal(doc.subtotal),
      lineDiscountTotal,
      lineTaxTotal,
      taxRate,
      documentDiscount: body.discount ?? decimalText(doc.discount),
      shippingAmount: body.shippingAmount ?? decimalText(doc.shippingAmount),
      paidAmount: body.paidAmount ?? decimalText(doc.paidAmount),
      discountMethod: body.discountMethod || doc.discountMethod || 'line',
    })
    Object.assign(doc, amounts)
  }

  await doc.save()
  return loadSale(doc._id, user)
}

export async function approve(id, user) {
  const doc = assertFound(await Sale.findOne(scopeToBranches({ _id: id }, user)), 'Sale not found')
  if (doc.status !== 'draft') {
    throw new ApiError(400, 'Sale cannot be approved', [
      { field: 'status', message: 'Only a draft sale can be approved' },
    ])
  }
  const now = new Date()
  doc.status = 'approved'
  doc.approvedAt = now
  doc.reservedAt = now
  await doc.save()
  return loadSale(doc._id, user)
}

export async function cancel(id, user) {
  const doc = assertFound(await Sale.findOne(scopeToBranches({ _id: id }, user)), 'Sale not found')
  if (!['draft', 'approved'].includes(doc.status)) {
    throw new ApiError(400, 'Sale cannot be cancelled', [
      { field: 'status', message: 'Only draft or approved sales can be cancelled' },
    ])
  }
  doc.status = 'cancelled'
  await doc.save()
  return loadSale(doc._id, user)
}

export async function post(id, user) {
  return withTransaction(async (session) => {
    const doc = assertFound(
      await Sale.findOne(scopeToBranches({ _id: id }, user)).session(session),
      'Sale not found',
    )
    if (doc.status !== 'approved') {
      throw new ApiError(400, 'Sale cannot be posted', [
        { field: 'status', message: 'Only an approved sale can be posted' },
      ])
    }

    const items = await SaleItem.find({ saleId: doc._id }).session(session)
    for (const item of items) {
      const factor = asDecimal(item.packingFactor || '1')
      const stockOut = asDecimal(item.quantity).times(factor)
      await apply({
        branchId: doc.branchId,
        warehouseId: doc.warehouseId,
        productId: item.productId,
        quantityOut: stockOut.toFixed(),
        unitCost: decimalText(item.unitPrice),
        movementType: 'sale',
        referenceType: 'sale',
        referenceId: doc._id,
        referenceNumber: doc.saleNumber,
        movementDate: doc.saleDate || new Date(),
        createdBy: user?._id || null,
        session,
      })
    }

    const grandTotal = asDecimal(doc.total)
    let receivableInvoiceId = null
    if (grandTotal.gt(0)) {
      const invoice = await createInvoiceInSession(
        {
          branchId: doc.branchId,
          customerId: doc.customerId,
          currencyId: doc.currencyId,
          invoiceNumber: doc.saleNumber,
          invoiceDate: doc.saleDate,
          dueDate: doc.dueDate || doc.saleDate,
          amount: grandTotal.toFixed(),
          notes: `Posted sale ${doc.saleNumber}`,
        },
        user,
        session,
      )
      receivableInvoiceId = invoice._id
    }

    const paid = asDecimal(doc.paidAmount)
    let receiptId = null
    if (paid.gt(0) && receivableInvoiceId) {
      const method = doc.receiptMethod === 'bank' ? 'bank' : 'cash'
      const receipt = await createReceiptInSession(
        {
          branchId: doc.branchId,
          customerId: doc.customerId,
          currencyId: doc.currencyId,
          receiptDate: doc.saleDate,
          amount: paid.toFixed(),
          receiptMethod: method,
          bankName: doc.bankName || '',
          allocations: [{ invoiceId: receivableInvoiceId, amount: paid.toFixed() }],
          notes: `Collection on sale ${doc.saleNumber}`,
        },
        user,
        session,
      )
      receiptId = receipt._id
    }

    doc.status = 'posted'
    doc.postedAt = new Date()
    doc.receivableInvoiceId = receivableInvoiceId
    doc.receiptId = receiptId
    await doc.save({ session })
    return doc._id
  }).then((saleId) => loadSale(saleId, user))
}
