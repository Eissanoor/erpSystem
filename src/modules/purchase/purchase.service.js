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
import { Supplier } from '../supplier/supplier.model.js'
import { PackingUnit } from '../packingUnit/packingUnit.model.js'
import { User } from '../user/user.model.js'
import { apply } from '../inventory/inventory.service.js'
import { StockBalance } from '../inventory/stockBalance.model.js'
import { SupplierInvoice } from '../payables/supplierInvoice.model.js'
import { SupplierPayment } from '../payables/supplierPayment.model.js'
import { PAYMENT_TERMS_LABELS } from '../supplier/supplier.constants.js'
import {
  applyAdvanceInSession,
  createInvoiceInSession,
  creditPayableInSession,
} from '../payables/payables.service.js'
import { TERMS_DAYS } from '../payables/payables.constants.js'
import { InventoryItem } from '../inventory/inventoryItem.model.js'
import {
  PURCHASE_STATUS_LABELS,
  RECEIVING_STATE_LABELS,
  RETURN_STATUS_LABELS,
  RETURN_WORKSPACE_LABELS,
} from './purchase.constants.js'
import { Purchase } from './purchase.model.js'
import { PurchaseItem } from './purchaseItem.model.js'
import { PurchaseReturn } from './purchaseReturn.model.js'

const PURCHASE_SORT = ['purchaseDate', 'purchaseNumber', 'total', 'createdAt']
const RETURN_SORT = ['returnDate', 'returnNumber', 'createdAt']

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

async function assertSupplier(supplierId) {
  const supplier = await Supplier.findById(supplierId)
    .select('_id code name paymentTerms currencyId status')
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
    const discountAmount = asDecimal(row.discountAmount || '0')
    const factor = packing ? asDecimal(packing.conversionQuantity) : asDecimal('1')
    const stockQuantity = quantity.times(factor)
    const lineGross = quantity.times(unitPrice)
    if (discountAmount.gt(lineGross)) {
      throw new ApiError(400, 'Line discount too high', [
        { field: `lines.${index}.discountAmount`, message: 'Discount cannot exceed line gross' },
      ])
    }
    const lineNet = lineGross.minus(discountAmount)
    const lineTaxRate = row.taxRate != null ? asDecimal(row.taxRate) : taxRate
    const taxAmount = lineNet.times(lineTaxRate).div(100)
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
      discountAmount: money.toDecimal(discountAmount.toFixed()),
      taxRate: money.toDecimal(lineTaxRate.toFixed()),
      taxAmount: money.toDecimal(taxAmount.toFixed()),
      lineNet: money.toDecimal(lineNet.toFixed()),
      lineTotal: money.toDecimal(lineGross.toFixed()),
      receivedQuantity: money.toDecimal('0'),
      returnedQuantity: money.toDecimal('0'),
      _product: product,
      _unitShort: unitShort,
      _stockOnHand: null,
    })
  }
  return { mapped, gross, lineDiscountTotal, lineNetTotal }
}

function totalsFrom({ gross, lineDiscountTotal, taxRate, documentDiscount, paidAmount, discountMethod }) {
  const method = discountMethod || 'document'
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
  const tax = netSubtotal.times(rate).div(100)
  const total = netSubtotal.plus(tax)
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
    total: money.toDecimal(total.toFixed()),
    paidAmount: money.toDecimal(paid.toFixed()),
    balanceAmount: money.toDecimal(total.minus(paid).toFixed()),
    discountMethod: method,
    taxBasis: 'net_subtotal',
  }
}

function postingPreview(amounts) {
  const net = asDecimal(amounts.netSubtotal)
  const tax = asDecimal(amounts.tax)
  const total = asDecimal(amounts.total)
  return {
    balanced: net.plus(tax).eq(total),
    lines: [
      { account: 'Inventory', debit: net.toFixed(), credit: null },
      { account: 'Input Tax', debit: tax.toFixed(), credit: null },
      { account: 'Supplier AP', debit: null, credit: total.toFixed() },
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

function deriveReceivingState(items, forceQualityCheck = false) {
  if (forceQualityCheck) return 'quality_check'
  let ordered = new Decimal(0)
  let received = new Decimal(0)
  for (const item of items) {
    ordered = ordered.plus(asDecimal(item.quantity))
    received = received.plus(asDecimal(item.receivedQuantity))
  }
  if (received.lte(0)) return 'ordered'
  if (received.gte(ordered)) return 'received'
  return 'part_received'
}

function presentItem(item, product, stockOnHand = null, unitShort = '') {
  const taxRate = asDecimal(item.taxRate)
  return {
    _id: item._id,
    productId: product?._id || item.productId,
    sku: product?.sku || '',
    productName: product?.name || '',
    packingUnitId: item.packingUnitId || null,
    packingLabel: item.packingLabel || '',
    packingFactor: asDecimal(item.packingFactor || '1').toFixed(),
    quantity: asDecimal(item.quantity).toFixed(),
    stockQuantity: asDecimal(item.stockQuantity || item.quantity).toFixed(),
    stockOnHand: stockOnHand,
    unitShortCode: unitShort,
    unitPrice: asDecimal(item.unitPrice).toFixed(),
    discountAmount: asDecimal(item.discountAmount).toFixed(),
    taxRate: taxRate.toFixed(),
    taxLabel: `${taxRate.toFixed()}%`,
    taxAmount: asDecimal(item.taxAmount).toFixed(),
    lineNet: asDecimal(item.lineNet || item.lineTotal).toFixed(),
    lineTotal: asDecimal(item.lineTotal).toFixed(),
    receivedQuantity: asDecimal(item.receivedQuantity).toFixed(),
    returnedQuantity: asDecimal(item.returnedQuantity).toFixed(),
  }
}

function presentPurchase(doc, items = [], extras = {}) {
  const amounts = {
    subtotal: asDecimal(doc.subtotal).toFixed(),
    discount: asDecimal(doc.discount).toFixed(),
    netSubtotal: asDecimal(doc.netSubtotal || asDecimal(doc.subtotal).minus(asDecimal(doc.discount))).toFixed(),
    taxRate: asDecimal(doc.taxRate).toFixed(),
    tax: asDecimal(doc.tax).toFixed(),
    total: asDecimal(doc.total).toFixed(),
    paidAmount: asDecimal(doc.paidAmount).toFixed(),
    balanceAmount: asDecimal(doc.balanceAmount).toFixed(),
  }
  const supplier = doc.supplierId
  const branch = doc.branchId
  const warehouse = doc.warehouseId
  const currency = doc.currencyId
  const paymentTerms = supplier?.paymentTerms || extras.paymentTerms || ''

  return {
    _id: doc._id,
    purchaseNumber: doc.purchaseNumber,
    branchId: branch
      ? { _id: branch._id, code: branch.code, name: branch.name }
      : doc.branchId,
    warehouseId: warehouse
      ? { _id: warehouse._id, code: warehouse.code, name: warehouse.name }
      : doc.warehouseId,
    supplierId: supplier
      ? {
          _id: supplier._id,
          code: supplier.code,
          name: supplier.name,
          paymentTerms,
          paymentTermsLabel: PAYMENT_TERMS_LABELS[paymentTerms] || '',
        }
      : doc.supplierId,
    currencyId: currency
      ? { _id: currency._id, code: currency.code, name: currency.name, symbol: currency.symbol || '' }
      : doc.currencyId,
    exchangeRate: asDecimal(doc.exchangeRate || '1').toFixed(6),
    purchaseDate: doc.purchaseDate,
    dueDate: doc.dueDate,
    supplierInvoiceNo: doc.supplierInvoiceNo || '',
    receivedById: doc.receivedById || null,
    receivedByName: doc.receivedByName || '',
    status: doc.status,
    statusLabel: PURCHASE_STATUS_LABELS[doc.status] || '',
    receivingState: doc.receivingState,
    receivingStateLabel: RECEIVING_STATE_LABELS[doc.receivingState] || '',
    workflow: workflow(doc),
    discountMethod: doc.discountMethod || 'document',
    taxBasis: doc.taxBasis || 'net_subtotal',
    taxBasisLabel:
      doc.taxBasis === 'net_subtotal' || !doc.taxBasis
        ? `${asDecimal(doc.taxRate).toFixed()}% of net subtotal`
        : doc.taxBasis,
    ...amounts,
    totals: {
      subtotal: amounts.subtotal,
      discount: amounts.discount,
      netSubtotal: amounts.netSubtotal,
      tax: amounts.tax,
      taxRate: amounts.taxRate,
      grandTotal: amounts.total,
      paidAmount: amounts.paidAmount,
      appliedAdvance: amounts.paidAmount,
      outstanding: amounts.balanceAmount,
    },
    postingPreview: postingPreview(amounts),
    advancePaymentId: doc.advancePaymentId || null,
    advanceAllocation: extras.advanceAllocation || null,
    stockImpactSummary: extras.stockImpactSummary || '',
    stockUnchanged: doc.status === 'draft' || doc.status === 'approved',
    canPost: doc.status === 'approved',
    receivingNote: doc.receivingNote || '',
    notes: doc.notes || '',
    approvedAt: doc.approvedAt,
    postedAt: doc.postedAt,
    payableInvoiceId: doc.payableInvoiceId,
    lines: items,
    createdAt: doc.createdAt,
    updatedAt: doc.updatedAt,
  }
}

function presentListRow(doc) {
  const supplier = doc.supplierId
  const warehouse = doc.warehouseId
  return {
    _id: doc._id,
    purchaseNumber: doc.purchaseNumber,
    purchaseDate: doc.purchaseDate,
    supplierId: supplier
      ? { _id: supplier._id, code: supplier.code, name: supplier.name }
      : doc.supplierId,
    warehouseId: warehouse
      ? { _id: warehouse._id, code: warehouse.code, name: warehouse.name }
      : doc.warehouseId,
    destination: warehouse?.name || '',
    total: asDecimal(doc.total).toFixed(),
    status: doc.status,
    statusLabel: PURCHASE_STATUS_LABELS[doc.status] || '',
    receivingState: doc.receivingState,
    receivingStateLabel: RECEIVING_STATE_LABELS[doc.receivingState] || '',
    createdAt: doc.createdAt,
    updatedAt: doc.updatedAt,
  }
}

function pushReturnHistory(doc, user, action, note = '') {
  doc.history.push({
    at: new Date(),
    actorId: user?._id || null,
    actorName: user?.name || '',
    action,
    note,
  })
}

function returnWorkflow(doc) {
  return {
    draft: { done: true, current: doc.status === 'draft', at: doc.draftedAt || doc.createdAt },
    approved: {
      done: ['approved', 'posted'].includes(doc.status),
      current: doc.status === 'approved',
      at: doc.approvedAt || null,
    },
    posted: { done: doc.status === 'posted', current: doc.status === 'posted', at: doc.postedAt || null },
    cancelled: {
      done: doc.status === 'cancelled',
      current: doc.status === 'cancelled',
      at: doc.cancelledAt || null,
    },
  }
}

function returnPostingPreview(amounts) {
  const subtotal = asDecimal(amounts.subtotal)
  const tax = asDecimal(amounts.tax)
  const total = asDecimal(amounts.total)
  return {
    balanced: subtotal.plus(tax).eq(total),
    previewOnly: true,
    lines: [
      { account: 'Supplier AP', debit: total.toFixed(), credit: null },
      { account: 'Inventory', debit: null, credit: subtotal.toFixed() },
      { account: 'Input Tax', debit: null, credit: tax.toFixed() },
    ],
    totals: { debit: total.toFixed(), credit: total.toFixed() },
  }
}

function presentReturnList(doc) {
  return {
    _id: doc._id,
    returnNumber: doc.returnNumber,
    returnDate: doc.returnDate,
    status: doc.status,
    statusLabel: RETURN_STATUS_LABELS[doc.status] || '',
    workspaceLabel: RETURN_WORKSPACE_LABELS[doc.status] || '',
    total: asDecimal(doc.total).toFixed(),
    supplierId: doc.supplierId,
    purchaseId: doc.purchaseId,
    createdAt: doc.createdAt,
    updatedAt: doc.updatedAt,
  }
}

function presentReturn(doc, extras = {}) {
  const subtotal = asDecimal(doc.subtotal ?? doc.total).toFixed()
  const discount = asDecimal(doc.discount).toFixed()
  const tax = asDecimal(doc.tax).toFixed()
  const total = asDecimal(doc.total).toFixed()
  const taxRate = asDecimal(doc.taxRate).toFixed()
  const stockOut = asDecimal(doc.stockQuantityOut).toFixed()
  const amounts = { subtotal, discount, tax, total }

  return {
    _id: doc._id,
    returnNumber: doc.returnNumber,
    branchId: extras.branch || doc.branchId,
    warehouseId: extras.warehouse || doc.warehouseId,
    supplierId: extras.supplier || doc.supplierId,
    purchaseId: extras.purchase || doc.purchaseId,
    currencyId: extras.currency || doc.currencyId,
    returnDate: doc.returnDate,
    status: doc.status,
    statusLabel: RETURN_STATUS_LABELS[doc.status] || '',
    workspaceLabel: RETURN_WORKSPACE_LABELS[doc.status] || '',
    statusSummary:
      doc.status === 'approved'
        ? 'Approved supplier return'
        : doc.status === 'posted'
          ? 'Posted supplier return'
          : doc.status === 'draft'
            ? 'Draft supplier return'
            : RETURN_STATUS_LABELS[doc.status] || '',
    workflow: returnWorkflow(doc),
    reason: doc.reason || '',
    supplierAuthorization: doc.supplierAuthorization || '',
    supplierNote: doc.supplierNote || '',
    taxRate,
    subtotal,
    discount,
    tax,
    total,
    supplierCredit: total,
    stockQuantityOut: stockOut,
    totals: {
      subtotal,
      discount,
      taxReversal: tax,
      taxRate,
      supplierCredit: total,
      stockQuantityOut: stockOut,
    },
    postingPreview: returnPostingPreview(amounts),
    stockUnchanged: doc.status === 'draft' || doc.status === 'approved',
    canPost: doc.status === 'approved',
    canCancel: doc.status === 'draft' || doc.status === 'approved',
    stockImpactSummary: extras.stockImpactSummary || '',
    onHandSummary: extras.onHandSummary || '',
    lines: extras.lines || (doc.lines || []).map((line) => ({
      _id: line._id,
      purchaseItemId: line.purchaseItemId,
      productId: line.productId,
      inventoryItemId: line.inventoryItemId || null,
      batchNumber: line.batchNumber || '',
      quantity: asDecimal(line.quantity).toFixed(),
      unitPrice: asDecimal(line.unitPrice).toFixed(),
      discountAmount: asDecimal(line.discountAmount).toFixed(),
      taxRate: asDecimal(line.taxRate).toFixed(),
      taxLabel: `${asDecimal(line.taxRate).toFixed()}%`,
      taxAmount: asDecimal(line.taxAmount).toFixed(),
      lineNet: asDecimal(line.lineNet || line.lineTotal).toFixed(),
      lineTotal: asDecimal(line.lineTotal).toFixed(),
    })),
    history: [...(doc.history || [])]
      .sort((left, right) => new Date(right.at) - new Date(left.at))
      .map((row) => ({
        _id: row._id,
        at: row.at,
        actorName: row.actorName,
        action: row.action,
        note: row.note || '',
      })),
    notes: doc.notes || '',
    draftedAt: doc.draftedAt || doc.createdAt,
    approvedAt: doc.approvedAt,
    postedAt: doc.postedAt,
    cancelledAt: doc.cancelledAt,
    createdBy: extras.createdBy || doc.createdBy,
    approvedBy: extras.approvedBy || doc.approvedBy,
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
  return `Posting adds ${parts.join(', ')} to ${warehouseName || 'warehouse'} and creates the balanced purchase voucher.`
}

async function loadAdvanceAllocation(doc) {
  if (!doc.advancePaymentId && asDecimal(doc.paidAmount).lte(0)) return null
  let payment = null
  if (doc.advancePaymentId) {
    payment = await SupplierPayment.findById(doc.advancePaymentId)
      .select('paymentNumber unallocatedAmount amount status')
      .lean()
  }
  return {
    paymentId: payment?._id || doc.advancePaymentId || null,
    paymentNumber: payment?.paymentNumber || '',
    amount: asDecimal(doc.paidAmount).toFixed(),
    note: payment
      ? `Applies posted supplier advance ${payment.paymentNumber} of PKR ${asDecimal(doc.paidAmount).toFixed()} on posting.`
      : asDecimal(doc.paidAmount).gt(0)
        ? `Applies PKR ${asDecimal(doc.paidAmount).toFixed()} paid / advance on posting.`
        : '',
  }
}

async function loadPurchase(id, user) {
  const doc = await Purchase.findOne(scopeToBranches({ _id: id }, user))
    .populate([
      { path: 'supplierId', select: 'code name paymentTerms' },
      { path: 'warehouseId', select: 'code name branchId' },
      { path: 'branchId', select: 'code name' },
      { path: 'currencyId', select: 'code name symbol' },
      { path: 'receivedById', select: 'name email' },
    ])
    .lean()
  assertFound(doc, 'Purchase not found')
  const items = await PurchaseItem.find({ purchaseId: id }).lean()
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
      presentItem(
        item,
        product,
        onHand,
        product?.quantityUnitId?.shortCode || '',
      ),
    )
  }
  const advanceAllocation = await loadAdvanceAllocation(doc)
  return presentPurchase(doc, presentedLines, {
    paymentTerms: doc.supplierId?.paymentTerms,
    advanceAllocation,
    stockImpactSummary: stockImpactSummary(
      presentedLines,
      doc.warehouseId?.name,
    ),
  })
}

export async function list(query, user) {
  const page = pagination(query, PURCHASE_SORT)
  const filter = scopeToBranches(listQuery(query, { searchFields: ['purchaseNumber'] }), user)
  if (query.branchId) filter.branchId = query.branchId
  if (query.warehouseId) filter.warehouseId = query.warehouseId
  if (query.supplierId) filter.supplierId = query.supplierId
  if (query.receivingState) filter.receivingState = query.receivingState
  if (query.from || query.to) {
    filter.purchaseDate = {}
    if (query.from) filter.purchaseDate.$gte = new Date(query.from)
    if (query.to) filter.purchaseDate.$lte = new Date(query.to)
  }

  const [items, total] = await Promise.all([
    Purchase.find(filter)
      .populate([
        { path: 'supplierId', select: 'code name' },
        { path: 'warehouseId', select: 'code name' },
      ])
      .sort(page.sort)
      .skip(page.skip)
      .limit(page.limit)
      .lean(),
    Purchase.countDocuments(filter),
  ])

  return { items: items.map(presentListRow), meta: page.meta(total) }
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
  const asOf = query.asOf ? new Date(query.asOf) : monthEnd

  const purchaseBase = { ...branchFilter, status: { $in: ['approved', 'posted'] } }
  const [monthRows, prevRows, openOrders, awaitingReceipt, pipelineRows, returnMonth, recentReturns] =
    await Promise.all([
      Purchase.find({ ...purchaseBase, purchaseDate: { $gte: monthStart, $lte: monthEnd } })
        .select('total')
        .lean(),
      Purchase.find({ ...purchaseBase, purchaseDate: { $gte: prevStart, $lte: prevEnd } })
        .select('total')
        .lean(),
      Purchase.countDocuments({
        ...branchFilter,
        status: { $in: ['draft', 'approved', 'posted'] },
        receivingState: { $ne: 'received' },
      }),
      Purchase.countDocuments({
        ...branchFilter,
        status: { $in: ['approved', 'posted'] },
        receivingState: { $in: ['ordered', 'part_received', 'quality_check'] },
      }),
      Purchase.find({
        ...branchFilter,
        status: { $in: ['approved', 'posted'] },
        receivingState: { $in: ['ordered', 'part_received', 'quality_check'] },
      })
        .select('receivingState total')
        .lean(),
      PurchaseReturn.find({
        ...branchFilter,
        status: 'posted',
        returnDate: { $gte: monthStart, $lte: monthEnd },
      })
        .select('total')
        .lean(),
      PurchaseReturn.find(branchFilter)
        .sort({ returnDate: -1, createdAt: -1 })
        .limit(5)
        .lean(),
    ])

  const monthPurchases = monthRows.reduce((sum, row) => sum.plus(asDecimal(row.total)), new Decimal(0))
  const prevPurchases = prevRows.reduce((sum, row) => sum.plus(asDecimal(row.total)), new Decimal(0))
  let monthPurchasesChangePercent = '0'
  if (prevPurchases.gt(0)) {
    monthPurchasesChangePercent = monthPurchases.minus(prevPurchases).div(prevPurchases).times(100).toFixed(1)
  } else if (monthPurchases.gt(0)) {
    monthPurchasesChangePercent = '100.0'
  }

  const returnsTotal = returnMonth.reduce((sum, row) => sum.plus(asDecimal(row.total)), new Decimal(0))
  const returnsPercentOfTotal = monthPurchases.gt(0)
    ? returnsTotal.div(monthPurchases).times(100).toFixed(1)
    : '0.0'

  const pipeline = {
    ordered: '0',
    part_received: '0',
    quality_check: '0',
  }
  const pipelineTotals = {
    ordered: new Decimal(0),
    part_received: new Decimal(0),
    quality_check: new Decimal(0),
  }
  for (const row of pipelineRows) {
    if (pipelineTotals[row.receivingState]) {
      pipelineTotals[row.receivingState] = pipelineTotals[row.receivingState].plus(asDecimal(row.total))
    }
  }
  pipeline.ordered = pipelineTotals.ordered.toFixed()
  pipeline.part_received = pipelineTotals.part_received.toFixed()
  pipeline.quality_check = pipelineTotals.quality_check.toFixed()

  const invoiceFilter = { ...branchFilter, status: 'posted' }
  const invoices = await SupplierInvoice.find(invoiceFilter)
    .select('supplierId amount paidAmount dueDate')
    .lean()
  const bySupplier = new Map()
  let supplierPayable = new Decimal(0)
  let dueSoon = new Decimal(0)
  const soon = addDays(asOf, 7)
  for (const invoice of invoices) {
    const open = asDecimal(invoice.amount).minus(asDecimal(invoice.paidAmount))
    if (open.lte(0)) continue
    supplierPayable = supplierPayable.plus(open)
    if (new Date(invoice.dueDate) <= soon) dueSoon = dueSoon.plus(open)
    const key = String(invoice.supplierId)
    bySupplier.set(key, (bySupplier.get(key) || new Decimal(0)).plus(open))
  }

  const topIds = [...bySupplier.entries()]
    .sort((left, right) => right[1].minus(left[1]).toNumber())
    .slice(0, 4)
    .map(([id]) => id)
  const suppliers = await Supplier.find({ _id: { $in: topIds } }).select('code name').lean()
  const supplierMap = new Map(suppliers.map((row) => [String(row._id), row]))
  const supplierBalances = topIds.map((id) => ({
    supplierId: id,
    supplierCode: supplierMap.get(id)?.code || '',
    supplierName: supplierMap.get(id)?.name || '',
    balance: bySupplier.get(id).toFixed(),
  }))

  return {
    month,
    summary: {
      monthPurchases: monthPurchases.toFixed(),
      monthPurchasesChangePercent,
      supplierPayable: supplierPayable.toFixed(),
      dueSoon: dueSoon.toFixed(),
      openOrders,
      awaitingReceipt,
      returnsTotal: returnsTotal.toFixed(),
      returnsPercentOfTotal,
    },
    receivingPipeline: pipeline,
    supplierBalances,
    recentReturns: recentReturns.map(presentReturnList),
  }
}

export async function getById(id, user) {
  return loadPurchase(id, user)
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
    discountAmount: row.discountAmount,
    taxRate: row.taxRate,
    taxAmount: row.taxAmount,
    lineNet: row.lineNet,
    lineTotal: row.lineTotal,
    receivedQuantity: row.receivedQuantity,
    returnedQuantity: row.returnedQuantity,
  }
}

async function resolveReceivedBy(body, user) {
  if (body.receivedById) {
    const person = await User.findById(body.receivedById).select('name').lean()
    if (!person) {
      throw new ApiError(400, 'Unknown user', [
        { field: 'receivedById', message: 'Received-by user does not exist' },
      ])
    }
    return { receivedById: person._id, receivedByName: person.name }
  }
  if (body.receivedByName) {
    return { receivedById: null, receivedByName: String(body.receivedByName).trim() }
  }
  if (user?._id) {
    return { receivedById: user._id, receivedByName: user.name || '' }
  }
  return { receivedById: null, receivedByName: '' }
}

async function assertAdvance(advancePaymentId, supplierId, paidAmount) {
  if (!advancePaymentId) return null
  const payment = await SupplierPayment.findOne({
    _id: advancePaymentId,
    supplierId,
    status: 'posted',
  })
    .select('paymentNumber unallocatedAmount')
    .lean()
  if (!payment) {
    throw new ApiError(400, 'Unknown advance payment', [
      { field: 'advancePaymentId', message: 'Posted supplier advance not found' },
    ])
  }
  if (asDecimal(paidAmount || '0').gt(asDecimal(payment.unallocatedAmount))) {
    throw new ApiError(400, 'Advance exceeds unallocated', [
      { field: 'paidAmount', message: 'Applied advance cannot exceed unallocated payment amount' },
    ])
  }
  return payment
}

export async function create(body, user) {
  const branch = await assertBranch(body.branchId, user)
  const warehouse = await assertWarehouse(body.warehouseId, branch._id)
  const supplier = await assertSupplier(body.supplierId)
  const currencyId = body.currencyId || supplier.currencyId
  await assertCurrency(currencyId)
  const taxRate = body.taxRate || '0'
  const { mapped, gross, lineDiscountTotal } = await mapLines(body.lines, taxRate)
  const amounts = totalsFrom({
    gross,
    lineDiscountTotal,
    taxRate,
    documentDiscount: body.discount,
    paidAmount: body.paidAmount || '0',
    discountMethod: body.discountMethod || 'document',
  })
  await assertAdvance(body.advancePaymentId, supplier._id, amounts.paidAmount)
  const purchaseDate = body.purchaseDate ? new Date(body.purchaseDate) : new Date()
  const termsDays = TERMS_DAYS[supplier.paymentTerms] ?? 30
  const dueDate = body.dueDate ? new Date(body.dueDate) : addDays(purchaseDate, termsDays)
  const receivedBy = await resolveReceivedBy(body, user)

  try {
    return await withTransaction(async (session) => {
      const purchaseNumber = await documentNumber.next('PO', session)
      const [doc] = await Purchase.create(
        [
          {
            purchaseNumber,
            branchId: branch._id,
            warehouseId: warehouse._id,
            supplierId: supplier._id,
            currencyId,
            exchangeRate: money.toDecimal(body.exchangeRate || '1'),
            purchaseDate,
            dueDate,
            supplierInvoiceNo: body.supplierInvoiceNo || '',
            ...receivedBy,
            status: 'draft',
            receivingState: 'ordered',
            ...amounts,
            advancePaymentId: body.advancePaymentId || null,
            receivingNote: body.receivingNote || '',
            notes: body.notes || '',
            createdBy: user?._id || null,
          },
        ],
        { session },
      )
      await PurchaseItem.insertMany(
        mapped.map((row) => ({ purchaseId: doc._id, ...itemWriteFields(row) })),
        { session },
      )
      return doc._id
    }).then((id) => loadPurchase(id, user))
  } catch (error) {
    rethrowDuplicate(error, 'purchaseNumber', 'Purchase number already exists')
  }
}

export async function update(id, body, user) {
  const doc = assertFound(await Purchase.findOne(scopeToBranches({ _id: id }, user)), 'Purchase not found')
  if (doc.status !== 'draft') {
    throw new ApiError(409, 'Purchase is locked', [
      { field: 'status', message: 'Only a draft purchase can be edited' },
    ])
  }
  if (body.warehouseId) {
    await assertWarehouse(body.warehouseId, doc.branchId)
    doc.warehouseId = body.warehouseId
  }
  if (body.supplierId) {
    const supplier = await assertSupplier(body.supplierId)
    doc.supplierId = supplier._id
    if (!body.currencyId) doc.currencyId = supplier.currencyId
  }
  if (body.currencyId) {
    await assertCurrency(body.currencyId)
    doc.currencyId = body.currencyId
  }
  if (body.exchangeRate != null) doc.exchangeRate = money.toDecimal(body.exchangeRate)
  if (body.purchaseDate) doc.purchaseDate = new Date(body.purchaseDate)
  if (Object.prototype.hasOwnProperty.call(body, 'dueDate')) {
    doc.dueDate = body.dueDate ? new Date(body.dueDate) : null
  }
  if (body.supplierInvoiceNo != null) doc.supplierInvoiceNo = body.supplierInvoiceNo
  if (body.receivingNote != null) doc.receivingNote = body.receivingNote
  if (body.notes != null) doc.notes = body.notes
  if (body.receivedById != null || body.receivedByName != null) {
    Object.assign(doc, await resolveReceivedBy(body, user))
  }
  if (Object.prototype.hasOwnProperty.call(body, 'advancePaymentId')) {
    doc.advancePaymentId = body.advancePaymentId || null
  }
  if (body.discountMethod) doc.discountMethod = body.discountMethod

  const taxRate = body.taxRate ?? decimalText(doc.taxRate) ?? '0'
  if (body.lines) {
    const { mapped, gross, lineDiscountTotal } = await mapLines(body.lines, taxRate)
    const amounts = totalsFrom({
      gross,
      lineDiscountTotal,
      taxRate,
      documentDiscount: body.discount ?? decimalText(doc.discount),
      paidAmount: body.paidAmount ?? decimalText(doc.paidAmount),
      discountMethod: body.discountMethod || doc.discountMethod || 'document',
    })
    await assertAdvance(doc.advancePaymentId, doc.supplierId, amounts.paidAmount)
    Object.assign(doc, amounts)
    await PurchaseItem.deleteMany({ purchaseId: doc._id })
    await PurchaseItem.insertMany(mapped.map((row) => ({ purchaseId: doc._id, ...itemWriteFields(row) })))
  } else if (
    body.taxRate != null ||
    body.discount != null ||
    body.paidAmount != null ||
    body.discountMethod != null
  ) {
    const items = await PurchaseItem.find({ purchaseId: doc._id }).lean()
    const lineDiscountTotal = items.reduce(
      (sum, row) => sum.plus(asDecimal(row.discountAmount)),
      new Decimal(0),
    )
    const amounts = totalsFrom({
      gross: asDecimal(doc.subtotal),
      lineDiscountTotal,
      taxRate,
      documentDiscount: body.discount ?? decimalText(doc.discount),
      paidAmount: body.paidAmount ?? decimalText(doc.paidAmount),
      discountMethod: body.discountMethod || doc.discountMethod || 'document',
    })
    await assertAdvance(doc.advancePaymentId, doc.supplierId, amounts.paidAmount)
    Object.assign(doc, amounts)
  }

  await doc.save()
  return loadPurchase(doc._id, user)
}

export async function approve(id, user) {
  const doc = assertFound(await Purchase.findOne(scopeToBranches({ _id: id }, user)), 'Purchase not found')
  if (doc.status !== 'draft') {
    throw new ApiError(400, 'Purchase cannot be approved', [
      { field: 'status', message: 'Only a draft purchase can be approved' },
    ])
  }
  doc.status = 'approved'
  doc.approvedAt = new Date()
  await doc.save()
  return loadPurchase(doc._id, user)
}

export async function cancel(id, user) {
  const doc = assertFound(await Purchase.findOne(scopeToBranches({ _id: id }, user)), 'Purchase not found')
  if (!['draft', 'approved'].includes(doc.status)) {
    throw new ApiError(400, 'Purchase cannot be cancelled', [
      { field: 'status', message: 'Only draft or approved purchases can be cancelled' },
    ])
  }
  doc.status = 'cancelled'
  await doc.save()
  return loadPurchase(doc._id, user)
}

export async function receive(id, body, user) {
  return withTransaction(async (session) => {
    const doc = assertFound(
      await Purchase.findOne(scopeToBranches({ _id: id }, user)).session(session),
      'Purchase not found',
    )
    if (!['approved', 'posted'].includes(doc.status)) {
      throw new ApiError(400, 'Purchase cannot be received', [
        { field: 'status', message: 'Approve the purchase before receiving' },
      ])
    }

    const items = await PurchaseItem.find({ purchaseId: doc._id }).session(session)
    const itemMap = new Map(items.map((row) => [String(row._id), row]))

    for (let index = 0; index < body.lines.length; index += 1) {
      const row = body.lines[index]
      const item = itemMap.get(String(row.itemId))
      if (!item) {
        throw new ApiError(400, 'Unknown purchase line', [
          { field: `lines.${index}.itemId`, message: 'Line does not belong to this purchase' },
        ])
      }
      const delta = asDecimal(row.quantity)
      const nextReceived = asDecimal(item.receivedQuantity).plus(delta)
      if (nextReceived.gt(asDecimal(item.quantity))) {
        throw new ApiError(400, 'Receive exceeds ordered quantity', [
          { field: `lines.${index}.quantity`, message: 'Cannot receive more than ordered' },
        ])
      }
      const factor = asDecimal(item.packingFactor || '1')
      const stockIn = delta.times(factor)
      item.receivedQuantity = money.toDecimal(nextReceived.toFixed())
      await item.save({ session })
      await apply({
        branchId: doc.branchId,
        warehouseId: doc.warehouseId,
        productId: item.productId,
        quantityIn: stockIn.toFixed(),
        unitCost: decimalText(item.unitPrice),
        movementType: 'purchase',
        referenceType: 'purchase',
        referenceId: doc._id,
        referenceNumber: doc.purchaseNumber,
        movementDate: new Date(),
        createdBy: user?._id || null,
        session,
      })
    }

    const refreshed = await PurchaseItem.find({ purchaseId: doc._id }).session(session)
    doc.receivingState = deriveReceivingState(refreshed, Boolean(body.qualityCheck))
    await doc.save({ session })
    return doc._id
  }).then((purchaseId) => loadPurchase(purchaseId, user))
}

export async function post(id, user) {
  return withTransaction(async (session) => {
    const doc = assertFound(
      await Purchase.findOne(scopeToBranches({ _id: id }, user)).session(session),
      'Purchase not found',
    )
    if (doc.status !== 'approved') {
      throw new ApiError(400, 'Purchase cannot be posted', [
        { field: 'status', message: 'Only an approved purchase can be posted' },
      ])
    }

    const items = await PurchaseItem.find({ purchaseId: doc._id }).session(session)
    for (const item of items) {
      const remaining = asDecimal(item.quantity).minus(asDecimal(item.receivedQuantity))
      if (remaining.lte(0)) continue
      const factor = asDecimal(item.packingFactor || '1')
      const stockIn = remaining.times(factor)
      item.receivedQuantity = money.toDecimal(item.quantity.toString())
      await item.save({ session })
      await apply({
        branchId: doc.branchId,
        warehouseId: doc.warehouseId,
        productId: item.productId,
        quantityIn: stockIn.toFixed(),
        unitCost: decimalText(item.unitPrice),
        movementType: 'purchase',
        referenceType: 'purchase',
        referenceId: doc._id,
        referenceNumber: doc.purchaseNumber,
        movementDate: new Date(),
        createdBy: user?._id || null,
        session,
      })
    }
    const refreshed = await PurchaseItem.find({ purchaseId: doc._id }).session(session)
    doc.receivingState = deriveReceivingState(refreshed)

    const grandTotal = asDecimal(doc.total)
    let payableInvoiceId = null
    if (grandTotal.gt(0)) {
      const invoice = await createInvoiceInSession(
        {
          branchId: doc.branchId,
          supplierId: doc.supplierId,
          currencyId: doc.currencyId,
          purchaseNumber: doc.purchaseNumber,
          invoiceDate: doc.purchaseDate,
          dueDate: doc.dueDate || doc.purchaseDate,
          amount: grandTotal.toFixed(),
          notes: `Posted purchase ${doc.purchaseNumber}`,
        },
        user,
        session,
      )
      payableInvoiceId = invoice._id
    }

    const paid = asDecimal(doc.paidAmount)
    if (doc.advancePaymentId && paid.gt(0) && payableInvoiceId) {
      await applyAdvanceInSession(
        {
          paymentId: doc.advancePaymentId,
          supplierId: doc.supplierId,
          invoiceId: payableInvoiceId,
          purchaseNumber: doc.purchaseNumber,
          amount: paid.toFixed(),
        },
        session,
      )
    }

    doc.status = 'posted'
    doc.postedAt = new Date()
    doc.payableInvoiceId = payableInvoiceId
    await doc.save({ session })
    return doc._id
  }).then((purchaseId) => loadPurchase(purchaseId, user))
}

async function mapReturnLines(lines, purchase, headerTaxRate = '0') {
  const mapped = []
  let subtotal = new Decimal(0)
  let discountTotal = new Decimal(0)
  let stockOut = new Decimal(0)
  const taxRate = asDecimal(headerTaxRate)

  for (let index = 0; index < lines.length; index += 1) {
    const row = lines[index]
    const product = await Product.findById(row.productId)
      .select('_id sku name status quantityUnitId')
      .populate({ path: 'quantityUnitId', select: 'name shortCode' })
      .lean()
    if (!product || product.status !== 'active') {
      throw new ApiError(400, 'Inactive product', [
        { field: `lines.${index}.productId`, message: 'Product must be active' },
      ])
    }

    let unitPrice = row.unitPrice
    let purchaseItemId = row.purchaseItemId || null
    let batchNumber = String(row.batchNumber || '').trim().toUpperCase()
    let inventoryItemId = row.inventoryItemId || null

    if (purchaseItemId) {
      const item = await PurchaseItem.findOne({ _id: purchaseItemId, purchaseId: purchase?._id })
      if (!item) {
        throw new ApiError(400, 'Unknown purchase line', [
          { field: `lines.${index}.purchaseItemId`, message: 'Line does not belong to the purchase' },
        ])
      }
      unitPrice = unitPrice ?? decimalText(item.unitPrice)
      const remaining = asDecimal(item.receivedQuantity).minus(asDecimal(item.returnedQuantity))
      if (asDecimal(row.quantity).gt(remaining)) {
        throw new ApiError(400, 'Return exceeds received quantity', [
          { field: `lines.${index}.quantity`, message: 'Cannot return more than received remaining' },
        ])
      }
    }

    if (inventoryItemId) {
      const batch = await InventoryItem.findById(inventoryItemId)
        .select('batchNumber productId')
        .lean()
      if (!batch || String(batch.productId) !== String(row.productId)) {
        throw new ApiError(400, 'Unknown inventory item', [
          { field: `lines.${index}.inventoryItemId`, message: 'Batch does not match the product' },
        ])
      }
      batchNumber = batch.batchNumber || batchNumber
    }

    if (unitPrice == null) {
      throw new ApiError(400, 'Unit price required', [
        { field: `lines.${index}.unitPrice`, message: 'Unit price is required' },
      ])
    }

    const quantity = asDecimal(row.quantity)
    const price = asDecimal(unitPrice)
    const discountAmount = asDecimal(row.discountAmount || '0')
    const lineGross = quantity.times(price)
    if (discountAmount.gt(lineGross)) {
      throw new ApiError(400, 'Line discount too high', [
        { field: `lines.${index}.discountAmount`, message: 'Discount cannot exceed line gross' },
      ])
    }
    const lineNet = lineGross.minus(discountAmount)
    const lineTaxRate = row.taxRate != null ? asDecimal(row.taxRate) : taxRate
    const taxAmount = lineNet.times(lineTaxRate).div(100)

    subtotal = subtotal.plus(lineNet)
    discountTotal = discountTotal.plus(discountAmount)
    stockOut = stockOut.plus(quantity)

    mapped.push({
      purchaseItemId,
      productId: row.productId,
      inventoryItemId,
      batchNumber,
      quantity: money.toDecimal(quantity.toFixed()),
      unitPrice: money.toDecimal(price.toFixed()),
      discountAmount: money.toDecimal(discountAmount.toFixed()),
      taxRate: money.toDecimal(lineTaxRate.toFixed()),
      taxAmount: money.toDecimal(taxAmount.toFixed()),
      lineNet: money.toDecimal(lineNet.toFixed()),
      lineTotal: money.toDecimal(lineGross.toFixed()),
      _product: product,
    })
  }

  const tax = subtotal.times(taxRate).div(100)
  const total = subtotal.plus(tax)
  return {
    mapped,
    amounts: {
      subtotal: money.toDecimal(subtotal.toFixed()),
      discount: money.toDecimal(discountTotal.toFixed()),
      taxRate: money.toDecimal(taxRate.toFixed()),
      tax: money.toDecimal(tax.toFixed()),
      total: money.toDecimal(total.toFixed()),
      stockQuantityOut: money.toDecimal(stockOut.toFixed()),
    },
  }
}

async function loadReturn(id, user) {
  const doc = await PurchaseReturn.findOne(scopeToBranches({ _id: id }, user))
    .populate([
      { path: 'branchId', select: 'code name' },
      { path: 'warehouseId', select: 'code name' },
      { path: 'supplierId', select: 'code name' },
      { path: 'currencyId', select: 'code name symbol' },
      { path: 'purchaseId', select: 'purchaseNumber status statusLabel' },
      { path: 'createdBy', select: 'name email' },
      { path: 'approvedBy', select: 'name email' },
    ])
    .lean()
  assertFound(doc, 'Purchase return not found')

  // purchase statusLabel is virtual via present - load raw status
  if (doc.purchaseId && doc.purchaseId.status) {
    doc.purchaseId = {
      _id: doc.purchaseId._id,
      purchaseNumber: doc.purchaseId.purchaseNumber,
      status: doc.purchaseId.status,
      statusLabel: PURCHASE_STATUS_LABELS[doc.purchaseId.status] || '',
    }
  }

  const productIds = (doc.lines || []).map((row) => row.productId)
  const products = await Product.find({ _id: { $in: productIds } })
    .select('sku name quantityUnitId')
    .populate({ path: 'quantityUnitId', select: 'name shortCode' })
    .lean()
  const productMap = new Map(products.map((row) => [String(row._id), row]))

  const presentedLines = []
  const onHandParts = []
  const impactParts = []
  for (const line of doc.lines || []) {
    const product = productMap.get(String(line.productId))
    const onHand = await stockOnHand(doc.warehouseId?._id || doc.warehouseId, line.productId)
    const unit = product?.quantityUnitId?.shortCode || 'units'
    presentedLines.push({
      _id: line._id,
      purchaseItemId: line.purchaseItemId,
      productId: product?._id || line.productId,
      sku: product?.sku || '',
      productName: product?.name || '',
      inventoryItemId: line.inventoryItemId || null,
      batchNumber: line.batchNumber || '',
      quantity: asDecimal(line.quantity).toFixed(),
      unit: unit ? { shortCode: unit, name: product?.quantityUnitId?.name || '' } : null,
      unitPrice: asDecimal(line.unitPrice).toFixed(),
      discountAmount: asDecimal(line.discountAmount).toFixed(),
      taxRate: asDecimal(line.taxRate).toFixed(),
      taxLabel: `${asDecimal(line.taxRate).toFixed()}%`,
      taxAmount: asDecimal(line.taxAmount).toFixed(),
      lineNet: asDecimal(line.lineNet || line.lineTotal).toFixed(),
      lineTotal: asDecimal(line.lineTotal).toFixed(),
      stockOnHand: onHand,
    })
    onHandParts.push(`${onHand} ${product?.name ? product.name.split(' ').pop() : unit}`)
    impactParts.push(`${asDecimal(line.quantity).toFixed()} ${unit}`)
  }

  const warehouseName = doc.warehouseId?.name || 'warehouse'
  const credit = asDecimal(doc.total).toFixed()
  return presentReturn(doc, {
    branch: doc.branchId,
    warehouse: doc.warehouseId,
    supplier: doc.supplierId,
    currency: doc.currencyId,
    purchase: doc.purchaseId,
    createdBy: doc.createdBy,
    approvedBy: doc.approvedBy,
    lines: presentedLines,
    onHandSummary: onHandParts.length
      ? `Current on-hand remains ${onHandParts.join(' and ')}.`
      : '',
    stockImpactSummary:
      doc.status === 'posted'
        ? `Posted · removed ${impactParts.join(' and ')} from ${warehouseName} and reduced supplier payable by PKR ${credit}.`
        : `Stock-OUT occurs only at posting. Posting removes ${impactParts.join(' and ')} from ${warehouseName} and reduces supplier payable by PKR ${credit}.`,
  })
}

export async function listReturns(query, user) {
  const page = pagination(query, RETURN_SORT)
  const filter = scopeToBranches(listQuery(query, { searchFields: ['returnNumber', 'reason', 'supplierAuthorization'] }), user)
  if (query.branchId) filter.branchId = query.branchId
  if (query.supplierId) filter.supplierId = query.supplierId
  if (query.purchaseId) filter.purchaseId = query.purchaseId

  const [items, total] = await Promise.all([
    PurchaseReturn.find(filter).sort(page.sort).skip(page.skip).limit(page.limit).lean(),
    PurchaseReturn.countDocuments(filter),
  ])
  return { items: items.map(presentReturnList), meta: page.meta(total) }
}

export async function getReturn(id, user) {
  return loadReturn(id, user)
}

export async function createReturn(body, user) {
  const branch = await assertBranch(body.branchId, user)
  const warehouse = await assertWarehouse(body.warehouseId, branch._id)
  const supplier = await assertSupplier(body.supplierId)
  const currencyId = body.currencyId || supplier.currencyId
  await assertCurrency(currencyId)

  let purchase = null
  if (body.purchaseId) {
    purchase = assertFound(
      await Purchase.findOne(scopeToBranches({ _id: body.purchaseId, supplierId: supplier._id }, user)),
      'Purchase not found',
    )
    if (purchase.status !== 'posted') {
      throw new ApiError(400, 'Purchase not posted', [
        { field: 'purchaseId', message: 'Returns require a posted purchase' },
      ])
    }
  }

  const taxRate = body.taxRate || '0'
  const { mapped, amounts } = await mapReturnLines(body.lines, purchase, taxRate)
  const now = new Date()
  const returnNumber = await documentNumber.next('PR')
  const doc = new PurchaseReturn({
    returnNumber,
    branchId: branch._id,
    warehouseId: warehouse._id,
    supplierId: supplier._id,
    purchaseId: purchase?._id || null,
    currencyId,
    returnDate: body.returnDate ? new Date(body.returnDate) : now,
    status: 'draft',
    reason: body.reason || '',
    supplierAuthorization: body.supplierAuthorization || '',
    supplierNote: body.supplierNote || '',
    ...amounts,
    lines: mapped.map(({ _product, ...row }) => row),
    notes: body.notes || '',
    draftedAt: now,
    createdBy: user?._id || null,
  })
  pushReturnHistory(
    doc,
    user,
    purchase
      ? `Created Draft from ${purchase.purchaseNumber}`
      : `Created Draft ${returnNumber}`,
  )
  if (body.supplierAuthorization) {
    pushReturnHistory(doc, user, `Added ${String(body.supplierAuthorization).toUpperCase()} and verified available quantities`)
  }
  await doc.save()
  return loadReturn(doc._id, user)
}

export async function updateReturn(id, body, user) {
  const doc = assertFound(
    await PurchaseReturn.findOne(scopeToBranches({ _id: id }, user)),
    'Purchase return not found',
  )
  if (doc.status !== 'draft') {
    throw new ApiError(409, 'Return is locked', [
      { field: 'status', message: 'Only a draft return can be edited' },
    ])
  }

  let purchase = null
  if (doc.purchaseId) {
    purchase = await Purchase.findById(doc.purchaseId)
  }
  if (body.reason != null) doc.reason = body.reason
  if (body.supplierAuthorization != null) doc.supplierAuthorization = body.supplierAuthorization
  if (body.supplierNote != null) doc.supplierNote = body.supplierNote
  if (body.notes != null) doc.notes = body.notes
  if (body.returnDate) doc.returnDate = new Date(body.returnDate)

  if (body.lines) {
    const taxRate = body.taxRate ?? decimalText(doc.taxRate) ?? '0'
    const { mapped, amounts } = await mapReturnLines(body.lines, purchase, taxRate)
    Object.assign(doc, amounts)
    doc.lines = mapped.map(({ _product, ...row }) => row)
    pushReturnHistory(doc, user, `Updated return lines on ${doc.returnNumber}`)
  } else if (body.taxRate != null) {
    const { mapped, amounts } = await mapReturnLines(
      doc.lines.map((line) => ({
        purchaseItemId: line.purchaseItemId,
        productId: line.productId,
        inventoryItemId: line.inventoryItemId,
        batchNumber: line.batchNumber,
        quantity: decimalText(line.quantity),
        unitPrice: decimalText(line.unitPrice),
        discountAmount: decimalText(line.discountAmount),
      })),
      purchase,
      body.taxRate,
    )
    Object.assign(doc, amounts)
    doc.lines = mapped.map(({ _product, ...row }) => row)
  }

  if (body.supplierAuthorization) {
    pushReturnHistory(
      doc,
      user,
      `Added ${String(body.supplierAuthorization).toUpperCase()} and verified available quantities`,
    )
  }
  await doc.save()
  return loadReturn(doc._id, user)
}

export async function approveReturn(id, user) {
  const doc = assertFound(
    await PurchaseReturn.findOne(scopeToBranches({ _id: id }, user)),
    'Purchase return not found',
  )
  if (doc.status !== 'draft') {
    throw new ApiError(400, 'Return cannot be approved', [
      { field: 'status', message: 'Only a draft return can be approved' },
    ])
  }
  doc.status = 'approved'
  doc.approvedAt = new Date()
  doc.approvedBy = user?._id || null
  pushReturnHistory(doc, user, 'Approved supplier return for posting')
  await doc.save()
  return loadReturn(doc._id, user)
}

export async function cancelReturn(id, user) {
  const doc = assertFound(
    await PurchaseReturn.findOne(scopeToBranches({ _id: id }, user)),
    'Purchase return not found',
  )
  if (!['draft', 'approved'].includes(doc.status)) {
    throw new ApiError(400, 'Return cannot be cancelled', [
      { field: 'status', message: 'Only draft or approved returns can be cancelled' },
    ])
  }
  doc.status = 'cancelled'
  doc.cancelledAt = new Date()
  pushReturnHistory(doc, user, 'Cancelled purchase return')
  await doc.save()
  return loadReturn(doc._id, user)
}

/** @deprecated use approveReturn — kept for older clients that called /ship */
export async function shipReturn(id, user) {
  return approveReturn(id, user)
}

export async function postReturn(id, user) {
  return withTransaction(async (session) => {
    const doc = assertFound(
      await PurchaseReturn.findOne(scopeToBranches({ _id: id }, user)).session(session),
      'Purchase return not found',
    )
    if (doc.status !== 'approved') {
      throw new ApiError(400, 'Return cannot be posted', [
        { field: 'status', message: 'Only an approved return can be posted' },
      ])
    }

    for (const line of doc.lines) {
      if (line.purchaseItemId) {
        const item = await PurchaseItem.findById(line.purchaseItemId).session(session)
        if (item) {
          item.returnedQuantity = money.toDecimal(
            asDecimal(item.returnedQuantity).plus(asDecimal(line.quantity)).toFixed(),
          )
          await item.save({ session })
        }
      }
      await apply({
        branchId: doc.branchId,
        warehouseId: doc.warehouseId,
        productId: line.productId,
        inventoryItemId: line.inventoryItemId || null,
        quantityOut: decimalText(line.quantity),
        unitCost: decimalText(line.unitPrice),
        movementType: 'purchase_return',
        referenceType: 'purchase_return',
        referenceId: doc._id,
        referenceNumber: doc.returnNumber,
        movementDate: new Date(),
        createdBy: user?._id || null,
        session,
      })
    }

    await creditPayableInSession(
      {
        branchId: doc.branchId,
        supplierId: doc.supplierId,
        currencyId: doc.currencyId,
        sourceNumber: doc.returnNumber,
        amount: decimalText(doc.total),
        entryDate: new Date(),
        description: `Purchase return ${doc.returnNumber}`,
      },
      session,
    )

    doc.status = 'posted'
    doc.postedAt = new Date()
    pushReturnHistory(doc, user, 'Posted return · stock-out and supplier payable reduced')
    await doc.save({ session })
    return doc._id
  }).then((returnId) => loadReturn(returnId, user))
}

/** @deprecated use postReturn — kept for older clients that called /credit */
export async function creditReturn(id, user) {
  return postReturn(id, user)
}
