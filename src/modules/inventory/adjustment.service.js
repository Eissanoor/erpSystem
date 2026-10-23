import { Decimal } from 'decimal.js'
import { ApiError } from '../../common/utils/ApiError.js'
import { assertFound } from '../../common/utils/assert.js'
import { pagination } from '../../common/utils/pagination.js'
import { listQuery } from '../../common/utils/listQuery.js'
import { documentNumber } from '../../common/utils/documentNumber.js'
import { money } from '../../common/utils/money.js'
import { decimalText } from '../product/refs.js'
import { Product } from '../product/product.model.js'
import { User } from '../user/user.model.js'
import { Warehouse } from '../warehouse/warehouse.model.js'
import { apply, withSession } from './inventory.service.js'
import { resolveWarehouses } from './scope.js'
import { StockBalance } from './stockBalance.model.js'
import { ADJUSTMENT_STATUS_LABELS } from './adjustment.constants.js'
import { StockAdjustment } from './stockAdjustment.model.js'

const SORT_FIELDS = ['createdAt', 'adjustmentNumber', 'status', 'adjustmentDate']
const POPULATE = [
  { path: 'branchId', select: 'name code' },
  { path: 'warehouseId', select: 'name code branchId' },
  { path: 'createdBy', select: 'name email' },
  { path: 'requestedApproverId', select: 'name email' },
  { path: 'approverId', select: 'name email' },
  {
    path: 'lines.productId',
    select: 'sku name costPrice quantityUnitId',
    populate: { path: 'quantityUnitId', select: 'name shortCode' },
  },
]

function asDecimal(value) {
  return new Decimal(decimalText(value) || '0')
}

function person(user) {
  if (!user) return null
  return { _id: user._id, name: user.name, email: user.email }
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

async function systemQuantity(warehouseId, productId, inventoryItemId) {
  const balance = await StockBalance.findOne({
    warehouseId,
    productId,
    inventoryItemId: inventoryItemId || null,
  })
    .select('quantity')
    .lean()
  return balance ? decimalText(balance.quantity) : '0'
}

async function mapLines(warehouseId, lines) {
  const mapped = []
  for (let index = 0; index < lines.length; index += 1) {
    const row = lines[index]
    const product = await Product.findById(row.productId)
      .select('sku name costPrice status trackBatch trackExpiry')
      .lean()
    if (!product || product.status !== 'active') {
      throw new ApiError(400, 'Inactive product', [
        { field: `lines.${index}.productId`, message: 'Product must be active' },
      ])
    }
    const inventoryItemId = row.inventoryItemId || null
    if ((product.trackBatch || product.trackExpiry) && !inventoryItemId) {
      throw new ApiError(400, 'Inventory item required', [
        {
          field: `lines.${index}.inventoryItemId`,
          message: 'Batch or expiry tracking requires an inventory item',
        },
      ])
    }
    const system = await systemQuantity(warehouseId, row.productId, inventoryItemId)
    const actual = row.actualQuantity
    const difference = asDecimal(actual).minus(asDecimal(system)).toFixed()
    mapped.push({
      productId: row.productId,
      inventoryItemId,
      systemQuantity: money.toDecimal(system),
      actualQuantity: money.toDecimal(actual),
      difference: money.toDecimal(difference),
      unitCost: money.toDecimal(row.unitCost ?? decimalText(product.costPrice) ?? '0'),
    })
  }
  return mapped
}

function impact(lines) {
  let productsCounted = lines?.length || 0
  let withVariance = 0
  let stockOut = new Decimal(0)
  let stockIn = new Decimal(0)
  let stockOutValue = new Decimal(0)
  let stockInValue = new Decimal(0)

  for (const line of lines || []) {
    const diff = asDecimal(line.difference)
    const cost = asDecimal(line.unitCost)
    if (!diff.isZero()) withVariance += 1
    if (diff.lt(0)) {
      const qty = diff.abs()
      stockOut = stockOut.plus(qty)
      stockOutValue = stockOutValue.plus(qty.times(cost))
    } else if (diff.gt(0)) {
      stockIn = stockIn.plus(diff)
      stockInValue = stockInValue.plus(diff.times(cost))
    }
  }

  return {
    productsCounted,
    productsWithVariance: withVariance,
    stockOutOnApproval: stockOut.toFixed(),
    stockInOnApproval: stockIn.toFixed(),
    stockOutValue: stockOutValue.neg().toFixed(),
    stockInValue: stockInValue.toFixed(),
    netInventoryImpact: stockInValue.minus(stockOutValue).toFixed(),
  }
}

function presentLine(line) {
  const product = line.productId
  const unit = product?.quantityUnitId
  const diff = asDecimal(line.difference)
  const valueImpact = diff.times(asDecimal(line.unitCost)).toFixed()
  return {
    _id: line._id,
    productId: product?._id || line.productId,
    sku: product?.sku || '',
    productName: product?.name || '',
    unit: unit ? { _id: unit._id, name: unit.name, shortCode: unit.shortCode } : null,
    inventoryItemId: line.inventoryItemId || null,
    systemQuantity: decimalText(line.systemQuantity),
    actualQuantity: decimalText(line.actualQuantity),
    difference: decimalText(line.difference),
    unitCost: decimalText(line.unitCost),
    valueImpact,
  }
}

function present(doc) {
  const summary = impact(doc.lines)
  return {
    _id: doc._id,
    adjustmentNumber: doc.adjustmentNumber,
    status: doc.status,
    statusLabel: ADJUSTMENT_STATUS_LABELS[doc.status] || '',
    reason: doc.reason || '',
    countReference: doc.countReference || '',
    countNote: doc.countNote || '',
    notes: doc.notes || '',
    adjustmentDate: doc.adjustmentDate,
    branchId: doc.branchId
      ? { _id: doc.branchId._id, name: doc.branchId.name, code: doc.branchId.code }
      : doc.branchId,
    warehouseId: doc.warehouseId
      ? { _id: doc.warehouseId._id, name: doc.warehouseId.name, code: doc.warehouseId.code }
      : doc.warehouseId,
    createdBy: person(doc.createdBy),
    requestedApprover: person(doc.requestedApproverId),
    approver: person(doc.approverId),
    draftedAt: doc.draftedAt || doc.createdAt,
    submittedAt: doc.submittedAt || null,
    approvedAt: doc.approvedAt || null,
    rejectedAt: doc.rejectedAt || null,
    workflow: {
      draft: { done: true, at: doc.draftedAt || doc.createdAt },
      pending: {
        done: ['pending', 'approved', 'rejected'].includes(doc.status),
        current: doc.status === 'pending',
        at: doc.submittedAt || null,
      },
      approved: { done: doc.status === 'approved', at: doc.approvedAt || null },
      rejected: { done: doc.status === 'rejected', at: doc.rejectedAt || null },
    },
    lines: (doc.lines || []).map(presentLine),
    summary,
    stockUnchanged: doc.status === 'draft' || doc.status === 'pending' || doc.status === 'rejected',
    movementNumbers: doc.movementNumbers || [],
    history: [...(doc.history || [])]
      .sort((left, right) => new Date(right.at) - new Date(left.at))
      .map((row) => ({
        _id: row._id,
        at: row.at,
        actorName: row.actorName,
        action: row.action,
        note: row.note || '',
      })),
    createdAt: doc.createdAt,
    updatedAt: doc.updatedAt,
  }
}

function presentListRow(doc) {
  const detail = present(doc)
  return {
    _id: detail._id,
    adjustmentNumber: detail.adjustmentNumber,
    status: detail.status,
    statusLabel: detail.statusLabel,
    reason: detail.reason,
    countReference: detail.countReference,
    branchId: detail.branchId,
    warehouseId: detail.warehouseId,
    createdBy: detail.createdBy,
    submittedAt: detail.submittedAt,
    summary: {
      productsCounted: detail.summary.productsCounted,
      productsWithVariance: detail.summary.productsWithVariance,
      netInventoryImpact: detail.summary.netInventoryImpact,
    },
    createdAt: detail.createdAt,
    updatedAt: detail.updatedAt,
  }
}

async function loadAdjustment(id, user) {
  const { warehouseIds } = await resolveWarehouses({}, user)
  const doc = await StockAdjustment.findOne({
    _id: id,
    warehouseId: { $in: warehouseIds },
  })
    .populate(POPULATE)
    .lean()
  return assertFound(doc, 'Adjustment not found')
}

export async function list(query, user) {
  const page = pagination(query, SORT_FIELDS)
  const { warehouseIds } = await resolveWarehouses(query, user)
  const filter = listQuery(query, { searchFields: ['adjustmentNumber', 'reason', 'countReference'] })
  filter.warehouseId = query.warehouseId || { $in: warehouseIds }
  if (query.branchId) filter.branchId = query.branchId

  const [items, total] = await Promise.all([
    StockAdjustment.find(filter)
      .populate(POPULATE)
      .sort(page.sort)
      .skip(page.skip)
      .limit(page.limit)
      .lean(),
    StockAdjustment.countDocuments(filter),
  ])
  return { items: items.map(presentListRow), meta: page.meta(total) }
}

export async function getById(id, user) {
  return present(await loadAdjustment(id, user))
}

export async function create(body, user) {
  const warehouse = await Warehouse.findById(body.warehouseId).select('_id branchId status').lean()
  if (!warehouse || warehouse.status !== 'active') {
    throw new ApiError(400, 'Inactive warehouse', [
      { field: 'warehouseId', message: 'Warehouse must be active' },
    ])
  }
  await resolveWarehouses({ warehouseId: body.warehouseId }, user)
  if (body.requestedApproverId) {
    const approver = await User.findById(body.requestedApproverId).select('_id').lean()
    if (!approver) {
      throw new ApiError(400, 'Unknown approver', [
        { field: 'requestedApproverId', message: 'Approver does not exist' },
      ])
    }
  }

  const lines = await mapLines(body.warehouseId, body.lines)
  const adjustmentNumber = await documentNumber.next('ADJ')
  const now = new Date()
  const doc = new StockAdjustment({
    adjustmentNumber,
    branchId: warehouse.branchId,
    warehouseId: warehouse._id,
    reason: body.reason || '',
    countReference: body.countReference || '',
    countNote: body.countNote || '',
    notes: body.notes || '',
    status: 'draft',
    adjustmentDate: body.adjustmentDate || now,
    createdBy: user._id,
    requestedApproverId: body.requestedApproverId || null,
    draftedAt: now,
    lines,
  })
  pushHistory(doc, user, 'Created draft adjustment')
  await doc.save()
  return getById(doc._id, user)
}

export async function update(id, body, user) {
  const doc = assertFound(await StockAdjustment.findById(id), 'Adjustment not found')
  await resolveWarehouses({ warehouseId: doc.warehouseId }, user)
  if (doc.status !== 'draft') {
    throw new ApiError(400, 'Adjustment is locked', [
      { field: 'status', message: 'Only a draft adjustment can be edited' },
    ])
  }
  if (body.reason != null) doc.reason = body.reason
  if (body.countReference != null) doc.countReference = body.countReference
  if (body.countNote != null) doc.countNote = body.countNote
  if (body.notes != null) doc.notes = body.notes
  if (Object.prototype.hasOwnProperty.call(body, 'requestedApproverId')) {
    doc.requestedApproverId = body.requestedApproverId || null
  }
  if (body.adjustmentDate) doc.adjustmentDate = body.adjustmentDate
  if (body.lines) {
    doc.lines = await mapLines(doc.warehouseId, body.lines)
    pushHistory(
      doc,
      user,
      body.countReference || doc.countReference
        ? `Entered actual quantities from ${body.countReference || doc.countReference}`
        : 'Entered actual quantities',
    )
  }
  await doc.save()
  return getById(doc._id, user)
}

export async function submit(id, user) {
  const doc = assertFound(await StockAdjustment.findById(id), 'Adjustment not found')
  await resolveWarehouses({ warehouseId: doc.warehouseId }, user)
  if (doc.status !== 'draft') {
    throw new ApiError(400, 'Adjustment cannot be submitted', [
      { field: 'status', message: 'Only a draft adjustment can be submitted' },
    ])
  }
  if (!doc.lines.length) {
    throw new ApiError(400, 'Adjustment has no lines', [
      { field: 'lines', message: 'Add at least one counted product' },
    ])
  }
  doc.status = 'pending'
  doc.submittedAt = new Date()
  pushHistory(doc, user, 'Submitted for approval · no stock movement created')
  await doc.save()
  return getById(doc._id, user)
}

export async function approve(id, user) {
  return withSession(async (session) => {
    const doc = assertFound(
      await StockAdjustment.findById(id).session(session),
      'Adjustment not found',
    )
    await resolveWarehouses({ warehouseId: doc.warehouseId }, user)
    if (doc.status !== 'pending') {
      throw new ApiError(400, 'Adjustment cannot be approved', [
        { field: 'status', message: 'Only a pending adjustment can be approved' },
      ])
    }

    const movementNumbers = []
    for (const line of doc.lines) {
      const diff = asDecimal(line.difference)
      if (diff.isZero()) continue
      const payload = {
        branchId: doc.branchId,
        warehouseId: doc.warehouseId,
        productId: line.productId,
        inventoryItemId: line.inventoryItemId,
        unitCost: decimalText(line.unitCost),
        movementType: 'adjustment',
        referenceType: 'adjustment',
        referenceId: doc._id,
        referenceNumber: doc.adjustmentNumber,
        movementDate: new Date(),
        createdBy: user._id,
        session,
      }
      if (diff.gt(0)) {
        const result = await apply({ ...payload, quantityIn: diff.toFixed() })
        movementNumbers.push(result.movement.movementNumber)
      } else {
        const result = await apply({ ...payload, quantityOut: diff.abs().toFixed() })
        movementNumbers.push(result.movement.movementNumber)
      }
    }

    doc.status = 'approved'
    doc.approvedAt = new Date()
    doc.approverId = user._id
    doc.movementNumbers = movementNumbers
    pushHistory(doc, user, 'Approved adjustment · stock movements created')
    await doc.save({ session })
    return doc._id
  }).then((adjustmentId) => getById(adjustmentId, user))
}

export async function reject(id, body, user) {
  const doc = assertFound(await StockAdjustment.findById(id), 'Adjustment not found')
  await resolveWarehouses({ warehouseId: doc.warehouseId }, user)
  if (doc.status !== 'pending') {
    throw new ApiError(400, 'Adjustment cannot be rejected', [
      { field: 'status', message: 'Only a pending adjustment can be rejected' },
    ])
  }
  doc.status = 'rejected'
  doc.rejectedAt = new Date()
  doc.approverId = user._id
  pushHistory(doc, user, 'Rejected adjustment', body?.note || '')
  await doc.save()
  return getById(doc._id, user)
}

export async function cancel(id, user) {
  const doc = assertFound(await StockAdjustment.findById(id), 'Adjustment not found')
  await resolveWarehouses({ warehouseId: doc.warehouseId }, user)
  if (doc.status !== 'draft') {
    throw new ApiError(400, 'Adjustment cannot be cancelled', [
      { field: 'status', message: 'Only a draft adjustment can be cancelled' },
    ])
  }
  doc.status = 'cancelled'
  pushHistory(doc, user, 'Cancelled draft adjustment')
  await doc.save()
  return getById(doc._id, user)
}
