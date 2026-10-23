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
import { apply } from '../inventory/inventory.service.js'
import { StockBalance } from '../inventory/stockBalance.model.js'
import { InventoryItem } from '../inventory/inventoryItem.model.js'
import { creditReceivableInSession } from '../receivables/receivables.service.js'
import {
  RETURN_CONDITION_LABELS,
  SALE_RETURN_STATUS_LABELS,
  SALE_STATUS_LABELS,
} from './sale.constants.js'
import { Sale } from './sale.model.js'
import { SaleItem } from './saleItem.model.js'
import { SaleReturn } from './saleReturn.model.js'

const RETURN_SORT = ['returnDate', 'returnNumber', 'createdAt']

function asDecimal(value) {
  return new Decimal(decimalText(value) || '0')
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
    .select('_id code name paymentTerms currencyId status')
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

function pushHistory(doc, user, action, note = '') {
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
  const inventory = asDecimal(amounts.inventoryCost || '0')
  const salesDr = subtotal
  const taxDr = tax
  const arCr = total
  const invDr = inventory
  const cogsCr = inventory
  const debit = salesDr.plus(taxDr).plus(invDr)
  const credit = arCr.plus(cogsCr)
  return {
    balanced: debit.eq(credit),
    previewOnly: true,
    note:
      'Preview only · Balanced. Ledger and stock movements are not yet posted. Posting creates stock-IN and reverses receivables; corrections after posting use reversal or adjustment.',
    lines: [
      { account: 'Sales Returns', debit: salesDr.toFixed(), credit: null },
      { account: 'Output Tax', debit: taxDr.toFixed(), credit: null },
      { account: 'Customer AR', debit: null, credit: arCr.toFixed() },
      ...(inventory.gt(0)
        ? [
            { account: 'Inventory', debit: invDr.toFixed(), credit: null },
            { account: 'Cost of Sales', debit: null, credit: cogsCr.toFixed() },
          ]
        : []),
    ],
    totals: { debit: debit.toFixed(), credit: credit.toFixed() },
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

async function mapReturnLines(lines, sale, headerTaxRate = '0') {
  const mapped = []
  let subtotal = new Decimal(0)
  let discountTotal = new Decimal(0)
  let lineTaxTotal = new Decimal(0)
  let stockIn = new Decimal(0)
  let inventoryCost = new Decimal(0)
  const taxRate = asDecimal(headerTaxRate)

  for (let index = 0; index < lines.length; index += 1) {
    const row = lines[index]
    const product = await Product.findById(row.productId)
      .select('_id sku name status costPrice quantityUnitId')
      .populate({ path: 'quantityUnitId', select: 'name shortCode' })
      .lean()
    if (!product || product.status !== 'active') {
      throw new ApiError(400, 'Inactive product', [
        { field: `lines.${index}.productId`, message: 'Product must be active' },
      ])
    }

    let unitPrice = row.unitPrice
    let saleItemId = row.saleItemId || null
    let soldQuantity = new Decimal(0)
    let batchNumber = String(row.batchNumber || '').trim().toUpperCase()
    let inventoryItemId = row.inventoryItemId || null
    const unitCost = asDecimal(product.costPrice || '0')

    if (saleItemId) {
      const item = await SaleItem.findOne({ _id: saleItemId, saleId: sale?._id })
      if (!item) {
        throw new ApiError(400, 'Unknown sale line', [
          { field: `lines.${index}.saleItemId`, message: 'Line does not belong to the sale' },
        ])
      }
      unitPrice = unitPrice ?? decimalText(item.unitPrice)
      soldQuantity = asDecimal(item.quantity)
      const remaining = asDecimal(item.quantity).minus(asDecimal(item.returnedQuantity))
      if (asDecimal(row.quantity).gt(remaining)) {
        throw new ApiError(400, 'Return exceeds sold quantity', [
          { field: `lines.${index}.quantity`, message: 'Cannot return more than sold remaining' },
        ])
      }
    } else if (sale) {
      const item = await SaleItem.findOne({ saleId: sale._id, productId: row.productId })
      if (item) {
        saleItemId = item._id
        unitPrice = unitPrice ?? decimalText(item.unitPrice)
        soldQuantity = asDecimal(item.quantity)
        const remaining = asDecimal(item.quantity).minus(asDecimal(item.returnedQuantity))
        if (asDecimal(row.quantity).gt(remaining)) {
          throw new ApiError(400, 'Return exceeds sold quantity', [
            { field: `lines.${index}.quantity`, message: 'Cannot return more than sold remaining' },
          ])
        }
      }
    }

    if (inventoryItemId) {
      const batch = await InventoryItem.findById(inventoryItemId).select('batchNumber productId').lean()
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
    lineTaxTotal = lineTaxTotal.plus(taxAmount)
    stockIn = stockIn.plus(quantity)
    inventoryCost = inventoryCost.plus(quantity.times(unitCost))

    mapped.push({
      saleItemId,
      productId: row.productId,
      inventoryItemId,
      batchNumber,
      soldQuantity: money.toDecimal(soldQuantity.toFixed()),
      quantity: money.toDecimal(quantity.toFixed()),
      unitPrice: money.toDecimal(price.toFixed()),
      unitCost: money.toDecimal(unitCost.toFixed()),
      discountAmount: money.toDecimal(discountAmount.toFixed()),
      taxRate: money.toDecimal(lineTaxRate.toFixed()),
      taxAmount: money.toDecimal(taxAmount.toFixed()),
      lineNet: money.toDecimal(lineNet.toFixed()),
      lineTotal: money.toDecimal(lineGross.toFixed()),
      _product: product,
    })
  }

  const tax = lineTaxTotal.gt(0) ? lineTaxTotal : subtotal.times(taxRate).div(100)
  const total = subtotal.plus(tax)
  return {
    mapped,
    amounts: {
      subtotal: money.toDecimal(subtotal.toFixed()),
      discount: money.toDecimal(discountTotal.toFixed()),
      taxRate: money.toDecimal(taxRate.toFixed()),
      tax: money.toDecimal(tax.toFixed()),
      total: money.toDecimal(total.toFixed()),
      inventoryCost: money.toDecimal(inventoryCost.toFixed()),
      stockQuantityIn: money.toDecimal(stockIn.toFixed()),
    },
  }
}

function presentReturnList(doc) {
  return {
    _id: doc._id,
    returnNumber: doc.returnNumber,
    returnDate: doc.returnDate,
    status: doc.status,
    statusLabel: SALE_RETURN_STATUS_LABELS[doc.status] || '',
    total: asDecimal(doc.total).toFixed(),
    customerId: doc.customerId,
    saleId: doc.saleId,
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
  const stockIn = asDecimal(doc.stockQuantityIn).toFixed()
  const inventoryCost = asDecimal(doc.inventoryCost).toFixed()
  const amounts = { subtotal, discount, tax, total, inventoryCost }
  const condition = doc.condition || 'unopened_resalable'

  return {
    _id: doc._id,
    returnNumber: doc.returnNumber,
    branchId: extras.branch || doc.branchId,
    warehouseId: extras.warehouse || doc.warehouseId,
    customerId: extras.customer || doc.customerId,
    saleId: extras.sale || doc.saleId,
    currencyId: extras.currency || doc.currencyId,
    returnDate: doc.returnDate,
    status: doc.status,
    statusLabel: SALE_RETURN_STATUS_LABELS[doc.status] || '',
    statusSummary:
      doc.status === 'approved'
        ? 'Approved return'
        : doc.status === 'posted'
          ? 'Posted return'
          : doc.status === 'draft'
            ? 'Draft return'
            : SALE_RETURN_STATUS_LABELS[doc.status] || '',
    workflow: returnWorkflow(doc),
    reason: doc.reason || '',
    condition,
    conditionLabel: RETURN_CONDITION_LABELS[condition] || '',
    returnNote: doc.returnNote || '',
    taxRate,
    subtotal,
    discount,
    tax,
    total,
    customerCredit: total,
    stockQuantityIn: stockIn,
    inventoryCost,
    totals: {
      subtotal,
      discount,
      taxReversal: tax,
      taxRate,
      creditTotal: total,
      customerCredit: total,
      stockQuantityIn: stockIn,
      inventoryCost,
    },
    postingPreview: returnPostingPreview(amounts),
    stockUnchanged: doc.status === 'draft' || doc.status === 'approved',
    canPost: doc.status === 'approved',
    canCancel: doc.status === 'draft' || doc.status === 'approved',
    stockImpactSummary: extras.stockImpactSummary || '',
    formNote:
      'Posting creates stock-IN and reverses accounting. Approval alone does not change stock.',
    lines: extras.lines || [],
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

async function loadReturn(id, user) {
  const doc = await SaleReturn.findOne(scopeToBranches({ _id: id }, user))
    .populate([
      { path: 'branchId', select: 'code name' },
      { path: 'warehouseId', select: 'code name' },
      { path: 'customerId', select: 'code name' },
      { path: 'currencyId', select: 'code name symbol' },
      { path: 'saleId', select: 'saleNumber status saleDate postedAt' },
      { path: 'createdBy', select: 'name email' },
      { path: 'approvedBy', select: 'name email' },
    ])
    .lean()
  assertFound(doc, 'Sales return not found')

  if (doc.saleId && doc.saleId.status) {
    doc.saleId = {
      _id: doc.saleId._id,
      saleNumber: doc.saleId.saleNumber,
      status: doc.saleId.status,
      statusLabel: SALE_STATUS_LABELS[doc.saleId.status] || '',
      saleDate: doc.saleId.saleDate,
      postedAt: doc.saleId.postedAt,
    }
  }

  const productIds = (doc.lines || []).map((row) => row.productId)
  const products = await Product.find({ _id: { $in: productIds } })
    .select('sku name quantityUnitId')
    .populate({ path: 'quantityUnitId', select: 'name shortCode' })
    .lean()
  const productMap = new Map(products.map((row) => [String(row._id), row]))

  const presentedLines = []
  const impactParts = []
  for (const line of doc.lines || []) {
    const product = productMap.get(String(line.productId))
    const onHand = await stockOnHand(doc.warehouseId?._id || doc.warehouseId, line.productId)
    const unit = product?.quantityUnitId?.shortCode || 'units'
    presentedLines.push({
      _id: line._id,
      saleItemId: line.saleItemId,
      productId: product?._id || line.productId,
      sku: product?.sku || '',
      productName: product?.name || '',
      inventoryItemId: line.inventoryItemId || null,
      batchNumber: line.batchNumber || '',
      soldQuantity: asDecimal(line.soldQuantity).toFixed(),
      quantity: asDecimal(line.quantity).toFixed(),
      unit,
      unitShortCode: unit,
      unitPrice: asDecimal(line.unitPrice).toFixed(),
      unitCost: asDecimal(line.unitCost).toFixed(),
      discountAmount: asDecimal(line.discountAmount).toFixed(),
      taxRate: asDecimal(line.taxRate).toFixed(),
      taxLabel: `${asDecimal(line.taxRate).toFixed()}%`,
      taxAmount: asDecimal(line.taxAmount).toFixed(),
      lineNet: asDecimal(line.lineNet || line.lineTotal).toFixed(),
      lineTotal: asDecimal(line.lineTotal).toFixed(),
      stockOnHand: onHand,
    })
    impactParts.push(`${asDecimal(line.quantity).toFixed()} ${unit}`)
  }

  const warehouseName = doc.warehouseId?.name || 'warehouse'
  const credit = asDecimal(doc.total).toFixed()
  return presentReturn(doc, {
    branch: doc.branchId,
    warehouse: doc.warehouseId,
    customer: doc.customerId,
    currency: doc.currencyId,
    sale: doc.saleId,
    createdBy: doc.createdBy,
    approvedBy: doc.approvedBy,
    lines: presentedLines,
    stockImpactSummary:
      doc.status === 'posted'
        ? `Posted · received ${impactParts.join(' and ')} into ${warehouseName} and credited the customer PKR ${credit}.`
        : `On posting, receive ${impactParts.join(' and ')} into ${warehouseName} and credit the customer PKR ${credit}.`,
  })
}

export async function list(query, user) {
  const page = pagination(query, RETURN_SORT)
  const filter = scopeToBranches(
    listQuery(query, { searchFields: ['returnNumber', 'reason', 'returnNote'] }),
    user,
  )
  if (query.branchId) filter.branchId = query.branchId
  if (query.customerId) filter.customerId = query.customerId
  if (query.saleId) filter.saleId = query.saleId
  if (query.warehouseId) filter.warehouseId = query.warehouseId
  if (query.from || query.to) {
    filter.returnDate = {}
    if (query.from) filter.returnDate.$gte = new Date(query.from)
    if (query.to) filter.returnDate.$lte = new Date(query.to)
  }

  const [items, total] = await Promise.all([
    SaleReturn.find(filter).sort(page.sort).skip(page.skip).limit(page.limit).lean(),
    SaleReturn.countDocuments(filter),
  ])
  return { items: items.map(presentReturnList), meta: page.meta(total) }
}

export async function getById(id, user) {
  return loadReturn(id, user)
}

export async function create(body, user) {
  const branch = await assertBranch(body.branchId, user)
  const warehouse = await assertWarehouse(body.warehouseId, branch._id)
  const customer = await assertCustomer(body.customerId)
  const currencyId = body.currencyId || customer.currencyId
  await assertCurrency(currencyId)

  let sale = null
  if (body.saleId) {
    sale = assertFound(
      await Sale.findOne(scopeToBranches({ _id: body.saleId, customerId: customer._id }, user)),
      'Sale not found',
    )
    if (sale.status !== 'posted') {
      throw new ApiError(400, 'Sale not posted', [
        { field: 'saleId', message: 'Returns require a posted sale' },
      ])
    }
  }

  const taxRate = body.taxRate || '0'
  const { mapped, amounts } = await mapReturnLines(body.lines, sale, taxRate)
  const now = new Date()

  try {
    const returnNumber = await documentNumber.next('SR')
    const doc = new SaleReturn({
      returnNumber,
      branchId: branch._id,
      warehouseId: warehouse._id,
      customerId: customer._id,
      saleId: sale?._id || null,
      currencyId,
      returnDate: body.returnDate ? new Date(body.returnDate) : now,
      status: 'draft',
      reason: body.reason || '',
      condition: body.condition || 'unopened_resalable',
      returnNote: body.returnNote || '',
      ...amounts,
      lines: mapped.map(({ _product, ...row }) => row),
      notes: body.notes || '',
      draftedAt: now,
      createdBy: user?._id || null,
    })
    pushHistory(
      doc,
      user,
      sale ? `Created Draft from ${sale.saleNumber}` : `Created Draft ${returnNumber}`,
    )
    if (body.condition) {
      pushHistory(doc, user, 'Confirmed resalable condition and quantities')
    }
    await doc.save()
    return loadReturn(doc._id, user)
  } catch (error) {
    rethrowDuplicate(error, 'returnNumber', 'Return number already exists')
  }
}

export async function update(id, body, user) {
  const doc = assertFound(
    await SaleReturn.findOne(scopeToBranches({ _id: id }, user)),
    'Sales return not found',
  )
  if (doc.status !== 'draft') {
    throw new ApiError(409, 'Return is locked', [
      { field: 'status', message: 'Only a draft return can be edited' },
    ])
  }

  let sale = null
  if (doc.saleId) sale = await Sale.findById(doc.saleId)
  if (body.warehouseId) {
    await assertWarehouse(body.warehouseId, doc.branchId)
    doc.warehouseId = body.warehouseId
  }
  if (body.reason != null) doc.reason = body.reason
  if (body.condition != null) doc.condition = body.condition
  if (body.returnNote != null) doc.returnNote = body.returnNote
  if (body.notes != null) doc.notes = body.notes
  if (body.returnDate) doc.returnDate = new Date(body.returnDate)

  if (body.lines) {
    const taxRate = body.taxRate ?? decimalText(doc.taxRate) ?? '0'
    const { mapped, amounts } = await mapReturnLines(body.lines, sale, taxRate)
    Object.assign(doc, amounts)
    doc.lines = mapped.map(({ _product, ...row }) => row)
    pushHistory(doc, user, `Updated return lines on ${doc.returnNumber}`)
  } else if (body.taxRate != null) {
    const { mapped, amounts } = await mapReturnLines(
      doc.lines.map((line) => ({
        saleItemId: line.saleItemId,
        productId: line.productId,
        inventoryItemId: line.inventoryItemId,
        batchNumber: line.batchNumber,
        quantity: decimalText(line.quantity),
        unitPrice: decimalText(line.unitPrice),
        discountAmount: decimalText(line.discountAmount),
        taxRate: body.taxRate,
      })),
      sale,
      body.taxRate,
    )
    Object.assign(doc, amounts)
    doc.lines = mapped.map(({ _product, ...row }) => row)
  }

  await doc.save()
  return loadReturn(doc._id, user)
}

export async function approve(id, user) {
  const doc = assertFound(
    await SaleReturn.findOne(scopeToBranches({ _id: id }, user)),
    'Sales return not found',
  )
  if (doc.status !== 'draft') {
    throw new ApiError(400, 'Return cannot be approved', [
      { field: 'status', message: 'Only a draft return can be approved' },
    ])
  }
  doc.status = 'approved'
  doc.approvedAt = new Date()
  doc.approvedBy = user?._id || null
  pushHistory(doc, user, 'Approved return · Ready to post')
  await doc.save()
  return loadReturn(doc._id, user)
}

export async function cancel(id, user) {
  const doc = assertFound(
    await SaleReturn.findOne(scopeToBranches({ _id: id }, user)),
    'Sales return not found',
  )
  if (!['draft', 'approved'].includes(doc.status)) {
    throw new ApiError(400, 'Return cannot be cancelled', [
      { field: 'status', message: 'Only draft or approved returns can be cancelled' },
    ])
  }
  doc.status = 'cancelled'
  doc.cancelledAt = new Date()
  pushHistory(doc, user, 'Cancelled sales return')
  await doc.save()
  return loadReturn(doc._id, user)
}

export async function post(id, user) {
  return withTransaction(async (session) => {
    const doc = assertFound(
      await SaleReturn.findOne(scopeToBranches({ _id: id }, user)).session(session),
      'Sales return not found',
    )
    if (doc.status !== 'approved') {
      throw new ApiError(400, 'Return cannot be posted', [
        { field: 'status', message: 'Only an approved return can be posted' },
      ])
    }

    for (const line of doc.lines) {
      if (line.saleItemId) {
        const item = await SaleItem.findById(line.saleItemId).session(session)
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
        quantityIn: decimalText(line.quantity),
        unitCost: decimalText(line.unitCost) || decimalText(line.unitPrice),
        movementType: 'sales_return',
        referenceType: 'sales_return',
        referenceId: doc._id,
        referenceNumber: doc.returnNumber,
        movementDate: doc.returnDate || new Date(),
        createdBy: user?._id || null,
        session,
      })
    }

    let invoiceId = null
    if (doc.saleId) {
      const sale = await Sale.findById(doc.saleId).session(session).lean()
      invoiceId = sale?.receivableInvoiceId || null
    }

    await creditReceivableInSession(
      {
        branchId: doc.branchId,
        customerId: doc.customerId,
        currencyId: doc.currencyId,
        sourceNumber: doc.returnNumber,
        amount: decimalText(doc.total),
        entryDate: doc.returnDate || new Date(),
        description: `Sales return ${doc.returnNumber}`,
        invoiceId,
      },
      session,
    )

    doc.status = 'posted'
    doc.postedAt = new Date()
    pushHistory(doc, user, 'Posted return · stock-in and customer credit applied')
    await doc.save({ session })
    return doc._id
  }).then((returnId) => loadReturn(returnId, user))
}
