import { Decimal } from 'decimal.js'
import { pagination } from '../../common/utils/pagination.js'
import { decimalText } from '../product/refs.js'
import { Product } from '../product/product.model.js'
import {
  EXPIRY_RISK_LABELS,
  ITEM_STATE_LABELS,
} from './inventory.constants.js'
import { InventoryItem } from './inventoryItem.model.js'
import { StockBalance } from './stockBalance.model.js'
import { resolveWarehouses } from './scope.js'

const SORT_FIELDS = ['createdAt', 'updatedAt', 'expiryDate', 'batchNumber']
const POPULATE = [
  {
    path: 'productId',
    select: 'sku name costPrice quantityUnitId',
    populate: { path: 'quantityUnitId', select: 'name shortCode' },
  },
  { path: 'warehouseId', select: 'name code' },
]

const MS_DAY = 24 * 60 * 60 * 1000

function asDecimal(value) {
  return new Decimal(decimalText(value) || '0')
}

function daysUntil(expiryDate, now = new Date()) {
  if (!expiryDate) return null
  const end = new Date(expiryDate)
  end.setUTCHours(0, 0, 0, 0)
  const start = new Date(now)
  start.setUTCHours(0, 0, 0, 0)
  return Math.ceil((end.getTime() - start.getTime()) / MS_DAY)
}

function classifyExpiryRisk(state, expiryDate, now = new Date()) {
  if (state === 'damaged') return 'quarantined'
  if (state === 'hold') return 'quality_check'
  const days = daysUntil(expiryDate, now)
  if (days == null) return 'ok'
  if (days <= 30) return 'expiring_soon'
  return 'ok'
}

function expiryRiskLabel(risk, days) {
  if (risk === 'expiring_soon') return EXPIRY_RISK_LABELS.expiring_soon
  if (risk === 'quality_check') return EXPIRY_RISK_LABELS.quality_check
  if (risk === 'quarantined') return EXPIRY_RISK_LABELS.quarantined
  if (days == null) return ''
  return `${days} days`
}

function within30Days(expiryDate, now = new Date()) {
  const days = daysUntil(expiryDate, now)
  return days != null && days >= 0 && days <= 30
}

async function quantityByItem(warehouseIds) {
  const map = new Map()
  if (!warehouseIds.length) return map
  const rows = await StockBalance.find({
    warehouseId: { $in: warehouseIds },
    inventoryItemId: { $ne: null },
  })
    .select('inventoryItemId quantity reservedQuantity')
    .lean()
  for (const row of rows) {
    const key = String(row.inventoryItemId)
    const current = map.get(key) || { quantity: new Decimal(0), reserved: new Decimal(0) }
    current.quantity = current.quantity.plus(asDecimal(row.quantity))
    current.reserved = current.reserved.plus(asDecimal(row.reservedQuantity))
    map.set(key, current)
  }
  return map
}

function presentRow(row, qtyMap, now = new Date()) {
  const product = row.productId
  const warehouse = row.warehouseId
  const stock = qtyMap.get(String(row._id))
  const quantity = stock?.quantity || new Decimal(0)
  const days = daysUntil(row.expiryDate, now)
  const expiryRisk = classifyExpiryRisk(row.state, row.expiryDate, now)
  const unit = product?.quantityUnitId
  return {
    _id: row._id,
    productId: product?._id || row.productId,
    sku: product?.sku || '',
    productName: product?.name || '',
    warehouseId: warehouse
      ? { _id: warehouse._id, name: warehouse.name, code: warehouse.code }
      : row.warehouseId,
    batchNumber: row.batchNumber || '',
    serialNumber: row.serialNumber || '',
    expiryDate: row.expiryDate || null,
    daysRemaining: days,
    quantity: quantity.toFixed(),
    unit: unit ? { _id: unit._id, name: unit.name, shortCode: unit.shortCode } : null,
    unitCost: decimalText(row.unitCost),
    lineValue: quantity.times(asDecimal(row.unitCost)).toFixed(),
    state: row.state,
    stateLabel: ITEM_STATE_LABELS[row.state] || '',
    expiryRisk,
    expiryRiskLabel: expiryRiskLabel(expiryRisk, days),
    status: row.status,
    updatedAt: row.updatedAt,
  }
}

async function matchSearch(search) {
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
  return {
    $or: [
      { batchNumber: { $regex: escaped, $options: 'i' } },
      { serialNumber: { $regex: escaped, $options: 'i' } },
      ...(products.length ? [{ productId: { $in: products.map((row) => row._id) } }] : []),
    ],
  }
}

function emptyFigures(warehouseName = '') {
  return {
    summary: {
      inventoryValue: '0',
      activeBatches: 0,
      warehouseName,
      expiryWithin30Days: 0,
      heldBatches: 0,
      damagedBatches: 0,
    },
    states: { all: 0, available: 0, hold: 0, damaged: 0 },
    expiryAttention: null,
  }
}

async function figures(warehouseIds, warehouses) {
  const warehouseName =
    warehouses.length === 1 ? warehouses[0].name : warehouses.length ? 'Selected warehouses' : ''
  if (!warehouseIds.length) return emptyFigures(warehouseName)

  const [items, qtyMap] = await Promise.all([
    InventoryItem.find({ warehouseId: { $in: warehouseIds }, status: 'active' })
      .select('productId warehouseId batchNumber serialNumber expiryDate unitCost state status')
      .populate([
        { path: 'productId', select: 'sku name' },
        { path: 'warehouseId', select: 'name code' },
      ])
      .lean(),
    quantityByItem(warehouseIds),
  ])

  const now = new Date()
  let inventoryValue = new Decimal(0)
  let expiryWithin30Days = 0
  let heldBatches = 0
  let damagedBatches = 0
  const states = { all: items.length, available: 0, hold: 0, damaged: 0 }
  let attention = null

  for (const item of items) {
    const quantity = qtyMap.get(String(item._id))?.quantity || new Decimal(0)
    inventoryValue = inventoryValue.plus(quantity.times(asDecimal(item.unitCost)))
    states[item.state] = (states[item.state] || 0) + 1
    if (item.state === 'hold') heldBatches += 1
    if (item.state === 'damaged') damagedBatches += 1
    if (within30Days(item.expiryDate, now)) expiryWithin30Days += 1

    const days = daysUntil(item.expiryDate, now)
    if (
      item.expiryDate &&
      days != null &&
      days >= 0 &&
      item.state !== 'damaged' &&
      (!attention || days < attention.daysRemaining)
    ) {
      attention = {
        _id: item._id,
        batchNumber: item.batchNumber || '',
        productName: item.productId?.name || '',
        sku: item.productId?.sku || '',
        expiryDate: item.expiryDate,
        daysRemaining: days,
        quantity: quantity.toFixed(),
        lineValue: quantity.times(asDecimal(item.unitCost)).toFixed(),
        warehouseId: item.warehouseId
          ? { _id: item.warehouseId._id, name: item.warehouseId.name, code: item.warehouseId.code }
          : null,
      }
    }
  }

  return {
    summary: {
      inventoryValue: inventoryValue.toFixed(),
      activeBatches: items.length,
      warehouseName,
      expiryWithin30Days,
      heldBatches,
      damagedBatches,
    },
    states,
    expiryAttention: attention,
  }
}

export async function list(query, user) {
  const page = pagination(query, SORT_FIELDS)
  const { warehouseIds, warehouses } = await resolveWarehouses(query, user)
  const filter = { warehouseId: { $in: warehouseIds }, status: 'active' }
  if (query.productId) filter.productId = query.productId
  if (query.state) filter.state = query.state
  if (query.batch) filter.batchNumber = String(query.batch).trim().toUpperCase()

  const searchFilter = await matchSearch(query.search)
  if (searchFilter) Object.assign(filter, searchFilter)

  const [rows, qtyMap, cards] = await Promise.all([
    InventoryItem.find(filter).populate(POPULATE).sort(page.sort).lean(),
    quantityByItem(warehouseIds),
    figures(warehouseIds, warehouses),
  ])

  const now = new Date()
  let items = rows.map((row) => presentRow(row, qtyMap, now))
  if (query.expiryRisk) {
    items = items.filter((row) => row.expiryRisk === query.expiryRisk)
  }

  const total = items.length
  return {
    items: items.slice(page.skip, page.skip + page.limit),
    meta: {
      ...page.meta(total),
      summary: cards.summary,
      states: cards.states,
      expiryAttention: cards.expiryAttention,
    },
  }
}
