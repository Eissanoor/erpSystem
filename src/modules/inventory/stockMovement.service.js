import { Decimal } from 'decimal.js'
import { assertFound } from '../../common/utils/assert.js'
import { pagination } from '../../common/utils/pagination.js'
import { decimalText } from '../product/refs.js'
import { Product } from '../product/product.model.js'
import { MOVEMENT_REGISTER_LABELS, MOVEMENT_TYPE_LABELS } from './inventory.constants.js'
import { resolveWarehouses } from './scope.js'
import { StockMovement } from './stockMovement.model.js'

const SORT_FIELDS = ['movementDate', 'createdAt', 'movementNumber']
const POPULATE = [
  {
    path: 'productId',
    select: 'sku name quantityUnitId',
    populate: { path: 'quantityUnitId', select: 'name shortCode' },
  },
  { path: 'warehouseId', select: 'name code branchId' },
  { path: 'branchId', select: 'name code' },
  { path: 'createdBy', select: 'name email' },
]

function asDecimal(value) {
  return new Decimal(decimalText(value) || '0')
}

function dayStart(value) {
  const date = new Date(value)
  date.setUTCHours(0, 0, 0, 0)
  return date
}

function dayEnd(value) {
  const date = dayStart(value)
  date.setUTCDate(date.getUTCDate() + 1)
  return date
}

function resolveDateRange(query) {
  if (query.date) {
    return { start: dayStart(query.date), end: dayEnd(query.date), labelDate: dayStart(query.date) }
  }
  if (query.from || query.to) {
    const start = query.from ? dayStart(query.from) : null
    const end = query.to ? dayEnd(query.to) : null
    return { start, end, labelDate: start }
  }
  const today = dayStart(new Date())
  return { start: today, end: dayEnd(today), labelDate: today }
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
      { movementNumber: { $regex: escaped, $options: 'i' } },
      { referenceNumber: { $regex: escaped, $options: 'i' } },
      { ledgerNumber: { $regex: escaped, $options: 'i' } },
      ...(products.length ? [{ productId: { $in: products.map((row) => row._id) } }] : []),
    ],
  }
}

function quantityText(row) {
  const qtyIn = asDecimal(row.quantityIn)
  const qtyOut = asDecimal(row.quantityOut)
  return {
    quantityIn: qtyIn.gt(0) ? qtyIn.toFixed() : null,
    quantityOut: qtyOut.gt(0) ? qtyOut.toFixed() : null,
    moved: qtyIn.gt(0) ? qtyIn : qtyOut,
  }
}

function presentRow(row) {
  const product = row.productId
  const warehouse = row.warehouseId
  const branch = row.branchId
  const amounts = quantityText(row)
  const unit = product?.quantityUnitId
  return {
    _id: row._id,
    movementNumber: row.movementNumber,
    movementDate: row.movementDate,
    productId: product?._id || row.productId,
    sku: product?.sku || '',
    productName: product?.name || '',
    unit: unit ? { _id: unit._id, name: unit.name, shortCode: unit.shortCode } : null,
    branchId: branch ? { _id: branch._id, name: branch.name, code: branch.code } : row.branchId,
    warehouseId: warehouse
      ? { _id: warehouse._id, name: warehouse.name, code: warehouse.code }
      : row.warehouseId,
    movementType: row.movementType,
    movementTypeLabel: MOVEMENT_REGISTER_LABELS[row.movementType] || row.movementType,
    quantityIn: amounts.quantityIn,
    quantityOut: amounts.quantityOut,
    unitCost: decimalText(row.unitCost),
    lineValue: amounts.moved.times(asDecimal(row.unitCost)).toFixed(),
    createdBy: row.createdBy
      ? { _id: row.createdBy._id, name: row.createdBy.name, email: row.createdBy.email }
      : null,
    referenceType: row.referenceType || '',
    referenceId: row.referenceId || null,
    referenceNumber: row.referenceNumber || '',
    ledgerNumber: row.ledgerNumber || '',
    note: row.note || '',
  }
}

function presentDetail(row) {
  const base = presentRow(row)
  const amounts = quantityText(row)
  const direction = amounts.quantityOut ? 'out' : 'in'
  return {
    ...base,
    movementTypeDetailLabel: MOVEMENT_TYPE_LABELS[row.movementType] || row.movementType,
    direction,
    sourceTrace: {
      referenceNumber: base.referenceNumber,
      createdByName: base.createdBy?.name || '',
      quantity: amounts.moved.toFixed(),
      direction,
      lineValue: base.lineValue,
      movementDate: base.movementDate,
      ledgerNumber: base.ledgerNumber,
    },
  }
}

async function figures(filter, warehouses, labelDate) {
  const rows = await StockMovement.find(filter).select('quantityIn quantityOut').lean()
  let quantityIn = new Decimal(0)
  let quantityOut = new Decimal(0)
  for (const row of rows) {
    quantityIn = quantityIn.plus(asDecimal(row.quantityIn))
    quantityOut = quantityOut.plus(asDecimal(row.quantityOut))
  }
  const warehouseName =
    warehouses.length === 1 ? warehouses[0].name : warehouses.length ? 'Selected warehouses' : ''
  return {
    movementsToday: rows.length,
    warehouseName,
    quantityIn: quantityIn.toFixed(),
    quantityOut: quantityOut.toFixed(),
    netMovement: quantityIn.minus(quantityOut).toFixed(),
    date: labelDate,
  }
}

function buildScopeFilter(warehouseIds, branchIds, range) {
  const filter = { warehouseId: { $in: warehouseIds } }
  if (branchIds.length) filter.branchId = { $in: branchIds }
  if (range.start || range.end) {
    filter.movementDate = {}
    if (range.start) filter.movementDate.$gte = range.start
    if (range.end) filter.movementDate.$lt = range.end
  }
  return filter
}

export async function list(query, user) {
  const page = pagination(query, SORT_FIELDS)
  const { warehouseIds, branchIds, warehouses } = await resolveWarehouses(query, user)
  const range = resolveDateRange(query)
  const scopeFilter = buildScopeFilter(warehouseIds, branchIds, range)

  const tableFilter = { ...scopeFilter }
  if (query.productId) tableFilter.productId = query.productId
  if (query.movementType) tableFilter.movementType = query.movementType
  const searchFilter = await matchSearch(query.search)
  if (searchFilter) Object.assign(tableFilter, searchFilter)

  const [items, total, summary] = await Promise.all([
    StockMovement.find(tableFilter)
      .populate(POPULATE)
      .sort(page.sort.movementDate ? page.sort : { movementDate: -1 })
      .skip(page.skip)
      .limit(page.limit)
      .lean(),
    StockMovement.countDocuments(tableFilter),
    figures(scopeFilter, warehouses, range.labelDate),
  ])

  return {
    items: items.map(presentRow),
    meta: { ...page.meta(total), summary },
  }
}

export async function getById(id, user) {
  const { warehouseIds } = await resolveWarehouses({}, user)
  const row = await StockMovement.findOne({
    _id: id,
    warehouseId: { $in: warehouseIds },
  })
    .populate(POPULATE)
    .lean()
  return presentDetail(assertFound(row, 'Stock movement not found'))
}
