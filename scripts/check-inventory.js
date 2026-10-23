import mongoose from 'mongoose'
import { env } from '../src/config/env.js'
import { connectDb } from '../src/config/db.js'
import { createApp } from '../src/app.js'
import { seedAuth } from '../src/seed/seedAuth.js'
import { Product } from '../src/modules/product/product.model.js'
import { ProductCategory } from '../src/modules/productCategory/productCategory.model.js'
import { QuantityUnit } from '../src/modules/quantityUnit/quantityUnit.model.js'
import { Branch } from '../src/modules/branch/branch.model.js'
import { Warehouse } from '../src/modules/warehouse/warehouse.model.js'
import { StockBalance } from '../src/modules/inventory/stockBalance.model.js'
import { StockMovement } from '../src/modules/inventory/stockMovement.model.js'
import { ProductDamage } from '../src/modules/inventory/productDamage.model.js'
import { StockAdjustment } from '../src/modules/inventory/stockAdjustment.model.js'
import { InventoryItem } from '../src/modules/inventory/inventoryItem.model.js'

function assert(condition, message) {
  if (!condition) throw new Error(message)
}

async function listen(app) {
  return new Promise((resolve) => {
    const server = app.listen(0, '127.0.0.1', () => resolve(server))
  })
}

function client(base) {
  return async function request(method, path, { token, body } = {}) {
    const headers = {}
    if (body !== undefined) headers['content-type'] = 'application/json'
    if (token) headers.authorization = `Bearer ${token}`
    const response = await fetch(`${base}${path}`, {
      method,
      headers,
      body: body === undefined ? undefined : JSON.stringify(body),
    })
    const json = await response.json()
    return { status: response.status, json }
  }
}

function assertStatus(response, status, label) {
  if (response.status !== status) {
    throw new Error(`${label}: expected ${status}, got ${response.status} ${JSON.stringify(response.json)}`)
  }
}

let server
let coffee
let milk
let mainWh
let airportWh
const stamp = Date.now().toString(36)
try {
  await connectDb()
  await seedAuth()
  const app = createApp()
  server = await listen(app)
  const request = client(`http://127.0.0.1:${server.address().port}`)

  const login = await request('POST', '/api/v1/auth/login', {
    body: { email: env.seedAdminEmail, password: env.seedAdminPassword },
  })
  assertStatus(login, 200, 'admin login')
  assert(login.json.data.user.permissionCodes.includes('stock.read'), 'admin can read stock')
  const token = login.json.data.accessToken
  const adminId = login.json.data.user._id || login.json.data.user.id

  const branch = await request('POST', '/api/v1/branches', {
    token,
    body: {
      name: 'Inventory Branch',
      code: `inv-b-${stamp}`,
      branchType: 'operating',
      address: 'City Center',
    },
  })
  assertStatus(branch, 201, 'inventory branch')
  const branchId = branch.json.data._id

  mainWh = await request('POST', '/api/v1/warehouses', {
    token,
    body: {
      branchId,
      name: 'Main Warehouse',
      code: `inv-mw-${stamp}`,
      address: 'City Center',
    },
  })
  assertStatus(mainWh, 201, 'main warehouse')
  const eastWh = await request('POST', '/api/v1/warehouses', {
    token,
    body: {
      branchId,
      name: 'East Depot',
      code: `inv-ew-${stamp}`,
      address: 'East Road',
    },
  })
  assertStatus(eastWh, 201, 'east warehouse')

  let category = await ProductCategory.findOne({ code: 'CAT-A' }).lean()
  if (!category) {
    const created = await request('POST', '/api/v1/product-categories', {
      token,
      body: { name: 'Inventory Category', code: `cat-inv-${stamp}` },
    })
    assertStatus(created, 201, 'inventory category')
    category = created.json.data
  }

  let unit = await QuantityUnit.findOne({ shortCode: 'KG' }).lean()
  if (!unit) {
    const created = await request('POST', '/api/v1/quantity-units', {
      token,
      body: { name: 'Kilogram', shortCode: 'kg', decimalAllowed: true },
    })
    assertStatus(created, 201, 'inventory unit')
    unit = created.json.data
  }

  coffee = await request('POST', '/api/v1/products', {
    token,
    body: {
      categoryId: category._id,
      sku: `bev-${stamp}`,
      name: 'Arabica Coffee 1 kg',
      quantityUnitId: unit._id,
      costPrice: '12.40',
      salePrice: '18.90',
      reorderLevel: '40',
      status: 'active',
    },
  })
  assertStatus(coffee, 201, 'coffee product')
  milk = await request('POST', '/api/v1/products', {
    token,
    body: {
      categoryId: category._id,
      sku: `dai-${stamp}`,
      name: 'Whole Milk 1 L',
      quantityUnitId: unit._id,
      costPrice: '19.80',
      salePrice: '25.20',
      reorderLevel: '20',
      status: 'active',
    },
  })
  assertStatus(milk, 201, 'milk product')

  await StockBalance.create([
    {
      warehouseId: mainWh.json.data._id,
      productId: coffee.json.data._id,
      quantity: mongoose.Types.Decimal128.fromString('24'),
      reservedQuantity: mongoose.Types.Decimal128.fromString('6'),
    },
    {
      warehouseId: eastWh.json.data._id,
      productId: milk.json.data._id,
      quantity: mongoose.Types.Decimal128.fromString('126'),
      reservedQuantity: mongoose.Types.Decimal128.fromString('18'),
    },
  ])

  const now = new Date()
  const dayKey = now.toISOString().slice(0, 10)
  await StockMovement.create([
    {
      movementNumber: `MOV-INV-${stamp}`,
      branchId,
      warehouseId: mainWh.json.data._id,
      productId: coffee.json.data._id,
      quantityIn: mongoose.Types.Decimal128.fromString('0'),
      quantityOut: mongoose.Types.Decimal128.fromString('24'),
      unitCost: mongoose.Types.Decimal128.fromString('12.40'),
      movementType: 'sale',
      referenceType: 'sale',
      referenceNumber: 'SL-09184',
      ledgerNumber: 'JV-01846',
      movementDate: now,
      createdBy: adminId,
      note: '24 bags',
    },
    {
      movementNumber: `MOV-IN-${stamp}`,
      branchId,
      warehouseId: mainWh.json.data._id,
      productId: coffee.json.data._id,
      quantityIn: mongoose.Types.Decimal128.fromString('60'),
      quantityOut: mongoose.Types.Decimal128.fromString('0'),
      unitCost: mongoose.Types.Decimal128.fromString('12.40'),
      movementType: 'purchase',
      referenceType: 'purchase',
      referenceNumber: 'PO-02640',
      movementDate: now,
      createdBy: adminId,
    },
    {
      movementNumber: `MOV-OUT-${stamp}`,
      branchId,
      warehouseId: mainWh.json.data._id,
      productId: milk.json.data._id,
      quantityIn: mongoose.Types.Decimal128.fromString('0'),
      quantityOut: mongoose.Types.Decimal128.fromString('12'),
      unitCost: mongoose.Types.Decimal128.fromString('19.80'),
      movementType: 'transfer_out',
      referenceType: 'transfer',
      referenceNumber: 'TR-00811',
      movementDate: now,
      createdBy: adminId,
    },
  ])

  await ProductDamage.create({
    damageNumber: `DMG-INV-${stamp}`,
    branchId,
    warehouseId: mainWh.json.data._id,
    productId: coffee.json.data._id,
    damageType: 'broken',
    quantity: mongoose.Types.Decimal128.fromString('82'),
    unitCost: mongoose.Types.Decimal128.fromString('79.0243902439'),
    status: 'draft',
    damageDate: now,
  })

  await StockAdjustment.create({
    adjustmentNumber: `ADJ-INV-${stamp}`,
    branchId,
    warehouseId: mainWh.json.data._id,
    status: 'draft',
    adjustmentDate: now,
    lines: Array.from({ length: 14 }, (_, index) => ({
      productId: coffee.json.data._id,
      systemQuantity: mongoose.Types.Decimal128.fromString('1'),
      actualQuantity: mongoose.Types.Decimal128.fromString('0'),
      difference: mongoose.Types.Decimal128.fromString('-1'),
    })),
  })

  const listed = await request('GET', `/api/v1/stock-balances?branchId=${branchId}&limit=100`, { token })
  assertStatus(listed, 200, 'stock balances')
  assert(listed.json.data.length === 2, 'both warehouse rows are returned')
  const coffeeRow = listed.json.data.find((row) => row.sku === `BEV-${stamp}`.toUpperCase())
  assert(coffeeRow.available === '18', 'available is on hand minus reserved')
  assert(coffeeRow.reserved === '6', 'reserved is returned')
  assert(coffeeRow.onHand === '24', 'on hand is returned')
  assert(coffeeRow.state === 'critical' && coffeeRow.stateLabel === 'Critical', 'half the reorder level is critical')
  assert(coffeeRow.warehouseId.name === 'Main Warehouse', 'row names the warehouse')
  assert(coffeeRow.productName === 'Arabica Coffee 1 kg', 'row names the product')

  const summary = listed.json.meta.summary
  assert(summary.stockValue === '2792.4' || summary.stockValue === '2792.40', 'stock value is on hand times cost')
  assert(summary.availableUnits === '126', 'available units sum both warehouses')
  assert(summary.locationCount === 2, 'locations with stock are counted')
  assert(summary.lowStockSkus === 1 && summary.criticalSkus === 1, 'low and critical sku cards')
  assert(summary.damagedUnits === '82', 'damaged units come from draft damage')
  assert(Number(summary.damagedValue) > 6400 && Number(summary.damagedValue) < 6500, 'damaged value is near 6480')
  assert(summary.reconciledAt, 'reconciled time is present')

  assert(listed.json.meta.exceptions.lowStock === 1, 'exception low stock matches the card')
  assert(listed.json.meta.exceptions.damagedReview === '82', 'exception damaged review matches the card')
  assert(listed.json.meta.exceptions.countVariance === 14, 'count variance counts draft adjustment lines')

  assert(listed.json.meta.timeline.length >= 1, 'timeline includes today’s movements')
  const sale = listed.json.meta.timeline.find((row) => row.referenceNumber === 'SL-09184')
  assert(sale.movementTypeLabel === 'Sale issue', 'timeline labels the sale')
  assert(sale.quantity === '24', 'timeline returns the moved quantity')

  const searched = await request('GET', `/api/v1/stock-balances?branchId=${branchId}&search=BEV-${stamp}&limit=20`, {
    token,
  })
  assertStatus(searched, 200, 'stock search')
  assert(searched.json.data.length === 1, 'search matches the sku')
  assert(searched.json.meta.summary.stockValue === summary.stockValue, 'search leaves the stock value card')
  assert(searched.json.meta.exceptions.countVariance === 14, 'search leaves the exception summary')

  const critical = await request('GET', `/api/v1/stock-balances?branchId=${branchId}&state=critical&limit=20`, {
    token,
  })
  assertStatus(critical, 200, 'state filter')
  assert(critical.json.data.every((row) => row.state === 'critical'), 'state filter returns critical rows')
  assert(critical.json.meta.summary.lowStockSkus === summary.lowStockSkus, 'state filter leaves the cards')

  const warehouseView = await request(
    'GET',
    `/api/v1/stock-balances?warehouseId=${mainWh.json.data._id}&limit=20`,
    { token },
  )
  assertStatus(warehouseView, 200, 'warehouse filter')
  assert(warehouseView.json.data.length === 1, 'warehouse filter returns one row')
  assert(warehouseView.json.meta.summary.locationCount === 1, 'warehouse filter scopes the cards')

  const missing = await request('GET', '/api/v1/stock-balances?warehouseId=000000000000000000000000', { token })
  assertStatus(missing, 400, 'unknown warehouse')

  const soon = new Date()
  soon.setUTCDate(soon.getUTCDate() + 11)
  const later = new Date()
  later.setUTCFullYear(later.getUTCFullYear() + 1)

  const coffeeBatch = await InventoryItem.create({
    productId: coffee.json.data._id,
    warehouseId: mainWh.json.data._id,
    branchId,
    batchNumber: `CF-${stamp}`,
    serialNumber: '',
    expiryDate: later,
    unitCost: mongoose.Types.Decimal128.fromString('12.40'),
    state: 'available',
    status: 'active',
  })
  const milkBatch = await InventoryItem.create({
    productId: milk.json.data._id,
    warehouseId: mainWh.json.data._id,
    branchId,
    batchNumber: `ML-${stamp}`,
    serialNumber: '',
    expiryDate: soon,
    unitCost: mongoose.Types.Decimal128.fromString('19.80'),
    state: 'available',
    status: 'active',
  })
  const holdBatch = await InventoryItem.create({
    productId: coffee.json.data._id,
    warehouseId: mainWh.json.data._id,
    branchId,
    batchNumber: `HD-${stamp}`,
    serialNumber: `SCN-${stamp}`,
    expiryDate: later,
    unitCost: mongoose.Types.Decimal128.fromString('12.40'),
    state: 'hold',
    status: 'active',
  })
  const damagedBatch = await InventoryItem.create({
    productId: coffee.json.data._id,
    warehouseId: mainWh.json.data._id,
    branchId,
    batchNumber: `DM-${stamp}`,
    serialNumber: '',
    expiryDate: later,
    unitCost: mongoose.Types.Decimal128.fromString('12.40'),
    state: 'damaged',
    status: 'active',
  })

  await StockBalance.create([
    {
      warehouseId: mainWh.json.data._id,
      productId: coffee.json.data._id,
      inventoryItemId: coffeeBatch._id,
      quantity: mongoose.Types.Decimal128.fromString('18'),
      reservedQuantity: mongoose.Types.Decimal128.fromString('0'),
    },
    {
      warehouseId: mainWh.json.data._id,
      productId: milk.json.data._id,
      inventoryItemId: milkBatch._id,
      quantity: mongoose.Types.Decimal128.fromString('126'),
      reservedQuantity: mongoose.Types.Decimal128.fromString('0'),
    },
    {
      warehouseId: mainWh.json.data._id,
      productId: coffee.json.data._id,
      inventoryItemId: holdBatch._id,
      quantity: mongoose.Types.Decimal128.fromString('6'),
      reservedQuantity: mongoose.Types.Decimal128.fromString('0'),
    },
    {
      warehouseId: mainWh.json.data._id,
      productId: coffee.json.data._id,
      inventoryItemId: damagedBatch._id,
      quantity: mongoose.Types.Decimal128.fromString('4'),
      reservedQuantity: mongoose.Types.Decimal128.fromString('0'),
    },
  ])

  const items = await request(
    'GET',
    `/api/v1/inventory-items?warehouseId=${mainWh.json.data._id}&limit=100`,
    { token },
  )
  assertStatus(items, 200, 'inventory items')
  assert(items.json.data.length === 4, 'four inventory items are returned')
  const coffeeItem = items.json.data.find((row) => row.batchNumber === `CF-${stamp}`.toUpperCase())
  assert(coffeeItem.quantity === '18', 'item quantity comes from the stock balance')
  assert(coffeeItem.stateLabel === 'Available', 'available state label')
  assert(coffeeItem.unit?.shortCode === 'KG', 'item includes the base unit')
  assert(coffeeItem.expiryRisk === 'ok', 'far expiry is ok')
  assert(String(coffeeItem.expiryRiskLabel).includes('days'), 'ok risk shows remaining days')

  const milkItem = items.json.data.find((row) => row.batchNumber === `ML-${stamp}`.toUpperCase())
  assert(milkItem.expiryRisk === 'expiring_soon' && milkItem.expiryRiskLabel === 'Expiring soon', 'near expiry is flagged')
  assert(milkItem.daysRemaining === 11, 'days remaining matches the expiry attention card')

  const holdItem = items.json.data.find((row) => row.batchNumber === `HD-${stamp}`.toUpperCase())
  assert(holdItem.state === 'hold' && holdItem.expiryRisk === 'quality_check', 'hold is quality check')
  assert(holdItem.serialNumber === `SCN-${stamp}`.toUpperCase(), 'serial is returned')

  const damagedItem = items.json.data.find((row) => row.batchNumber === `DM-${stamp}`.toUpperCase())
  assert(damagedItem.expiryRisk === 'quarantined', 'damaged is quarantined')

  const itemSummary = items.json.meta.summary
  assert(itemSummary.activeBatches === 4, 'active batches card')
  assert(itemSummary.warehouseName === 'Main Warehouse', 'warehouse name on the active batches card')
  assert(itemSummary.expiryWithin30Days === 1, 'expiry within 30 days card')
  assert(itemSummary.heldBatches === 1 && itemSummary.damagedBatches === 1, 'held and damaged cards')
  assert(itemSummary.inventoryValue === '2842' || itemSummary.inventoryValue === '2842.0' || itemSummary.inventoryValue === '2842.00', 'inventory value is quantity times unit cost')
  assert(items.json.meta.states.all === 4, 'all states tab')
  assert(items.json.meta.states.available === 2, 'available tab count')
  assert(items.json.meta.states.hold === 1 && items.json.meta.states.damaged === 1, 'hold and damaged tabs')
  assert(items.json.meta.expiryAttention?.batchNumber === `ML-${stamp}`.toUpperCase(), 'expiry attention picks the soonest batch')
  assert(items.json.meta.expiryAttention.daysRemaining === 11, 'expiry attention remaining days')
  assert(items.json.meta.expiryAttention.quantity === '126', 'expiry attention quantity')

  const itemSearch = await request(
    'GET',
    `/api/v1/inventory-items?warehouseId=${mainWh.json.data._id}&search=ML-${stamp}&limit=20`,
    { token },
  )
  assertStatus(itemSearch, 200, 'inventory item search')
  assert(itemSearch.json.data.length === 1, 'search matches the batch')
  assert(itemSearch.json.meta.summary.activeBatches === 4, 'search leaves the cards')

  const availableOnly = await request(
    'GET',
    `/api/v1/inventory-items?warehouseId=${mainWh.json.data._id}&state=available&limit=20`,
    { token },
  )
  assertStatus(availableOnly, 200, 'inventory state filter')
  assert(availableOnly.json.data.every((row) => row.state === 'available'), 'state filter returns available rows')
  assert(availableOnly.json.meta.states.available === 2, 'state filter leaves the tab counts')

  const soonOnly = await request(
    'GET',
    `/api/v1/inventory-items?warehouseId=${mainWh.json.data._id}&expiryRisk=expiring_soon&limit=20`,
    { token },
  )
  assertStatus(soonOnly, 200, 'expiry risk filter')
  assert(soonOnly.json.data.length === 1 && soonOnly.json.data[0].batchNumber === `ML-${stamp}`.toUpperCase(), 'expiry risk filter')

  const movements = await request(
    'GET',
    `/api/v1/stock-movements?warehouseId=${mainWh.json.data._id}&date=${dayKey}&limit=100`,
    { token },
  )
  assertStatus(movements, 200, 'stock movements')
  assert(movements.json.data.length === 3, 'three movements on the selected day')
  const saleRow = movements.json.data.find((row) => row.referenceNumber === 'SL-09184')
  assert(saleRow.movementTypeLabel === 'Sale', 'register labels the sale')
  assert(saleRow.quantityOut === '24' && saleRow.quantityIn == null, 'sale shows quantity out')
  assert(saleRow.unitCost === '12.4' || saleRow.unitCost === '12.40', 'sale shows unit cost')
  assert(saleRow.lineValue === '297.6' || saleRow.lineValue === '297.60', 'sale line value is quantity times cost')
  assert(saleRow.createdBy?.name, 'sale shows the creator')
  assert(saleRow.warehouseId.name === 'Main Warehouse', 'sale shows the warehouse')
  assert(saleRow.ledgerNumber === 'JV-01846', 'sale keeps the ledger number')

  const moveSummary = movements.json.meta.summary
  assert(moveSummary.movementsToday === 3, 'movements today card')
  assert(moveSummary.warehouseName === 'Main Warehouse', 'warehouse name on the movements card')
  assert(moveSummary.quantityIn === '60', 'quantity in card')
  assert(moveSummary.quantityOut === '36', 'quantity out card')
  assert(moveSummary.netMovement === '24', 'net movement is in minus out')

  const typeFilter = await request(
    'GET',
    `/api/v1/stock-movements?warehouseId=${mainWh.json.data._id}&date=${dayKey}&movementType=sale&limit=20`,
    { token },
  )
  assertStatus(typeFilter, 200, 'movement type filter')
  assert(typeFilter.json.data.length === 1 && typeFilter.json.data[0].movementType === 'sale', 'type filter returns sales')
  assert(typeFilter.json.meta.summary.movementsToday === 3, 'type filter leaves the cards')

  const docSearch = await request(
    'GET',
    `/api/v1/stock-movements?warehouseId=${mainWh.json.data._id}&date=${dayKey}&search=PO-02640&limit=20`,
    { token },
  )
  assertStatus(docSearch, 200, 'movement document search')
  assert(docSearch.json.data.length === 1 && docSearch.json.data[0].movementTypeLabel === 'Purchase', 'search matches the source document')
  assert(docSearch.json.meta.summary.quantityIn === '60', 'search leaves the quantity in card')

  const detail = await request('GET', `/api/v1/stock-movements/${saleRow._id}`, { token })
  assertStatus(detail, 200, 'stock movement detail')
  assert(detail.json.data.sourceTrace.referenceNumber === 'SL-09184', 'source trace names the document')
  assert(detail.json.data.sourceTrace.direction === 'out', 'source trace direction is out')
  assert(detail.json.data.sourceTrace.quantity === '24', 'source trace quantity')
  assert(detail.json.data.sourceTrace.ledgerNumber === 'JV-01846', 'source trace ledger number')
  assert(detail.json.data.sourceTrace.lineValue === '297.6' || detail.json.data.sourceTrace.lineValue === '297.60', 'source trace value')

  const missingMovement = await request('GET', '/api/v1/stock-movements/000000000000000000000000', { token })
  assertStatus(missingMovement, 404, 'unknown stock movement')

  assert(login.json.data.user.permissionCodes.includes('transfer.approve'), 'admin can approve transfers')
  airportWh = await request('POST', '/api/v1/warehouses', {
    token,
    body: {
      branchId,
      name: 'Airport Shop Store',
      code: `inv-aw-${stamp}`,
      address: 'Airport Road',
    },
  })
  assertStatus(airportWh, 201, 'airport warehouse')

  await StockBalance.findOneAndUpdate(
    {
      warehouseId: mainWh.json.data._id,
      productId: coffee.json.data._id,
      inventoryItemId: null,
    },
    {
      $set: {
        quantity: mongoose.Types.Decimal128.fromString('100'),
        reservedQuantity: mongoose.Types.Decimal128.fromString('0'),
      },
    },
    { upsert: true },
  )
  await StockBalance.findOneAndUpdate(
    {
      warehouseId: mainWh.json.data._id,
      productId: milk.json.data._id,
      inventoryItemId: null,
    },
    {
      $set: {
        quantity: mongoose.Types.Decimal128.fromString('50'),
        reservedQuantity: mongoose.Types.Decimal128.fromString('0'),
      },
    },
    { upsert: true },
  )

  const draftTransfer = await request('POST', '/api/v1/transfers', {
    token,
    body: {
      sourceWarehouseId: mainWh.json.data._id,
      destinationWarehouseId: airportWh.json.data._id,
      reason: 'Store replenishment',
      vehicle: 'VH-014',
      expectedDate: dayKey,
      lines: [
        { productId: coffee.json.data._id, quantity: '24', unitCost: '12.40' },
        { productId: milk.json.data._id, quantity: '40', unitCost: '19.80' },
      ],
    },
  })
  assertStatus(draftTransfer, 201, 'create transfer')
  assert(draftTransfer.json.data.statusLabel === 'Draft', 'new transfer is draft')
  assert(draftTransfer.json.data.linesMeta.lineCount === 2, 'transfer has two lines')
  assert(draftTransfer.json.data.linesMeta.unitCount === '64', 'transfer totals requested units')
  assert(draftTransfer.json.data.source.warehouseId.name === 'Main Warehouse', 'source warehouse')
  assert(draftTransfer.json.data.destination.warehouseId.name === 'Airport Shop Store', 'destination warehouse')
  assert(draftTransfer.json.data.accountability.requester?.name, 'requester is set')
  assert(draftTransfer.json.data.accountability.receiverPending === true, 'receiver is pending')
  assert(draftTransfer.json.data.lines.every((line) => line.quantityShipped == null), 'draft has no shipped qty')
  assert(draftTransfer.json.data.stockImpact.sourceReduction.state === 'pending', 'draft stock impact is pending')

  const sameWarehouse = await request('POST', '/api/v1/transfers', {
    token,
    body: {
      sourceWarehouseId: mainWh.json.data._id,
      destinationWarehouseId: mainWh.json.data._id,
      lines: [{ productId: coffee.json.data._id, quantity: '1' }],
    },
  })
  assertStatus(sameWarehouse, 400, 'source and destination must differ')

  const receiveEarly = await request('POST', `/api/v1/transfers/${draftTransfer.json.data._id}/receive`, {
    token,
  })
  assertStatus(receiveEarly, 400, 'receive without dispatch')

  const dispatched = await request('POST', `/api/v1/transfers/${draftTransfer.json.data._id}/dispatch`, {
    token,
  })
  assertStatus(dispatched, 200, 'dispatch transfer')
  assert(dispatched.json.data.statusLabel === 'In Transit', 'dispatched transfer is in transit')
  assert(dispatched.json.data.workflow.inTransit.done === true, 'workflow marks in transit done')
  assert(dispatched.json.data.workflow.received.awaiting === true, 'workflow awaits receiver')
  assert(dispatched.json.data.accountability.approver?.name, 'approver is set on dispatch')
  assert(dispatched.json.data.lines.every((line) => line.quantityShipped != null), 'dispatch fills shipped qty')
  assert(dispatched.json.data.stockImpact.sourceReduction.quantity === '-64', 'source reduction is posted')
  assert(dispatched.json.data.stockImpact.sourceReduction.stateLabel === 'Posted', 'source reduction posted label')
  assert(dispatched.json.data.stockImpact.stockInTransit.quantity === '64', 'stock in transit is active')
  assert(dispatched.json.data.stockImpact.destinationIncrease.stateLabel === 'On receipt', 'destination waits on receipt')
  assert(
    dispatched.json.data.lines.some((line) => line.batchLabel === 'Not tracked'),
    'untracked batch shows Not tracked',
  )

  const sourceBalance = await StockBalance.findOne({
    warehouseId: mainWh.json.data._id,
    productId: coffee.json.data._id,
    inventoryItemId: null,
  }).lean()
  assert(String(sourceBalance.quantity) === '76', 'dispatch reduces source stock')

  const transferDetail = await request('GET', `/api/v1/transfers/${dispatched.json.data._id}`, { token })
  assertStatus(transferDetail, 200, 'transfer detail')
  assert(transferDetail.json.data.transferNumber === dispatched.json.data.transferNumber, 'detail returns the transfer')
  assert(transferDetail.json.data.reason === 'Store replenishment', 'detail keeps the reason')
  assert(transferDetail.json.data.vehicle === 'VH-014', 'detail keeps the vehicle')

  const transferOut = await StockMovement.findOne({
    referenceNumber: dispatched.json.data.transferNumber,
    movementType: 'transfer_out',
    productId: coffee.json.data._id,
  }).lean()
  assert(transferOut, 'dispatch writes transfer_out movement')

  const received = await request('POST', `/api/v1/transfers/${dispatched.json.data._id}/receive`, { token })
  assertStatus(received, 200, 'receive transfer')
  assert(received.json.data.statusLabel === 'Received', 'received transfer status')
  assert(received.json.data.accountability.receiverPending === false, 'receiver is set')
  assert(received.json.data.stockImpact.stockInTransit.quantity === '0', 'in transit clears on receipt')
  assert(received.json.data.stockImpact.destinationIncrease.stateLabel === 'Posted', 'destination increase is posted')

  const destBalance = await StockBalance.findOne({
    warehouseId: airportWh.json.data._id,
    productId: coffee.json.data._id,
    inventoryItemId: null,
  }).lean()
  assert(String(destBalance.quantity) === '24', 'receive increases destination stock')

  const doubleDispatch = await request('POST', `/api/v1/transfers/${dispatched.json.data._id}/dispatch`, {
    token,
  })
  assertStatus(doubleDispatch, 400, 'double dispatch rejected')

  const cancelReceived = await request('POST', `/api/v1/transfers/${dispatched.json.data._id}/cancel`, {
    token,
  })
  assertStatus(cancelReceived, 400, 'cancel received rejected')

  const listedTransfers = await request('GET', `/api/v1/transfers?warehouseId=${mainWh.json.data._id}&limit=20`, {
    token,
  })
  assertStatus(listedTransfers, 200, 'transfer list')
  assert(
    listedTransfers.json.data.some((row) => row.transferNumber === dispatched.json.data.transferNumber),
    'list includes the transfer',
  )

  const specRes = await request('GET', '/openapi.json')
  assertStatus(specRes, 200, 'openapi')
  assert(specRes.json.paths['/api/v1/stock-balances'], 'openapi documents stock balances')
  assert(specRes.json.paths['/api/v1/inventory-items'], 'openapi documents inventory items')
  assert(specRes.json.paths['/api/v1/stock-movements'], 'openapi documents stock movements')
  assert(specRes.json.paths['/api/v1/transfers'], 'openapi documents transfers')
  assert(specRes.json.paths['/api/v1/transfers/{id}/dispatch'], 'openapi documents transfer dispatch')
  assert(specRes.json.components.schemas.StockBalanceRegisterSummary, 'openapi documents the stock cards')
  assert(specRes.json.components.schemas.InventoryItemRegisterSummary, 'openapi documents the inventory item cards')
  assert(specRes.json.components.schemas.StockMovementRegisterSummary, 'openapi documents the movement cards')
  assert(specRes.json.components.schemas.WarehouseTransfer, 'openapi documents the transfer detail')

  console.log('inventory checks passed')
} finally {
  try {
    await StockAdjustment.deleteMany({ adjustmentNumber: `ADJ-INV-${stamp}` })
    await ProductDamage.deleteMany({ damageNumber: `DMG-INV-${stamp}` })
    await StockMovement.deleteMany({
      $or: [
        { movementNumber: { $in: [`MOV-INV-${stamp}`, `MOV-IN-${stamp}`, `MOV-OUT-${stamp}`] } },
        { referenceNumber: { $regex: `^TR-` } },
      ],
    })
    const { WarehouseTransfer } = await import('../src/modules/inventory/warehouseTransfer.model.js')
    await WarehouseTransfer.deleteMany({
      sourceWarehouseId: { $in: [mainWh?.json?.data?._id, airportWh?.json?.data?._id].filter(Boolean) },
    })
    await InventoryItem.deleteMany({
      productId: {
        $in: [coffee?.json?.data?._id, milk?.json?.data?._id].filter(Boolean),
      },
    })
    await StockBalance.deleteMany({
      productId: {
        $in: [coffee?.json?.data?._id, milk?.json?.data?._id].filter(Boolean),
      },
    })
    await Product.deleteMany({ sku: { $in: [`BEV-${stamp}`.toUpperCase(), `DAI-${stamp}`.toUpperCase()] } })
    await Warehouse.deleteMany({
      code: {
        $in: [
          `INV-MW-${stamp}`.toUpperCase(),
          `INV-EW-${stamp}`.toUpperCase(),
          `INV-AW-${stamp}`.toUpperCase(),
        ],
      },
    })
    await Branch.deleteMany({ code: `INV-B-${stamp}`.toUpperCase() })
  } catch {
    // cleanup best-effort
  }
  if (server) await new Promise((resolve) => server.close(resolve))
  if (mongoose.connection.readyState !== 0) await mongoose.disconnect()
}
