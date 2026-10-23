import { Decimal } from 'decimal.js'
import mongoose from 'mongoose'
import { ApiError } from '../../common/utils/ApiError.js'
import { pagination } from '../../common/utils/pagination.js'
import { decimalText } from '../product/refs.js'
import { classifyReorder, stockPosition } from '../product/stockView.js'
import { Product } from '../product/product.model.js'
import { Warehouse } from '../warehouse/warehouse.model.js'
import { MOVEMENT_TYPE_LABELS, REORDER_STATE_LABELS } from './inventory.constants.js'
import { StockBalance } from './stockBalance.model.js'
import { StockMovement } from './stockMovement.model.js'
import { ProductDamage } from './productDamage.model.js'
import { StockAdjustment } from './stockAdjustment.model.js'

const SORT_FIELDS = ['createdAt', 'updatedAt']
const POPULATE = [
  { path: 'productId', select: 'sku name costPrice salePrice reorderLevel status' },
  { path: 'warehouseId', select: 'name code branchId' },
]

function hasAllBranches(user) {
  return Boolean(user?.permissionCodes?.includes('all_branches'))
}

function asDecimal(value) {
  return new Decimal(decimalText(value) || '0')
}

function dayBounds(date = new Date()) {
  const start = new Date(date)
  start.setUTCHours(0, 0, 0, 0)
  const end = new Date(start)
  end.setUTCDate(end.getUTCDate() + 1)
  return { start, end }
}

async function resolveWarehouses({ warehouseId, branchId }, user) {
  if (warehouseId) {
    const warehouse = await Warehouse.findById(warehouseId).select('_id branchId').lean()
    if (!warehouse) {
      throw new ApiError(400, 'Unknown warehouse', [
        { field: 'warehouseId', message: 'Warehouse does not exist' },
      ])
    }
    const branches = (user?.branchIds || []).map(String)
    const assigned = (user?.warehouseIds || []).map(String)
    const outsideBranch = !hasAllBranches(user) && !branches.includes(String(warehouse.branchId))
    const outsideWarehouse =
      !hasAllBranches(user) && assigned.length > 0 && !assigned.includes(String(warehouse._id))
    if (outsideBranch || outsideWarehouse) {
      throw new ApiError(403, 'Warehouse is outside your access', [
        { field: 'warehouseId', message: 'You cannot use this warehouse' },
      ])
    }
    if (branchId && String(warehouse.branchId) !== String(branchId)) {
      throw new ApiError(400, 'Warehouse branch mismatch', [
        { field: 'warehouseId', message: 'Warehouse does not belong to this branch' },
      ])
    }
    return { warehouseIds: [warehouse._id], branchIds: [warehouse.branchId] }
  }

  const filter = {}
  if (branchId) {
    if (!hasAllBranches(user) && !(user?.branchIds || []).map(String).includes(String(branchId))) {
      throw new ApiError(403, 'Branch is outside your access', [
        { field: 'branchId', message: 'You cannot use this branch' },
      ])
    }
    filter.branchId = branchId
  } else if (!hasAllBranches(user)) {
    filter.branchId = { $in: user?.branchIds || [] }
  }
  if (!hasAllBranches(user) && user?.warehouseIds?.length) {
    filter._id = { $in: user.warehouseIds }
  }

  const rows = await Warehouse.find(filter).select('_id branchId').lean()
  return {
    warehouseIds: rows.map((row) => row._id),
    branchIds: [...new Set(rows.map((row) => String(row.branchId)))].map(
      (id) => new mongoose.Types.ObjectId(id),
    ),
  }
}

function presentRow(row) {
  const product = row.productId
  const warehouse = row.warehouseId
  const position = stockPosition(row.quantity, row.reservedQuantity)
  const state = classifyReorder(position.available, product?.reorderLevel)
  return {
    _id: row._id,
    productId: product?._id || row.productId,
    sku: product?.sku || '',
    productName: product?.name || '',
    warehouseId: warehouse
      ? { _id: warehouse._id, name: warehouse.name, code: warehouse.code }
      : row.warehouseId,
    onHand: position.onHand.toFixed(),
    reserved: position.reserved.toFixed(),
    available: position.available.toFixed(),
    state,
    stateLabel: REORDER_STATE_LABELS[state],
    costPrice: decimalText(product?.costPrice),
    reorderLevel: decimalText(product?.reorderLevel),
    updatedAt: row.updatedAt,
  }
}

async function productIdsMatchingSearch(search) {
  const term = String(search || '').trim()
  if (!term) return null
  const escaped = term.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  const products = await Product.find({
    $or: [
      { name: { $regex: escaped, $options: 'i' } },
      { sku: { $regex: escaped, $options: 'i' } },
    ],
  })
    .select('_id')
    .lean()
  return products.map((row) => row._id)
}

async function figures(warehouseIds, branchIds) {
  if (!warehouseIds.length) {
    return {
      summary: {
        stockValue: '0',
        availableUnits: '0',
        locationCount: 0,
        lowStockSkus: 0,
        criticalSkus: 0,
        damagedUnits: '0',
        damagedValue: '0',
        reconciledAt: null,
      },
      exceptions: { lowStock: 0, damagedReview: '0', countVariance: 0 },
    }
  }

  const balances = await StockBalance.find({ warehouseId: { $in: warehouseIds } })
    .select('warehouseId productId quantity reservedQuantity updatedAt')
    .populate({ path: 'productId', select: 'costPrice reorderLevel status' })
    .lean()

  let stockValue = new Decimal(0)
  let availableUnits = new Decimal(0)
  const locations = new Set()
  const lowSkus = new Set()
  const criticalSkus = new Set()
  let reconciledAt = null

  for (const row of balances) {
    const product = row.productId
    if (!product) continue
    const position = stockPosition(row.quantity, row.reservedQuantity)
    stockValue = stockValue.plus(position.onHand.times(asDecimal(product.costPrice)))
    availableUnits = availableUnits.plus(position.available)
    if (position.onHand.gt(0) || position.reserved.gt(0)) {
      locations.add(String(row.warehouseId))
    }
    if (product.status === 'active') {
      const state = classifyReorder(position.available, product.reorderLevel)
      if (state === 'critical') {
        criticalSkus.add(String(product._id))
        lowSkus.add(String(product._id))
      } else if (state === 'low') {
        lowSkus.add(String(product._id))
      }
    }
    if (!reconciledAt || new Date(row.updatedAt) > new Date(reconciledAt)) {
      reconciledAt = row.updatedAt
    }
  }

  const [damages, adjustments] = await Promise.all([
    ProductDamage.find({ warehouseId: { $in: warehouseIds }, status: 'draft' })
      .select('quantity unitCost')
      .lean(),
    StockAdjustment.find({ warehouseId: { $in: warehouseIds }, status: 'draft' })
      .select('lines')
      .lean(),
  ])

  let damagedUnits = new Decimal(0)
  let damagedValue = new Decimal(0)
  for (const damage of damages) {
    const qty = asDecimal(damage.quantity)
    damagedUnits = damagedUnits.plus(qty)
    damagedValue = damagedValue.plus(qty.times(asDecimal(damage.unitCost)))
  }

  const countVariance = adjustments.reduce((sum, doc) => sum + (doc.lines?.length || 0), 0)

  return {
    summary: {
      stockValue: stockValue.toFixed(),
      availableUnits: availableUnits.toFixed(),
      locationCount: locations.size,
      lowStockSkus: lowSkus.size,
      criticalSkus: criticalSkus.size,
      damagedUnits: damagedUnits.toFixed(),
      damagedValue: damagedValue.toFixed(),
      reconciledAt,
    },
    exceptions: {
      lowStock: lowSkus.size,
      damagedReview: damagedUnits.toFixed(),
      countVariance,
    },
  }
}

function presentMovement(row) {
  const qtyIn = asDecimal(row.quantityIn)
  const qtyOut = asDecimal(row.quantityOut)
  const quantity = qtyIn.gt(0) ? qtyIn : qtyOut
  return {
    _id: row._id,
    movementNumber: row.movementNumber,
    movementType: row.movementType,
    movementTypeLabel: MOVEMENT_TYPE_LABELS[row.movementType] || row.movementType,
    referenceNumber: row.referenceNumber || '',
    quantity: quantity.toFixed(),
    note: row.note || '',
    movementDate: row.movementDate,
    warehouseId: row.warehouseId
      ? { _id: row.warehouseId._id, name: row.warehouseId.name, code: row.warehouseId.code }
      : null,
    productId: row.productId
      ? { _id: row.productId._id, name: row.productId.name, sku: row.productId.sku }
      : null,
  }
}

async function timeline(warehouseIds, branchIds) {
  if (!warehouseIds.length) return []
  const { start, end } = dayBounds()
  const filter = {
    warehouseId: { $in: warehouseIds },
    movementDate: { $gte: start, $lt: end },
  }
  if (branchIds.length) filter.branchId = { $in: branchIds }

  const rows = await StockMovement.find(filter)
    .select(
      'movementNumber movementType referenceNumber quantityIn quantityOut note movementDate warehouseId productId',
    )
    .populate([
      { path: 'warehouseId', select: 'name code' },
      { path: 'productId', select: 'name sku' },
    ])
    .sort({ movementDate: -1 })
    .limit(20)
    .lean()
  return rows.map(presentMovement)
}

export async function list(query, user) {
  const page = pagination(query, SORT_FIELDS)
  const { warehouseIds, branchIds } = await resolveWarehouses(query, user)
  const filter = { warehouseId: { $in: warehouseIds } }
  if (query.productId) filter.productId = query.productId

  if (query.search) {
    const ids = await productIdsMatchingSearch(query.search)
    filter.productId = ids?.length ? { $in: ids } : { $in: [] }
  }

  const [rows, cards, events] = await Promise.all([
    StockBalance.find(filter).populate(POPULATE).sort(page.sort).lean(),
    figures(warehouseIds, branchIds),
    timeline(warehouseIds, branchIds),
  ])

  let items = rows.map(presentRow)
  if (query.state) items = items.filter((row) => row.state === query.state)

  const total = items.length
  const paged = items.slice(page.skip, page.skip + page.limit)
  return {
    items: paged,
    meta: {
      ...page.meta(total),
      summary: cards.summary,
      exceptions: cards.exceptions,
      timeline: events,
    },
  }
}
