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
import { InventoryItem } from './inventoryItem.model.js'
import { StockBalance } from './stockBalance.model.js'
import { DAMAGE_STATUS_LABELS, DAMAGE_TYPE_LABELS } from './damage.constants.js'
import { ProductDamage } from './productDamage.model.js'

const SORT_FIELDS = ['createdAt', 'damageNumber', 'status', 'damageDate']
const POPULATE = [
  { path: 'branchId', select: 'name code' },
  { path: 'warehouseId', select: 'name code branchId' },
  { path: 'createdBy', select: 'name email' },
  { path: 'requestedApproverId', select: 'name email' },
  { path: 'approverId', select: 'name email' },
  {
    path: 'lines.productId',
    select: 'sku name costPrice quantityUnitId trackBatch trackExpiry',
    populate: { path: 'quantityUnitId', select: 'name shortCode' },
  },
  { path: 'lines.inventoryItemId', select: 'batchNumber expiryDate serialNumber' },
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

async function currentStock(warehouseId, productId, inventoryItemId) {
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

    let inventoryItemId = row.inventoryItemId || null
    let batchNumber = String(row.batchNumber || '').trim().toUpperCase()
    let expiryDate = row.expiryDate || null
    if (inventoryItemId) {
      const item = await InventoryItem.findById(inventoryItemId)
        .select('batchNumber expiryDate productId')
        .lean()
      if (!item || String(item.productId) !== String(row.productId)) {
        throw new ApiError(400, 'Unknown inventory item', [
          { field: `lines.${index}.inventoryItemId`, message: 'Inventory item does not match the product' },
        ])
      }
      batchNumber = item.batchNumber || batchNumber
      expiryDate = item.expiryDate || expiryDate
    } else if (product.trackBatch || product.trackExpiry) {
      throw new ApiError(400, 'Inventory item required', [
        {
          field: `lines.${index}.inventoryItemId`,
          message: 'Batch or expiry tracking requires an inventory item',
        },
      ])
    }

    const onHand = await currentStock(warehouseId, row.productId, inventoryItemId)
    if (asDecimal(row.quantity).gt(asDecimal(onHand))) {
      throw new ApiError(400, 'Insufficient stock', [
        {
          field: `lines.${index}.quantity`,
          message: 'Damage quantity cannot exceed current stock',
        },
      ])
    }

    mapped.push({
      productId: row.productId,
      inventoryItemId,
      batchNumber,
      expiryDate,
      quantity: money.toDecimal(row.quantity),
      unitCost: money.toDecimal(row.unitCost ?? decimalText(product.costPrice) ?? '0'),
    })
  }
  return mapped
}

async function affectedStock(warehouseId, lines) {
  let affectedQuantity = new Decimal(0)
  let inventoryLoss = new Decimal(0)
  let current = new Decimal(0)
  const presented = []

  for (const line of lines || []) {
    const product = line.productId
    const item = line.inventoryItemId
    const qty = asDecimal(line.quantity)
    const cost = asDecimal(line.unitCost)
    const onHand = await currentStock(
      warehouseId,
      product?._id || line.productId,
      item?._id || line.inventoryItemId,
    )
    affectedQuantity = affectedQuantity.plus(qty)
    inventoryLoss = inventoryLoss.plus(qty.times(cost))
    current = current.plus(asDecimal(onHand))
    const unit = product?.quantityUnitId
    const batchNumber = line.batchNumber || item?.batchNumber || ''
    presented.push({
      _id: line._id,
      productId: product?._id || line.productId,
      sku: product?.sku || '',
      productName: product?.name || '',
      inventoryItemId: item?._id || line.inventoryItemId || null,
      batchNumber,
      expiryDate: line.expiryDate || item?.expiryDate || null,
      quantity: qty.toFixed(),
      unit: unit ? { _id: unit._id, name: unit.name, shortCode: unit.shortCode } : null,
      unitCost: cost.toFixed(),
      lineValue: qty.times(cost).toFixed(),
      currentStock: onHand,
    })
  }

  return {
    lines: presented,
    affectedQuantity: affectedQuantity.toFixed(),
    currentStock: current.toFixed(),
    inventoryLoss: inventoryLoss.toFixed(),
  }
}

function journalPreview(inventoryLoss, enabled) {
  if (!enabled) {
    return { enabled: false, balanced: false, lines: [] }
  }
  return {
    enabled: true,
    balanced: true,
    lines: [
      { account: 'Inventory Loss', debit: inventoryLoss, credit: null },
      { account: 'Inventory', debit: null, credit: inventoryLoss },
    ],
  }
}

function present(doc, stock) {
  const inventoryLoss = stock.inventoryLoss
  const first = stock.lines[0]
  const unitLabel = first?.unit?.shortCode || ''
  return {
    _id: doc._id,
    damageNumber: doc.damageNumber,
    status: doc.status,
    statusLabel: DAMAGE_STATUS_LABELS[doc.status] || '',
    damageType: doc.damageType,
    damageTypeLabel: DAMAGE_TYPE_LABELS[doc.damageType] || '',
    reason: doc.reason || '',
    notes: doc.notes || '',
    damageDate: doc.damageDate,
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
      draft: { done: true, current: doc.status === 'draft', at: doc.draftedAt || doc.createdAt },
      pending: {
        done: ['pending', 'approved', 'rejected'].includes(doc.status),
        current: doc.status === 'pending',
        at: doc.submittedAt || null,
      },
      approved: { done: doc.status === 'approved', at: doc.approvedAt || null },
      rejected: { done: doc.status === 'rejected', at: doc.rejectedAt || null },
      cancelled: { done: doc.status === 'cancelled', at: null },
    },
    lines: stock.lines,
    summary: {
      affectedQuantity: stock.affectedQuantity,
      currentStock: stock.currentStock,
      inventoryLoss: stock.inventoryLoss,
      unit: unitLabel,
    },
    impactPreview: {
      stockBeforeApproval: stock.currentStock,
      damageQuantity: stock.affectedQuantity,
      stockAfterApproval: asDecimal(stock.currentStock).minus(asDecimal(stock.affectedQuantity)).toFixed(),
      unitCost: first?.unitCost || '0',
      inventoryLoss,
      journal: journalPreview(inventoryLoss, doc.postAccounting !== false),
      requiredRole: 'Warehouse Manager',
      selfApprovalAllowed: false,
    },
    stockUnchanged: doc.status === 'draft' || doc.status === 'pending' || doc.status === 'rejected',
    movementNumbers: doc.movementNumbers || [],
    voucherNumber: doc.voucherNumber || '',
    accountingPosted: Boolean(doc.accountingPosted),
    postAccounting: doc.postAccounting !== false,
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

function presentListRow(doc, stock) {
  return {
    _id: doc._id,
    damageNumber: doc.damageNumber,
    status: doc.status,
    statusLabel: DAMAGE_STATUS_LABELS[doc.status] || '',
    damageType: doc.damageType,
    damageTypeLabel: DAMAGE_TYPE_LABELS[doc.damageType] || '',
    reason: doc.reason || '',
    branchId: doc.branchId
      ? { _id: doc.branchId._id, name: doc.branchId.name, code: doc.branchId.code }
      : doc.branchId,
    warehouseId: doc.warehouseId
      ? { _id: doc.warehouseId._id, name: doc.warehouseId.name, code: doc.warehouseId.code }
      : doc.warehouseId,
    createdBy: person(doc.createdBy),
    damageDate: doc.damageDate,
    summary: {
      affectedQuantity: stock.affectedQuantity,
      inventoryLoss: stock.inventoryLoss,
    },
    createdAt: doc.createdAt,
    updatedAt: doc.updatedAt,
  }
}

async function loadDamage(id, user) {
  const { warehouseIds } = await resolveWarehouses({}, user)
  const doc = await ProductDamage.findOne({
    _id: id,
    warehouseId: { $in: warehouseIds },
  })
    .populate(POPULATE)
    .lean()
  return assertFound(doc, 'Damage report not found')
}

export async function list(query, user) {
  const page = pagination(query, SORT_FIELDS)
  const { warehouseIds } = await resolveWarehouses(query, user)
  const filter = listQuery(query, { searchFields: ['damageNumber', 'reason'] })
  filter.warehouseId = query.warehouseId || { $in: warehouseIds }
  if (query.branchId) filter.branchId = query.branchId
  if (query.damageType) filter.damageType = query.damageType

  const [items, total] = await Promise.all([
    ProductDamage.find(filter)
      .populate(POPULATE)
      .sort(page.sort)
      .skip(page.skip)
      .limit(page.limit)
      .lean(),
    ProductDamage.countDocuments(filter),
  ])

  const presented = []
  for (const item of items) {
    const stock = await affectedStock(item.warehouseId?._id || item.warehouseId, item.lines)
    presented.push(presentListRow(item, stock))
  }
  return { items: presented, meta: page.meta(total) }
}

export async function getById(id, user) {
  const doc = await loadDamage(id, user)
  const stock = await affectedStock(doc.warehouseId?._id || doc.warehouseId, doc.lines)
  return present(doc, stock)
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
  const damageNumber = await documentNumber.next('DMG')
  const now = new Date()
  const doc = new ProductDamage({
    damageNumber,
    branchId: warehouse.branchId,
    warehouseId: warehouse._id,
    damageType: body.damageType,
    reason: body.reason || '',
    notes: body.notes || '',
    status: 'draft',
    damageDate: body.damageDate || now,
    createdBy: user._id,
    requestedApproverId: body.requestedApproverId || null,
    draftedAt: now,
    postAccounting: body.postAccounting !== false,
    lines,
  })
  pushHistory(doc, user, `Created draft damage report ${damageNumber}`)
  await doc.save()
  return getById(doc._id, user)
}

export async function update(id, body, user) {
  const doc = assertFound(await ProductDamage.findById(id), 'Damage report not found')
  await resolveWarehouses({ warehouseId: doc.warehouseId }, user)
  if (doc.status !== 'draft') {
    throw new ApiError(400, 'Damage report is locked', [
      { field: 'status', message: 'Only a draft damage report can be edited' },
    ])
  }
  if (body.damageType) doc.damageType = body.damageType
  if (body.reason != null) doc.reason = body.reason
  if (body.notes != null) doc.notes = body.notes
  if (Object.prototype.hasOwnProperty.call(body, 'requestedApproverId')) {
    doc.requestedApproverId = body.requestedApproverId || null
  }
  if (body.damageDate) doc.damageDate = body.damageDate
  if (body.postAccounting != null) doc.postAccounting = body.postAccounting
  if (body.lines) {
    doc.lines = await mapLines(doc.warehouseId, body.lines)
    pushHistory(doc, user, `Updated affected stock on ${doc.damageNumber}`)
  }
  await doc.save()
  return getById(doc._id, user)
}

export async function submit(id, user) {
  const doc = assertFound(await ProductDamage.findById(id), 'Damage report not found')
  await resolveWarehouses({ warehouseId: doc.warehouseId }, user)
  if (doc.status !== 'draft') {
    throw new ApiError(400, 'Damage report cannot be submitted', [
      { field: 'status', message: 'Only a draft damage report can be submitted' },
    ])
  }
  if (!doc.lines.length) {
    throw new ApiError(400, 'Damage report has no lines', [
      { field: 'lines', message: 'Add at least one affected product' },
    ])
  }
  doc.status = 'pending'
  doc.submittedAt = new Date()
  pushHistory(doc, user, 'Submitted for approval · no stock or ledger impact yet')
  await doc.save()
  return getById(doc._id, user)
}

export async function approve(id, user) {
  return withSession(async (session) => {
    const doc = assertFound(await ProductDamage.findById(id).session(session), 'Damage report not found')
    await resolveWarehouses({ warehouseId: doc.warehouseId }, user)
    if (doc.status !== 'pending') {
      throw new ApiError(400, 'Damage report cannot be approved', [
        { field: 'status', message: 'Only a pending damage report can be approved' },
      ])
    }
    const isSelf = doc.createdBy && String(doc.createdBy) === String(user._id)
    const canOverride = user?.permissionCodes?.includes('all_branches')
    if (isSelf && !canOverride) {
      throw new ApiError(403, 'Self-approval is not allowed', [
        { field: 'approver', message: 'Reporter self-approval is not allowed' },
      ])
    }

    const movementNumbers = []
    for (const line of doc.lines) {
      const result = await apply({
        branchId: doc.branchId,
        warehouseId: doc.warehouseId,
        productId: line.productId,
        inventoryItemId: line.inventoryItemId,
        quantityOut: decimalText(line.quantity),
        unitCost: decimalText(line.unitCost),
        movementType: 'damage',
        referenceType: 'damage',
        referenceId: doc._id,
        referenceNumber: doc.damageNumber,
        movementDate: new Date(),
        createdBy: user._id,
        session,
      })
      movementNumbers.push(result.movement.movementNumber)
    }

    doc.status = 'approved'
    doc.approvedAt = new Date()
    doc.approverId = user._id
    doc.movementNumbers = movementNumbers
    doc.accountingPosted = false
    doc.voucherNumber = ''
    pushHistory(
      doc,
      user,
      doc.postAccounting
        ? 'Approved damage · stock-out created · ledger voucher pending accounting service'
        : 'Approved damage · stock-out created',
    )
    await doc.save({ session })
    return doc._id
  }).then((damageId) => getById(damageId, user))
}

export async function reject(id, body, user) {
  const doc = assertFound(await ProductDamage.findById(id), 'Damage report not found')
  await resolveWarehouses({ warehouseId: doc.warehouseId }, user)
  if (doc.status !== 'pending') {
    throw new ApiError(400, 'Damage report cannot be rejected', [
      { field: 'status', message: 'Only a pending damage report can be rejected' },
    ])
  }
  doc.status = 'rejected'
  doc.rejectedAt = new Date()
  doc.approverId = user._id
  pushHistory(doc, user, 'Rejected damage report', body?.note || '')
  await doc.save()
  return getById(doc._id, user)
}

export async function cancel(id, user) {
  const doc = assertFound(await ProductDamage.findById(id), 'Damage report not found')
  await resolveWarehouses({ warehouseId: doc.warehouseId }, user)
  if (doc.status !== 'draft') {
    throw new ApiError(400, 'Damage report cannot be cancelled', [
      { field: 'status', message: 'Only a draft damage report can be cancelled' },
    ])
  }
  doc.status = 'cancelled'
  pushHistory(doc, user, 'Cancelled draft damage report')
  await doc.save()
  return getById(doc._id, user)
}
