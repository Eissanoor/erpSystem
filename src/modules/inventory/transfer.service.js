import { Decimal } from 'decimal.js'
import { ApiError } from '../../common/utils/ApiError.js'
import { assertFound } from '../../common/utils/assert.js'
import { pagination } from '../../common/utils/pagination.js'
import { listQuery } from '../../common/utils/listQuery.js'
import { documentNumber } from '../../common/utils/documentNumber.js'
import { money } from '../../common/utils/money.js'
import { decimalText } from '../product/refs.js'
import { Product } from '../product/product.model.js'
import { Warehouse } from '../warehouse/warehouse.model.js'
import { InventoryItem } from './inventoryItem.model.js'
import { apply, withSession } from './inventory.service.js'
import { resolveWarehouses } from './scope.js'
import { TRANSFER_STATUS_LABELS } from './transfer.constants.js'
import { WarehouseTransfer } from './warehouseTransfer.model.js'

const SORT_FIELDS = ['createdAt', 'transferNumber', 'status', 'expectedDate']
const POPULATE = [
  { path: 'sourceBranchId', select: 'name code' },
  { path: 'sourceWarehouseId', select: 'name code branchId' },
  { path: 'destinationBranchId', select: 'name code' },
  { path: 'destinationWarehouseId', select: 'name code branchId' },
  { path: 'requesterId', select: 'name email' },
  { path: 'approverId', select: 'name email' },
  { path: 'receiverId', select: 'name email' },
  {
    path: 'lines.productId',
    select: 'sku name quantityUnitId costPrice trackBatch trackExpiry',
    populate: { path: 'quantityUnitId', select: 'name shortCode' },
  },
  { path: 'lines.inventoryItemId', select: 'batchNumber serialNumber' },
]

function asDecimal(value) {
  return new Decimal(decimalText(value) || '0')
}

function person(user) {
  if (!user) return null
  return { _id: user._id, name: user.name, email: user.email }
}

function place(branch, warehouse) {
  return {
    branchId: branch ? { _id: branch._id, name: branch.name, code: branch.code } : null,
    warehouseId: warehouse
      ? { _id: warehouse._id, name: warehouse.name, code: warehouse.code }
      : null,
    label: [branch?.name, warehouse?.name].filter(Boolean).join(' · '),
  }
}

async function assertWarehouseAccess(warehouseId, user, field) {
  const warehouse = await Warehouse.findById(warehouseId).select('_id branchId status name code').lean()
  if (!warehouse) {
    throw new ApiError(400, 'Unknown warehouse', [
      { field, message: 'Warehouse does not exist' },
    ])
  }
  if (warehouse.status !== 'active') {
    throw new ApiError(400, 'Inactive warehouse', [
      { field, message: 'Warehouse must be active' },
    ])
  }
  await resolveWarehouses({ warehouseId }, user)
  return warehouse
}

async function mapLines(lines) {
  const mapped = []
  for (let index = 0; index < lines.length; index += 1) {
    const row = lines[index]
    const product = await Product.findById(row.productId)
      .select('sku name costPrice trackBatch trackExpiry status')
      .lean()
    if (!product || product.status !== 'active') {
      throw new ApiError(400, 'Inactive product', [
        { field: `lines.${index}.productId`, message: 'Product must be active' },
      ])
    }
    let inventoryItemId = row.inventoryItemId || null
    let batchNumber = String(row.batchNumber || '').trim().toUpperCase()
    if (inventoryItemId) {
      const item = await InventoryItem.findById(inventoryItemId).select('batchNumber productId').lean()
      if (!item || String(item.productId) !== String(row.productId)) {
        throw new ApiError(400, 'Unknown inventory item', [
          { field: `lines.${index}.inventoryItemId`, message: 'Inventory item does not match the product' },
        ])
      }
      batchNumber = item.batchNumber || batchNumber
    } else if (product.trackBatch || product.trackExpiry) {
      throw new ApiError(400, 'Inventory item required', [
        {
          field: `lines.${index}.inventoryItemId`,
          message: 'Batch or expiry tracking requires an inventory item',
        },
      ])
    }
    mapped.push({
      productId: row.productId,
      inventoryItemId,
      batchNumber,
      quantityRequested: money.toDecimal(row.quantity),
      quantityShipped: null,
      quantityReceived: null,
      unitCost: money.toDecimal(row.unitCost ?? decimalText(product.costPrice) ?? '0'),
    })
  }
  return mapped
}

function lineTotals(lines) {
  let units = new Decimal(0)
  let shipped = new Decimal(0)
  let received = new Decimal(0)
  for (const line of lines || []) {
    units = units.plus(asDecimal(line.quantityRequested))
    if (line.quantityShipped != null) shipped = shipped.plus(asDecimal(line.quantityShipped))
    if (line.quantityReceived != null) received = received.plus(asDecimal(line.quantityReceived))
  }
  return { lineCount: lines?.length || 0, units, shipped, received }
}

function stockImpact(doc, totals) {
  const shipped = totals.shipped
  const received = totals.received
  if (doc.status === 'draft' || doc.status === 'cancelled') {
    return {
      sourceReduction: { quantity: '0', state: 'pending', stateLabel: 'Pending' },
      stockInTransit: { quantity: '0', state: 'inactive', stateLabel: 'Inactive' },
      destinationIncrease: { quantity: '0', state: 'on_receipt', stateLabel: 'On receipt' },
    }
  }
  if (doc.status === 'in_transit') {
    return {
      sourceReduction: { quantity: shipped.neg().toFixed(), state: 'posted', stateLabel: 'Posted' },
      stockInTransit: { quantity: shipped.toFixed(), state: 'active', stateLabel: 'Active' },
      destinationIncrease: { quantity: shipped.toFixed(), state: 'on_receipt', stateLabel: 'On receipt' },
    }
  }
  return {
    sourceReduction: { quantity: shipped.neg().toFixed(), state: 'posted', stateLabel: 'Posted' },
    stockInTransit: { quantity: '0', state: 'closed', stateLabel: 'Closed' },
    destinationIncrease: { quantity: received.toFixed(), state: 'posted', stateLabel: 'Posted' },
  }
}

function presentLine(line) {
  const product = line.productId
  const unit = product?.quantityUnitId
  const item = line.inventoryItemId
  const batchNumber = line.batchNumber || item?.batchNumber || ''
  return {
    _id: line._id,
    productId: product?._id || line.productId,
    sku: product?.sku || '',
    productName: product?.name || '',
    unit: unit ? { _id: unit._id, name: unit.name, shortCode: unit.shortCode } : null,
    inventoryItemId: item?._id || line.inventoryItemId || null,
    batchNumber,
    batchLabel: batchNumber || 'Not tracked',
    quantityRequested: decimalText(line.quantityRequested),
    quantityShipped: line.quantityShipped == null ? null : decimalText(line.quantityShipped),
    quantityReceived: line.quantityReceived == null ? null : decimalText(line.quantityReceived),
    unitCost: decimalText(line.unitCost),
  }
}

function present(doc) {
  const totals = lineTotals(doc.lines)
  return {
    _id: doc._id,
    transferNumber: doc.transferNumber,
    status: doc.status,
    statusLabel: TRANSFER_STATUS_LABELS[doc.status] || '',
    reason: doc.reason || '',
    vehicle: doc.vehicle || '',
    expectedDate: doc.expectedDate || null,
    notes: doc.notes || '',
    source: place(doc.sourceBranchId, doc.sourceWarehouseId),
    destination: place(doc.destinationBranchId, doc.destinationWarehouseId),
    accountability: {
      requester: person(doc.requesterId),
      approver: person(doc.approverId),
      receiver: person(doc.receiverId),
      receiverPending: doc.status !== 'received',
    },
    workflow: {
      draft: { at: doc.draftedAt || doc.createdAt, done: true },
      inTransit: {
        at: doc.dispatchedAt || null,
        done: doc.status === 'in_transit' || doc.status === 'received',
      },
      received: {
        at: doc.receivedAt || null,
        done: doc.status === 'received',
        awaiting: doc.status === 'in_transit',
      },
    },
    lines: (doc.lines || []).map(presentLine),
    linesMeta: {
      lineCount: totals.lineCount,
      unitCount: totals.units.toFixed(),
    },
    stockImpact: stockImpact(doc, totals),
    createdAt: doc.createdAt,
    updatedAt: doc.updatedAt,
  }
}

function presentListRow(doc) {
  const detail = present(doc)
  return {
    _id: detail._id,
    transferNumber: detail.transferNumber,
    status: detail.status,
    statusLabel: detail.statusLabel,
    source: detail.source,
    destination: detail.destination,
    reason: detail.reason,
    expectedDate: detail.expectedDate,
    linesMeta: detail.linesMeta,
    createdAt: detail.createdAt,
    updatedAt: detail.updatedAt,
  }
}

async function loadTransfer(id, user) {
  const { warehouseIds } = await resolveWarehouses({}, user)
  const doc = await WarehouseTransfer.findOne({
    _id: id,
    $or: [{ sourceWarehouseId: { $in: warehouseIds } }, { destinationWarehouseId: { $in: warehouseIds } }],
  })
    .populate(POPULATE)
    .lean()
  return assertFound(doc, 'Transfer not found')
}

export async function list(query, user) {
  const page = pagination(query, SORT_FIELDS)
  const { warehouseIds } = await resolveWarehouses(query, user)
  const filter = listQuery(query, { searchFields: ['transferNumber', 'reason', 'vehicle'] })
  if (query.warehouseId) {
    filter.$or = [
      { sourceWarehouseId: query.warehouseId },
      { destinationWarehouseId: query.warehouseId },
    ]
  } else {
    filter.$or = [
      { sourceWarehouseId: { $in: warehouseIds } },
      { destinationWarehouseId: { $in: warehouseIds } },
    ]
  }
  if (query.branchId) {
    filter.$and = [
      {
        $or: [{ sourceBranchId: query.branchId }, { destinationBranchId: query.branchId }],
      },
    ]
  }

  const [items, total] = await Promise.all([
    WarehouseTransfer.find(filter)
      .populate(POPULATE)
      .sort(page.sort)
      .skip(page.skip)
      .limit(page.limit)
      .lean(),
    WarehouseTransfer.countDocuments(filter),
  ])
  return { items: items.map(presentListRow), meta: page.meta(total) }
}

export async function getById(id, user) {
  return present(await loadTransfer(id, user))
}

export async function create(body, user) {
  const source = await assertWarehouseAccess(body.sourceWarehouseId, user, 'sourceWarehouseId')
  const destination = await assertWarehouseAccess(
    body.destinationWarehouseId,
    user,
    'destinationWarehouseId',
  )
  if (String(source._id) === String(destination._id)) {
    throw new ApiError(400, 'Invalid destination', [
      { field: 'destinationWarehouseId', message: 'Source and destination warehouses must differ' },
    ])
  }
  const lines = await mapLines(body.lines)
  const transferNumber = await documentNumber.next('TR')
  const doc = await WarehouseTransfer.create({
    transferNumber,
    sourceBranchId: source.branchId,
    sourceWarehouseId: source._id,
    destinationBranchId: destination.branchId,
    destinationWarehouseId: destination._id,
    reason: body.reason || '',
    vehicle: body.vehicle || '',
    expectedDate: body.expectedDate || null,
    notes: body.notes || '',
    status: 'draft',
    requesterId: user._id,
    draftedAt: new Date(),
    lines,
  })
  return getById(doc._id, user)
}

export async function update(id, body, user) {
  const current = assertFound(await WarehouseTransfer.findById(id), 'Transfer not found')
  await resolveWarehouses({ warehouseId: current.sourceWarehouseId }, user)
  if (current.status !== 'draft') {
    throw new ApiError(400, 'Transfer is locked', [
      { field: 'status', message: 'Only a draft transfer can be edited' },
    ])
  }
  if (body.reason != null) current.reason = body.reason
  if (body.vehicle != null) current.vehicle = body.vehicle
  if (Object.prototype.hasOwnProperty.call(body, 'expectedDate')) {
    current.expectedDate = body.expectedDate || null
  }
  if (body.notes != null) current.notes = body.notes
  if (body.lines) current.lines = await mapLines(body.lines)
  await current.save()
  return getById(current._id, user)
}

export async function dispatch(id, user) {
  return withSession(async (session) => {
    const doc = assertFound(
      await WarehouseTransfer.findById(id).session(session),
      'Transfer not found',
    )
    await resolveWarehouses({ warehouseId: doc.sourceWarehouseId }, user)
    if (doc.status !== 'draft') {
      throw new ApiError(400, 'Transfer cannot be dispatched', [
        { field: 'status', message: 'Only a draft transfer can be dispatched' },
      ])
    }
    for (const line of doc.lines) {
      const qty = decimalText(line.quantityRequested)
      line.quantityShipped = money.toDecimal(qty)
      await apply({
        branchId: doc.sourceBranchId,
        warehouseId: doc.sourceWarehouseId,
        productId: line.productId,
        inventoryItemId: line.inventoryItemId,
        quantityOut: qty,
        unitCost: decimalText(line.unitCost),
        movementType: 'transfer_out',
        referenceType: 'transfer',
        referenceId: doc._id,
        referenceNumber: doc.transferNumber,
        movementDate: new Date(),
        createdBy: user._id,
        session,
      })
    }
    doc.status = 'in_transit'
    doc.dispatchedAt = new Date()
    doc.approverId = user._id
    await doc.save({ session })
    return doc._id
  }).then((transferId) => getById(transferId, user))
}

export async function receive(id, user) {
  return withSession(async (session) => {
    const doc = assertFound(
      await WarehouseTransfer.findById(id).session(session),
      'Transfer not found',
    )
    await resolveWarehouses({ warehouseId: doc.destinationWarehouseId }, user)
    if (doc.status !== 'in_transit') {
      throw new ApiError(400, 'Transfer cannot be received', [
        { field: 'status', message: 'Only an in-transit transfer can be received' },
      ])
    }
    for (const line of doc.lines) {
      const qty = decimalText(line.quantityShipped ?? line.quantityRequested)
      line.quantityReceived = money.toDecimal(qty)
      await apply({
        branchId: doc.destinationBranchId,
        warehouseId: doc.destinationWarehouseId,
        productId: line.productId,
        inventoryItemId: line.inventoryItemId,
        quantityIn: qty,
        unitCost: decimalText(line.unitCost),
        movementType: 'transfer_in',
        referenceType: 'transfer',
        referenceId: doc._id,
        referenceNumber: doc.transferNumber,
        movementDate: new Date(),
        createdBy: user._id,
        session,
      })
    }
    doc.status = 'received'
    doc.receivedAt = new Date()
    doc.receiverId = user._id
    await doc.save({ session })
    return doc._id
  }).then((transferId) => getById(transferId, user))
}

export async function cancel(id, user) {
  const doc = assertFound(await WarehouseTransfer.findById(id), 'Transfer not found')
  await resolveWarehouses({ warehouseId: doc.sourceWarehouseId }, user)
  if (doc.status !== 'draft') {
    throw new ApiError(400, 'Transfer cannot be cancelled', [
      { field: 'status', message: 'Only a draft transfer can be cancelled' },
    ])
  }
  doc.status = 'cancelled'
  await doc.save()
  return getById(doc._id, user)
}
