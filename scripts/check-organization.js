import mongoose from 'mongoose'
import { env } from '../src/config/env.js'
import { connectDb } from '../src/config/db.js'
import { createApp } from '../src/app.js'
import { seedAuth } from '../src/seed/seedAuth.js'
import { cache } from '../src/common/utils/cache.js'
import { Branch } from '../src/modules/branch/branch.model.js'
import { Currency } from '../src/modules/currency/currency.model.js'
import { Shop } from '../src/modules/shop/shop.model.js'
import { Employee } from '../src/modules/employee/employee.model.js'
import { Warehouse } from '../src/modules/warehouse/warehouse.model.js'

const LIMITED_EMAIL = 'org.limited@gulzar.local'
const LIMITED_PASSWORD = 'OrgLimited1'
const MISSING_ID = '000000000000000000000000'

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

function parentId(value) {
  if (value && typeof value === 'object') return String(value._id)
  return String(value)
}

async function ensureBranch(request, token, { name, code }) {
  const listed = await request('GET', `/api/v1/branches?search=${encodeURIComponent(code)}&limit=20`, { token })
  assertStatus(listed, 200, `search branch ${code}`)
  const found = listed.json.data.find((item) => item.code === code)
  if (!found) {
    const created = await request('POST', '/api/v1/branches', {
      token,
      body: { name, code, branchType: 'retail', address: '1 Test Road', status: 'active' },
    })
    assertStatus(created, 201, `create branch ${code}`)
    return created.json.data
  }
  const updated = await request('PATCH', `/api/v1/branches/${found._id}`, {
    token,
    body: { name, status: 'active' },
  })
  assertStatus(updated, 200, `reset branch ${code}`)
  return updated.json.data
}

async function ensureChild(request, token, resource, { name, code, branchId, ...extra }) {
  const listed = await request('GET', `/api/v1/${resource}?search=${encodeURIComponent(code)}&limit=20`, { token })
  assertStatus(listed, 200, `search ${resource} ${code}`)
  const found = listed.json.data.find((item) => item.code === code)
  if (!found) {
    const created = await request('POST', `/api/v1/${resource}`, {
      token,
      body: { name, code, branchId, status: 'active', ...extra },
    })
    assertStatus(created, 201, `create ${resource} ${code}`)
    return created.json.data
  }
  const updated = await request('PATCH', `/api/v1/${resource}/${found._id}`, {
    token,
    body: { name, branchId, status: 'active' },
  })
  assertStatus(updated, 200, `reset ${resource} ${code}`)
  return updated.json.data
}

async function setBranchStatus(request, token, id, status) {
  const updated = await request('PATCH', `/api/v1/branches/${id}/status`, {
    token,
    body: { status },
  })
  assertStatus(updated, 200, `set branch ${status}`)
  assert(updated.json.data.status === status, `branch status is ${status}`)
  return updated.json.data
}

let server
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
  assert(login.json.data.user.permissionCodes.includes('branch.create'), 'admin can create branches')
  const adminToken = login.json.data.accessToken

  const branchA = await ensureBranch(request, adminToken, { name: 'Org Branch A', code: 'ORG-A' })
  const branchB = await ensureBranch(request, adminToken, { name: 'Org Branch B', code: 'ORG-B' })
  const warehouseA = await ensureChild(request, adminToken, 'warehouses', {
    name: 'Org Warehouse A',
    code: 'ORG-WA',
    branchId: branchA._id,
    address: '1 Warehouse Road',
  })
  const warehouseB = await ensureChild(request, adminToken, 'warehouses', {
    name: 'Org Warehouse B',
    code: 'ORG-WB',
    branchId: branchB._id,
    address: '2 Warehouse Road',
  })
  const shopA = await ensureChild(request, adminToken, 'shops', {
    name: 'Org Shop A',
    code: 'ORG-SA',
    branchId: branchA._id,
    shopType: 'retail',
    address: '1 Shop Road',
  })
  await ensureChild(request, adminToken, 'shops', {
    name: 'Org Shop B',
    code: 'ORG-SB',
    branchId: branchB._id,
    shopType: 'outlet',
    address: '2 Shop Road',
  })

  assert(warehouseA.address === undefined || typeof warehouseA.address === 'string', 'warehouse detail has address')
  assert(parentId(warehouseA.branchId) === String(branchA._id), 'warehouse A belongs to branch A')

  const filtered = await request('GET', `/api/v1/warehouses?branchId=${branchA._id}&limit=100`, {
    token: adminToken,
  })
  assertStatus(filtered, 200, 'warehouses by branch')
  assert(filtered.json.meta?.total >= 1, 'warehouse list includes meta')
  assert(
    filtered.json.data.every((item) => parentId(item.branchId) === String(branchA._id)),
    'branch filter stays on branch A',
  )
  assert(!filtered.json.data.some((item) => item.code === 'ORG-WB'), 'branch A filter hides warehouse B')
  assert(filtered.json.data.every((item) => item.address === undefined), 'warehouse list omits address')
  assert(filtered.json.meta.summary?.warehouses?.total >= 2, 'warehouse cards count warehouses')
  assert(filtered.json.meta.summary.warehouses.active >= 1, 'warehouse cards count active warehouses')
  assert(filtered.json.meta.summary.storageZones === 0, 'storage zones are empty until zones exist')
  assert(filtered.json.meta.summary.custodians === 0, 'custodians are empty until employees exist')
  const warehouseRow = filtered.json.data.find((item) => item.code === 'ORG-WA')
  assert(!warehouseRow?.location, 'warehouse register includes location')
  assert(warehouseRow.managerId == null, 'warehouse register manager is unassigned')
  assert(warehouseRow.branchId?.code === 'ORG-A', 'warehouse register includes the branch')

  const warehousePage = await request('GET', `/api/v1/warehouses/${warehouseA._id}`, { token: adminToken })
  assertStatus(warehousePage, 200, 'warehouse page detail')
  assert(typeof warehousePage.json.data.address === 'string', 'warehouse detail keeps the operating address')
  assert(warehousePage.json.data.branchId?.code === 'ORG-A', 'warehouse detail includes the parent branch')
  assert(Array.isArray(warehousePage.json.data.zones) && warehousePage.json.data.zones.length === 0, 'zones table is empty')
  assert(warehousePage.json.data.zonesMeta?.total === 0, 'zones table total is zero')
  assert(warehousePage.json.data.summary?.warehouses?.total >= 1, 'warehouse view includes the cards')
  assert(warehousePage.json.data.summary.warehouses.active >= 1, 'warehouse view counts active warehouses')
  assert(warehousePage.json.data.summary.storageZones === 0, 'warehouse view storage zones follow stored zones')
  assert(warehousePage.json.data.summary.custodians === 0, 'warehouse view custodians are empty until employees exist')
  assert(warehousePage.json.data.managerId == null, 'warehouse custodian is empty until employees exist')
  assert(typeof warehousePage.json.data.createdAt === 'string', 'created on is createdAt')
  assert(typeof warehousePage.json.data.updatedAt === 'string', 'updated is updatedAt')
  const zoned = await request('GET', `/api/v1/warehouses/${warehouseA._id}?page=1&limit=2`, { token: adminToken })
  assertStatus(zoned, 200, 'paged zones')
  assert(zoned.json.data.zonesMeta?.page === 1 && zoned.json.data.zonesMeta?.limit === 2, 'zones table accepts page and limit')

  const warehouseCode = `wh-${Date.now().toString(36)}`
  const addedWarehouse = await request('POST', '/api/v1/warehouses', {
    token: adminToken,
    body: {
      name: 'Main Warehouse',
      code: warehouseCode,
      branchId: branchA._id,
      warehouseType: 'finished_goods',
      address: '18 Commerce Avenue',
      phone: '+1 202 555 0148',
      floorArea: 'Ground floor',
      storageCapacity: '40000 kg',
      managerId: null,
      stockAccount: 'Stock-CEN',
      defaultZone: 'Zone A',
      binTracking: 'Enabled',
      negativeStock: 'Not allowed',
      status: 'active',
      notes: 'Add remarks for authorized workspace administrators',
    },
  })
  assertStatus(addedWarehouse, 201, 'add warehouse form')
  assert(addedWarehouse.json.data.warehouseType === 'finished_goods', 'warehouse type is stored')
  assert(addedWarehouse.json.data.warehouseTypeLabel === 'Finished goods', 'warehouse type label is returned')
  assert(addedWarehouse.json.data.address === '18 Commerce Avenue', 'warehouse address is stored')
  assert(addedWarehouse.json.data.phone === '+1 202 555 0148', 'warehouse phone is stored')
  assert(addedWarehouse.json.data.floorArea === 'Ground floor', 'floor area is stored')
  assert(addedWarehouse.json.data.storageCapacity === '40000 kg', 'storage capacity is stored')
  assert(addedWarehouse.json.data.stockAccount === 'Stock-CEN', 'default stock account is stored')
  assert(addedWarehouse.json.data.defaultZone === 'Zone A', 'default zone is stored')
  assert(addedWarehouse.json.data.binTracking === 'Enabled', 'bin tracking is stored')
  assert(addedWarehouse.json.data.negativeStock === 'Not allowed', 'negative stock is stored')
  assert(addedWarehouse.json.data.notes === 'Add remarks for authorized workspace administrators', 'warehouse notes are stored')
  assert(addedWarehouse.json.data.managerId === null, 'custodian stays empty until employees exist')
  assert(addedWarehouse.json.data.code === warehouseCode.toUpperCase(), 'warehouse code is stored uppercase')
  assert(addedWarehouse.json.data.zonesMeta?.total === 0, 'new warehouse has no zones')

  await Warehouse.updateOne(
    { _id: addedWarehouse.json.data._id },
    {
      $set: {
        zones: [
          {
            code: 'ZN-A',
            name: 'Zone A / A-01',
            use: 'finished_goods',
            capacity: '40000',
            unit: 'kg',
            status: 'active',
          },
        ],
      },
    },
  )
  const shopBeforeWarehouseEdit = await request('GET', `/api/v1/shops/${shopA._id}`, { token: adminToken })
  const editedWarehouse = await request('PATCH', `/api/v1/warehouses/${addedWarehouse.json.data._id}`, {
    token: adminToken,
    body: {
      name: 'Main Warehouse',
      code: warehouseCode,
      branchId: branchA._id,
      warehouseType: 'finished_goods',
      address: 'Warehouse Road, City Center',
      phone: '',
      floorArea: '2,400 sq ft',
      storageCapacity: '120,000 kg',
      managerId: null,
      stockAccount: 'Inventory — finished goods',
      defaultZone: 'Zone A',
      binTracking: 'Enabled',
      negativeStock: 'Blocked',
      status: 'active',
      notes: 'Add remarks for authorized workspace administrators',
    },
  })
  assertStatus(editedWarehouse, 200, 'edit warehouse')
  assert(editedWarehouse.json.data.warehouseTypeLabel === 'Finished goods', 'edit returns the warehouse type label')
  assert(editedWarehouse.json.data.address === 'Warehouse Road, City Center', 'edit stores the warehouse address')
  assert(editedWarehouse.json.data.phone === '', 'edit stores an empty phone')
  assert(editedWarehouse.json.data.floorArea === '2,400 sq ft', 'edit stores the floor area')
  assert(editedWarehouse.json.data.storageCapacity === '120,000 kg', 'edit stores the storage capacity')
  assert(editedWarehouse.json.data.stockAccount === 'Inventory — finished goods', 'edit stores the stock account')
  assert(editedWarehouse.json.data.defaultZone === 'Zone A', 'edit stores the default zone')
  assert(editedWarehouse.json.data.binTracking === 'Enabled', 'edit stores bin tracking')
  assert(editedWarehouse.json.data.negativeStock === 'Blocked', 'edit stores negative stock')
  assert(editedWarehouse.json.data.notes === 'Add remarks for authorized workspace administrators', 'edit stores the warehouse notes')
  assert(editedWarehouse.json.data.managerId === null, 'edit leaves the custodian empty')
  assert(editedWarehouse.json.data.code === warehouseCode.toUpperCase(), 'edit stores the code uppercase')
  assert(parentId(editedWarehouse.json.data.branchId) === String(branchA._id), 'edit keeps the parent branch')
  assert(editedWarehouse.json.data.zones[0]?.code === 'ZN-A', 'edit keeps the zone')
  assert(editedWarehouse.json.data.zones[0]?.useLabel === 'Finished goods', 'edit returns the zone use')
  const keptDocument = await request('PATCH', `/api/v1/warehouses/${addedWarehouse.json.data._id}`, {
    token: adminToken,
    body: { name: 'Main Warehouse' },
  })
  assertStatus(keptDocument, 200, 'edit keeps the warehouse name')
  assert(keptDocument.json.data.zones[0]?.code === 'ZN-A', 'zone stays after a later edit')
  const shopAfterWarehouseEdit = await request('GET', `/api/v1/shops/${shopA._id}`, { token: adminToken })
  assert(shopAfterWarehouseEdit.json.data.name === shopBeforeWarehouseEdit.json.data.name, 'warehouse edit leaves the shop name')
  assert(shopAfterWarehouseEdit.json.data.code === shopBeforeWarehouseEdit.json.data.code, 'warehouse edit leaves the shop code')
  await Warehouse.deleteOne({ _id: addedWarehouse.json.data._id })

  const missingAddress = await request('POST', '/api/v1/warehouses', {
    token: adminToken,
    body: { name: 'No Address', code: 'NO-WH-ADDR', branchId: branchA._id },
  })
  assertStatus(missingAddress, 400, 'warehouse address is required')
  assert(
    warehousePage.json.data.locations.some((row) => row.type === 'warehouse' && row.code === 'ORG-WA'),
    'location hierarchy includes the warehouse',
  )
  assert(
    warehousePage.json.data.locations.some((row) => row.type === 'shop' && row.code === 'ORG-SA'),
    'location hierarchy includes the shop',
  )
  assert(
    !warehousePage.json.data.locations.some((row) => row.code === 'ORG-WB' || row.code === 'ORG-SB'),
    'location hierarchy stays inside the warehouse branch',
  )

  const branchPage = await request('GET', `/api/v1/branches/${branchA._id}`, { token: adminToken })
  assertStatus(branchPage, 200, 'branch page detail')
  assert(branchPage.json.data.warehouseCount >= 1, 'branch detail counts warehouses')
  assert(branchPage.json.data.shopCount >= 1, 'branch detail counts shops')
  assert(branchPage.json.data.summary?.branches?.total >= 1, 'branch view includes the cards')
  assert(branchPage.json.data.summary.warehouses.total >= 1, 'branch view counts warehouses on the cards')
  assert(branchPage.json.data.locationsMeta?.total >= 2, 'shops and warehouses table has a total')
  const locationRow = branchPage.json.data.locations.find((row) => row.code === 'ORG-WA')
  assert(locationRow?.name === 'Org Warehouse A', 'table location is the warehouse name')
  assert(locationRow.type === 'warehouse', 'table type is warehouse')
  assert(locationRow.managerId == null, 'custodian is empty until employees exist')
  assert(
    branchPage.json.data.locations[0]?.type === 'warehouse',
    'branch hierarchy lists warehouses before shops',
  )

  const shopRegister = await request('GET', '/api/v1/shops?limit=100', { token: adminToken })
  assertStatus(shopRegister, 200, 'shop register')
  assert(shopRegister.json.meta.summary?.shops?.total >= 2, 'shop cards count shops')
  assert(shopRegister.json.meta.summary.shops.active >= 1, 'shop cards count active shops')
  assert(shopRegister.json.meta.summary.branches >= 1, 'shop cards count branches that have shops')
  assert(shopRegister.json.meta.summary.assignedStaff === 0, 'assigned staff is empty until employees exist')
  const shopRow = shopRegister.json.data.find((item) => item.code === 'ORG-SA')
  assert(shopRow?.name === 'Org Shop A', 'shop register includes the shop name')
  assert(shopRow.branchId?.name === 'Org Branch A', 'shop register includes the branch')
  assert(shopRow.managerId == null, 'shop manager is empty until employees exist')
  assert(shopRow.address === undefined, 'shop register omits the address')

  const shopCode = `shop-${Date.now().toString(36)}`
  const addedShop = await request('POST', '/api/v1/shops', {
    token: adminToken,
    body: {
      name: 'Central Shop',
      code: shopCode,
      branchId: branchA._id,
      shopType: 'retail',
      address: '18 Commerce Avenue',
      location: 'City Center',
      phone: '+1 202 555 0148',
      email: 'Shop@Example.com',
      warehouseId: warehouseA._id,
      priceList: 'Retail',
      cashAccount: 'Cash-CEN',
      openingHours: '09:00-21:00',
      status: 'active',
      managerId: null,
      notes: 'Add remarks for authorized workspace administrators',
    },
  })
  assertStatus(addedShop, 201, 'add shop form')
  assert(addedShop.json.data.shopType === 'retail', 'shop type is stored')
  assert(addedShop.json.data.shopTypeLabel === 'Retail outlet', 'shop type label is returned')
  assert(addedShop.json.data.summary?.shops?.total >= 1, 'shop view includes the cards')
  assert(addedShop.json.data.summary.assignedStaff === 0, 'shop view assigned staff is empty')
  assert(addedShop.json.data.employeesMeta?.total === 0, 'assigned employees table is empty')
  assert(addedShop.json.data.address === '18 Commerce Avenue', 'shop address is stored')
  assert(addedShop.json.data.location === 'City Center', 'shop city is stored')
  assert(addedShop.json.data.email === 'shop@example.com', 'shop email is stored lowercase')
  assert(addedShop.json.data.priceList === 'Retail', 'price list is stored')
  assert(addedShop.json.data.cashAccount === 'Cash-CEN', 'cash account is stored')
  assert(addedShop.json.data.openingHours === '09:00-21:00', 'opening hours are stored')
  assert(addedShop.json.data.managerId === null, 'shop manager stays empty until employees exist')
  assert(parentId(addedShop.json.data.warehouseId) === String(warehouseA._id), 'add shop links a warehouse in the branch')
  assert(addedShop.json.data.code === shopCode.toUpperCase(), 'shop code is stored uppercase')

  const missingShopType = await request('POST', '/api/v1/shops', {
    token: adminToken,
    body: { name: 'No Type', code: 'NO-SHOP-TYPE', branchId: branchA._id, address: '1 Road' },
  })
  assertStatus(missingShopType, 400, 'shop type is required')

  const shopWrongWarehouse = await request('POST', '/api/v1/shops', {
    token: adminToken,
    body: {
      name: 'Wrong Warehouse Shop',
      code: `bad-shop-${Date.now().toString(36)}`,
      branchId: branchA._id,
      shopType: 'outlet',
      address: '1 Road',
      warehouseId: warehouseB._id,
    },
  })
  assertStatus(shopWrongWarehouse, 400, 'add shop rejects a warehouse from another branch')
  assert(shopWrongWarehouse.json.errors?.[0]?.field === 'warehouseId', 'add shop warehouse field')
  await Shop.deleteOne({ _id: addedShop.json.data._id })

  const linkedShop = await request('PATCH', `/api/v1/shops/${shopA._id}`, {
    token: adminToken,
    body: {
      name: 'Org Shop A',
      code: 'ORG-SA',
      branchId: branchA._id,
      shopType: 'retail',
      address: '18 Commerce Avenue',
      location: 'City Center',
      phone: '',
      email: 'shop@example.com',
      managerId: null,
      warehouseId: warehouseA._id,
      priceList: 'Standard retail',
      cashAccount: 'Central shop cash',
      openingHours: '09:00-18:00',
      status: 'active',
      notes: 'Add remarks for authorized workspace administrators',
    },
  })
  assertStatus(linkedShop, 200, 'edit shop')
  assert(linkedShop.json.data.shopTypeLabel === 'Retail outlet', 'edit returns the shop type label')
  assert(linkedShop.json.data.address === '18 Commerce Avenue', 'edit stores the shop address')
  assert(linkedShop.json.data.location === 'City Center', 'edit stores the shop city')
  assert(linkedShop.json.data.email === 'shop@example.com', 'edit stores the shop email')
  assert(linkedShop.json.data.priceList === 'Standard retail', 'edit stores the price list')
  assert(linkedShop.json.data.cashAccount === 'Central shop cash', 'edit stores the cash account')
  assert(linkedShop.json.data.openingHours === '09:00-18:00', 'edit stores the opening hours')
  assert(linkedShop.json.data.notes === 'Add remarks for authorized workspace administrators', 'edit stores the shop notes')
  assert(parentId(linkedShop.json.data.branchId) === String(branchA._id), 'edit keeps the parent branch')
  assert(parentId(linkedShop.json.data.warehouseId) === String(warehouseA._id), 'shop stores its linked warehouse')
  assert(linkedShop.json.data.warehouseId?.code === 'ORG-WA', 'linked warehouse includes its code')
  assert(
    linkedShop.json.data.warehouses.some((row) => row.code === 'ORG-WA'),
    'shop detail lists warehouses in its branch',
  )
  assert(
    !linkedShop.json.data.warehouses.some((row) => row.code === 'ORG-WB'),
    'shop detail hides warehouses from other branches',
  )
  assert(Array.isArray(linkedShop.json.data.employees) && linkedShop.json.data.employees.length === 0, 'assigned employees are empty')

  const foreignShopWarehouse = await request('PATCH', `/api/v1/shops/${shopA._id}`, {
    token: adminToken,
    body: { warehouseId: warehouseB._id },
  })
  assertStatus(foreignShopWarehouse, 400, 'shop rejects a warehouse from another branch')
  assert(foreignShopWarehouse.json.errors?.[0]?.field === 'warehouseId', 'foreign shop warehouse field')
  const warehouseAfterShopEdit = await request('GET', `/api/v1/warehouses/${warehouseA._id}`, { token: adminToken })
  assertStatus(warehouseAfterShopEdit, 200, 'warehouse remains after shop edit')
  assert(warehouseAfterShopEdit.json.data.name === 'Org Warehouse A', 'shop edit leaves the warehouse record as it was')

  const edited = await request('PATCH', `/api/v1/branches/${branchA._id}`, {
    token: adminToken,
    body: {
      name: 'Org Branch A',
      branchType: 'operating',
      openingDate: '2026-01-01',
      address: '18 Commerce Avenue',
      location: 'City Center',
      email: 'central@example.com',
      phone: '',
      managerId: null,
      defaultWarehouseId: warehouseA._id,
      defaultShopId: shopA._id,
      status: 'active',
      costCentre: 'CC-CEN',
      documentPrefix: 'cen',
      notes: 'Add remarks for authorized workspace administrators',
    },
  })
  assertStatus(edited, 200, 'edit branch')
  assert(edited.json.data.branchTypeLabel === 'Operating branch', 'edit returns the branch type label')
  assert(edited.json.data.address === '18 Commerce Avenue', 'edit stores the address')
  assert(edited.json.data.location === 'City Center', 'edit stores the city')
  assert(edited.json.data.email === 'central@example.com', 'edit stores the email')
  assert(edited.json.data.costCentre === 'CC-CEN', 'edit stores the cost centre')
  assert(edited.json.data.documentPrefix === 'CEN', 'edit stores the document prefix')
  assert(parentId(edited.json.data.defaultWarehouseId) === String(warehouseA._id), 'edit sets the default warehouse')
  assert(edited.json.data.defaultWarehouseId?.name === 'Org Warehouse A', 'default warehouse name is returned')
  assert(parentId(edited.json.data.defaultShopId) === String(shopA._id), 'edit sets the default shop')
  assert(edited.json.data.code === 'ORG-A', 'edit keeps the branch code')
  const warehouseAfterEdit = await request('GET', `/api/v1/warehouses/${warehouseA._id}`, { token: adminToken })
  assertStatus(warehouseAfterEdit, 200, 'warehouse remains after branch edit')
  assert(warehouseAfterEdit.json.data.name === 'Org Warehouse A', 'branch edit leaves the warehouse record as it was')

  const foreignDefault = await request('PATCH', `/api/v1/branches/${branchA._id}`, {
    token: adminToken,
    body: { defaultWarehouseId: warehouseB._id },
  })
  assertStatus(foreignDefault, 400, 'edit rejects a warehouse from another branch')
  assert(foreignDefault.json.errors?.[0]?.field === 'defaultWarehouseId', 'foreign default warehouse field')

  const branchRegister = await request('GET', '/api/v1/branches?limit=100', { token: adminToken })
  assertStatus(branchRegister, 200, 'branch register')
  const branchRow = branchRegister.json.data.find((item) => item.code === 'ORG-A')
  assert(branchRow?.warehouseCount >= 1 && branchRow.shopCount >= 1, 'branch register includes child counts')
  assert(branchRow.address === undefined, 'branch register omits the operating address')
  assert(branchRegister.json.meta.summary?.warehouses?.total >= 1, 'branch register includes the card summary')

  await setBranchStatus(request, adminToken, branchB._id, 'inactive')
  const warehouseBStill = await request('GET', `/api/v1/warehouses/${warehouseB._id}`, { token: adminToken })
  assertStatus(warehouseBStill, 200, 'warehouse B survives inactive branch')
  assert(warehouseBStill.json.data.status === 'active', 'inactivating a branch leaves the warehouse active')

  const onInactive = await request('POST', '/api/v1/warehouses', {
    token: adminToken,
    body: { name: 'Blocked Warehouse', code: 'ORG-BLOCK', branchId: branchB._id, address: '1 Road' },
  })
  assertStatus(onInactive, 400, 'warehouse on an inactive branch')
  assert(onInactive.json.errors?.[0]?.field === 'branchId', 'inactive branch error points at branchId')
  await setBranchStatus(request, adminToken, branchB._id, 'active')

  await setBranchStatus(request, adminToken, branchA._id, 'inactive')
  const warehouseAStill = await request('GET', `/api/v1/warehouses/${warehouseA._id}`, { token: adminToken })
  const shopAStill = await request('GET', `/api/v1/shops/${shopA._id}`, { token: adminToken })
  assertStatus(warehouseAStill, 200, 'warehouse A still exists')
  assertStatus(shopAStill, 200, 'shop A still exists')
  assert(warehouseAStill.json.data.status === 'active' && shopAStill.json.data.status === 'active', 'children stay active')
  await setBranchStatus(request, adminToken, branchA._id, 'active')

  const unknownWarehouse = await request('POST', '/api/v1/warehouses', {
    token: adminToken,
    body: { name: 'Missing Branch', code: 'ORG-MISS', branchId: MISSING_ID, address: '1 Road' },
  })
  assertStatus(unknownWarehouse, 400, 'unknown branch on warehouse')
  assert(unknownWarehouse.json.errors?.[0]?.field === 'branchId', 'unknown branch field')

  const unknownShop = await request('POST', '/api/v1/shops', {
    token: adminToken,
    body: { name: 'Missing Shop Branch', code: 'ORG-SMISS', branchId: MISSING_ID, shopType: 'retail', address: '1 Road' },
  })
  assertStatus(unknownShop, 400, 'unknown branch on shop')

  const permissions = await request('GET', '/api/v1/permissions?limit=100', { token: adminToken })
  assertStatus(permissions, 200, 'list permissions')
  const needed = [
    'branch.read',
    'warehouse.read',
    'warehouse.create',
    'shop.read',
    'shop.create',
    'currency.read',
    'employee.read',
    'employee.create',
  ]
  const permissionIds = needed.map((code) => {
    const permission = permissions.json.data.find((item) => item.code === code)
    assert(permission, `${code} is seeded`)
    return permission._id
  })

  const roleListed = await request('GET', '/api/v1/roles?search=org_limited&limit=20', { token: adminToken })
  assertStatus(roleListed, 200, 'search limited role')
  let role = roleListed.json.data.find((item) => item.code === 'org_limited')
  if (!role) {
    const createdRole = await request('POST', '/api/v1/roles', {
      token: adminToken,
      body: { name: 'Org Limited', code: 'org_limited', permissionIds, status: 'active' },
    })
    assertStatus(createdRole, 201, 'create limited role')
    role = createdRole.json.data
  } else {
    const updatedRole = await request('PATCH', `/api/v1/roles/${role._id}`, {
      token: adminToken,
      body: { permissionIds, status: 'active' },
    })
    assertStatus(updatedRole, 200, 'reset limited role')
    role = updatedRole.json.data
  }

  const userBody = {
    name: 'Org Limited',
    email: LIMITED_EMAIL,
    password: LIMITED_PASSWORD,
    roleIds: [role._id],
    branchIds: [branchA._id],
    warehouseIds: [warehouseA._id],
    status: 'active',
  }
  const userListed = await request('GET', `/api/v1/users?search=${encodeURIComponent(LIMITED_EMAIL)}&limit=20`, {
    token: adminToken,
  })
  assertStatus(userListed, 200, 'search limited user')
  const existingUser = userListed.json.data.find((item) => item.email === LIMITED_EMAIL)
  if (!existingUser) {
    const createdUser = await request('POST', '/api/v1/users', { token: adminToken, body: userBody })
    assertStatus(createdUser, 201, 'create limited user')
  } else {
    const updatedUser = await request('PATCH', `/api/v1/users/${existingUser._id}`, {
      token: adminToken,
      body: userBody,
    })
    assertStatus(updatedUser, 200, 'reset limited user')
  }

  const badBranchUser = await request('POST', '/api/v1/users', {
    token: adminToken,
    body: {
      name: 'Bad Branch User',
      email: 'org.bad.branch@gulzar.local',
      password: 'BadBranch1',
      branchIds: [MISSING_ID],
    },
  })
  assertStatus(badBranchUser, 400, 'unknown branch on user')
  assert(badBranchUser.json.errors?.[0]?.field === 'branchIds', 'unknown branchIds field')

  const badWarehouseUser = await request('POST', '/api/v1/users', {
    token: adminToken,
    body: {
      name: 'Bad Warehouse User',
      email: 'org.bad.warehouse@gulzar.local',
      password: 'BadWarehouse1',
      warehouseIds: [MISSING_ID],
    },
  })
  assertStatus(badWarehouseUser, 400, 'unknown warehouse on user')

  const outsideWarehouse = await request('POST', '/api/v1/users', {
    token: adminToken,
    body: {
      name: 'Outside Warehouse',
      email: 'org.outside@gulzar.local',
      password: 'OutsidePass1',
      branchIds: [branchA._id],
      warehouseIds: [warehouseB._id],
    },
  })
  assertStatus(outsideWarehouse, 400, 'warehouse outside assigned branches')
  assert(outsideWarehouse.json.errors?.[0]?.field === 'warehouseIds', 'outside warehouse field')

  const limitedLogin = await request('POST', '/api/v1/auth/login', {
    body: { email: LIMITED_EMAIL, password: LIMITED_PASSWORD },
  })
  assertStatus(limitedLogin, 200, 'limited login')
  const limitedToken = limitedLogin.json.data.accessToken
  assert(!limitedLogin.json.data.user.permissionCodes.includes('all_branches'), 'limited user has no all_branches')

  const scopedBranches = await request('GET', '/api/v1/branches?limit=100', { token: limitedToken })
  assertStatus(scopedBranches, 200, 'scoped branches')
  assert(scopedBranches.json.data.some((item) => item._id === branchA._id), 'limited user sees branch A')
  assert(!scopedBranches.json.data.some((item) => item._id === branchB._id), 'limited user does not see branch B')

  const hiddenBranch = await request('GET', `/api/v1/branches/${branchB._id}`, { token: limitedToken })
  assertStatus(hiddenBranch, 404, 'branch B detail is hidden')

  const scopedWarehouses = await request('GET', '/api/v1/warehouses?limit=100', { token: limitedToken })
  assertStatus(scopedWarehouses, 200, 'scoped warehouses')
  assert(
    scopedWarehouses.json.data.every((item) => parentId(item.branchId) === String(branchA._id)),
    'limited user only sees warehouses of branch A',
  )
  assert(!scopedWarehouses.json.data.some((item) => item.code === 'ORG-WB'), 'warehouse B is hidden')

  const hiddenWarehouse = await request('GET', `/api/v1/warehouses/${warehouseB._id}`, { token: limitedToken })
  assertStatus(hiddenWarehouse, 404, 'warehouse B detail is hidden')

  const scopedShops = await request('GET', '/api/v1/shops?limit=100', { token: limitedToken })
  assertStatus(scopedShops, 200, 'scoped shops')
  assert(
    scopedShops.json.data.every((item) => parentId(item.branchId) === String(branchA._id)),
    'limited user only sees shops of branch A',
  )
  assert(!scopedShops.json.data.some((item) => item.code === 'ORG-SB'), 'shop B is hidden')

  const foreignWarehouse = await request('POST', '/api/v1/warehouses', {
    token: limitedToken,
    body: { name: 'Foreign Warehouse', code: 'ORG-FOREIGN', branchId: branchB._id, address: '1 Road' },
  })
  assertStatus(foreignWarehouse, 403, 'create warehouse on branch B')

  const formCode = `form-${Date.now().toString(36)}`
  const formBranch = await request('POST', '/api/v1/branches', {
    token: adminToken,
    body: {
      name: 'Central Branch',
      code: formCode,
      branchType: 'head_office',
      openingDate: '2026-01-01',
      address: '18 Commerce Avenue',
      location: 'City Center',
      phone: '+1 202 555 0148',
      email: 'Central@Gulzar.local',
      costCentre: 'CC-CEN',
      documentPrefix: 'cen',
      status: 'active',
      managerId: null,
      notes: 'Authorized workspace note',
    },
  })
  assertStatus(formBranch, 201, 'add branch form')
  assert(formBranch.json.data.branchType === 'head_office', 'branch type is stored')
  assert(formBranch.json.data.location === 'City Center', 'city is stored on location')
  assert(formBranch.json.data.address === '18 Commerce Avenue', 'operating address is stored')
  assert(formBranch.json.data.email === 'central@gulzar.local', 'branch email is stored lowercase')
  assert(formBranch.json.data.documentPrefix === 'CEN', 'document prefix is stored uppercase')
  assert(formBranch.json.data.notes === 'Authorized workspace note', 'internal notes are stored')
  assert(formBranch.json.data.managerId === null, 'manager stays empty until employees exist')
  assert(formBranch.json.data.defaultWarehouseId === null, 'new branch has no default warehouse')

  const missingType = await request('POST', '/api/v1/branches', {
    token: adminToken,
    body: { name: 'No Type', code: 'NO-TYPE', address: '1 Road' },
  })
  assertStatus(missingType, 400, 'branch type is required')

  const foreignCreate = await request('POST', '/api/v1/branches', {
    token: adminToken,
    body: {
      name: 'Default Miss',
      code: `def-${Date.now().toString(36)}`,
      branchType: 'retail',
      address: '1 Road',
      defaultWarehouseId: warehouseA._id,
    },
  })
  assertStatus(foreignCreate, 400, 'default warehouse must belong to the new branch')
  assert(foreignCreate.json.errors?.[0]?.field === 'defaultWarehouseId', 'default warehouse field')
  await Branch.deleteOne({ _id: formBranch.json.data._id })

  const codeInput = `cache-${Date.now().toString(36)}`
  const cacheBranch = await request('POST', '/api/v1/branches', {
    token: adminToken,
    body: { name: 'Cache Branch', code: codeInput, branchType: 'regional', address: '1 Cache Road', status: 'active' },
  })
  assertStatus(cacheBranch, 201, 'create cache branch')
  assert(cacheBranch.json.data.code === codeInput.toUpperCase(), 'branch code is stored uppercase')
  const cacheCode = cacheBranch.json.data.code

  const dropdown = '/api/v1/branches?status=active&page=1&limit=20'
  const firstList = await request('GET', dropdown, { token: adminToken })
  assertStatus(firstList, 200, 'first active branch list')
  const firstRow = firstList.json.data.find((item) => item.code === cacheCode)
  assert(firstRow?.name === 'Cache Branch', 'new branch is on the active dropdown')
  assert(firstRow.address === undefined, 'branch list omits address')

  await Branch.updateOne({ _id: cacheBranch.json.data._id }, { $set: { name: 'Stale Cache Name' } })
  const secondList = await request('GET', dropdown, { token: adminToken })
  assertStatus(secondList, 200, 'second active branch list')
  const secondRow = secondList.json.data.find((item) => item.code === cacheCode)
  assert(secondRow?.name === 'Cache Branch', 'second dropdown is served from cache')

  const refreshed = await request('PATCH', `/api/v1/branches/${cacheBranch.json.data._id}`, {
    token: adminToken,
    body: { name: 'Fresh Cache Name' },
  })
  assertStatus(refreshed, 200, 'update cache branch')
  const thirdList = await request('GET', dropdown, { token: adminToken })
  const thirdRow = thirdList.json.data.find((item) => item.code === cacheCode)
  assert(thirdRow?.name === 'Fresh Cache Name', 'dropdown refreshes after update')

  await Branch.deleteOne({ _id: cacheBranch.json.data._id })
  cache.delByPrefix('org:branches')

  async function ensureCurrency(body) {
    const code = body.code.toUpperCase()
    const listed = await request('GET', `/api/v1/currencies?search=${code}&limit=20`, { token: adminToken })
    assertStatus(listed, 200, `search currency ${code}`)
    const found = listed.json.data.find((item) => item.code === code)
    if (!found) {
      const created = await request('POST', '/api/v1/currencies', { token: adminToken, body })
      assertStatus(created, 201, `create currency ${code}`)
      return created.json.data
    }
    const updated = await request('PATCH', `/api/v1/currencies/${found._id}`, { token: adminToken, body })
    assertStatus(updated, 200, `reset currency ${code}`)
    return updated.json.data
  }

  const pkr = await ensureCurrency({
    name: 'Pakistani Rupee',
    code: 'pkr',
    symbol: 'Rs',
    decimalPlaces: 2,
    isBaseCurrency: true,
    status: 'active',
  })
  assert(pkr.code === 'PKR', 'currency code is stored uppercase')
  const usd = await ensureCurrency({
    name: 'US Dollar',
    code: 'usd',
    symbol: '$',
    decimalPlaces: 2,
    isBaseCurrency: true,
    status: 'active',
  })
  const pkrAfterUsd = await request('GET', `/api/v1/currencies/${pkr._id}`, { token: adminToken })
  assertStatus(pkrAfterUsd, 200, 'get PKR')
  assert(usd.isBaseCurrency === true, 'USD is the base currency')
  assert(pkrAfterUsd.json.data.isBaseCurrency === false, 'PKR is cleared when USD becomes base')

  const pkrBase = await request('PATCH', `/api/v1/currencies/${pkr._id}`, {
    token: adminToken,
    body: { isBaseCurrency: true },
  })
  assertStatus(pkrBase, 200, 'set PKR as base')
  const usdAfterPkr = await request('GET', `/api/v1/currencies/${usd._id}`, { token: adminToken })
  assertStatus(usdAfterPkr, 200, 'get USD')
  assert(pkrBase.json.data.isBaseCurrency === true, 'PKR is the base currency')
  assert(usdAfterPkr.json.data.isBaseCurrency === false, 'USD is cleared when PKR becomes base')

  const allCurrencies = await request('GET', '/api/v1/currencies?limit=100', { token: adminToken })
  assertStatus(allCurrencies, 200, 'list currencies')
  const baseRows = allCurrencies.json.data.filter((item) => item.isBaseCurrency)
  assert(baseRows.length === 1 && baseRows[0].code === 'PKR', 'only one base currency')

  const scopedCurrencies = await request('GET', '/api/v1/currencies?limit=100', { token: limitedToken })
  assertStatus(scopedCurrencies, 200, 'limited user lists currencies')
  assert(scopedCurrencies.json.data.some((item) => item.code === 'PKR'), 'currency list is not limited to a branch')
  assert(scopedCurrencies.json.data.some((item) => item.code === 'USD'), 'limited user still sees USD')

  const badPlaces = await request('POST', '/api/v1/currencies', {
    token: adminToken,
    body: { name: 'Bad Places', code: 'EUR', decimalPlaces: 7 },
  })
  assertStatus(badPlaces, 400, 'decimalPlaces above 6')
  const shortCode = await request('POST', '/api/v1/currencies', {
    token: adminToken,
    body: { name: 'Short', code: 'US' },
  })
  assertStatus(shortCode, 400, 'currency code must be 3 letters')

  const cacheCurrency = await ensureCurrency({
    name: 'Cache Currency',
    code: 'zzz',
    symbol: 'Z',
    decimalPlaces: 0,
    isBaseCurrency: false,
    status: 'active',
  })
  const currencyDropdown = '/api/v1/currencies?status=active&page=1&limit=20'
  const firstCurrencies = await request('GET', currencyDropdown, { token: adminToken })
  assertStatus(firstCurrencies, 200, 'first active currency list')
  assert(
    firstCurrencies.json.data.find((item) => item.code === 'ZZZ')?.name === 'Cache Currency',
    'ZZZ is on the active currency dropdown',
  )
  await Currency.updateOne({ _id: cacheCurrency._id }, { $set: { name: 'Stale Currency' } })
  const secondCurrencies = await request('GET', currencyDropdown, { token: adminToken })
  assert(
    secondCurrencies.json.data.find((item) => item.code === 'ZZZ')?.name === 'Cache Currency',
    'second currency dropdown is served from cache',
  )
  const freshCurrency = await request('PATCH', `/api/v1/currencies/${cacheCurrency._id}`, {
    token: adminToken,
    body: { name: 'Fresh Currency' },
  })
  assertStatus(freshCurrency, 200, 'update cache currency')
  const thirdCurrencies = await request('GET', currencyDropdown, { token: adminToken })
  assert(
    thirdCurrencies.json.data.find((item) => item.code === 'ZZZ')?.name === 'Fresh Currency',
    'currency dropdown refreshes after update',
  )
  const inactiveCurrency = await request('PATCH', `/api/v1/currencies/${cacheCurrency._id}/status`, {
    token: adminToken,
    body: { status: 'inactive' },
  })
  assertStatus(inactiveCurrency, 200, 'inactivate currency')
  assert(inactiveCurrency.json.data.status === 'inactive', 'currency status is inactive')
  const currencyStill = await request('GET', `/api/v1/currencies/${cacheCurrency._id}`, { token: adminToken })
  assertStatus(currencyStill, 200, 'inactive currency still exists')
  await Currency.deleteOne({ _id: cacheCurrency._id })
  cache.delByPrefix('org:currencies')

  const employeeCode = `emp-${Date.now().toString(36)}`
  const addedEmployee = await request('POST', '/api/v1/employees', {
    token: adminToken,
    body: {
      name: 'Org Employee A',
      code: employeeCode,
      email: 'Employee@Gulzar.local',
      phone: '+1 202 555 0148',
      department: 'Operations',
      jobTitle: 'Branch lead',
      employmentType: 'full_time',
      joiningDate: '2026-01-01',
      reportsTo: 'Nadia Saleh',
      branchId: branchA._id,
      shopAssignment: 'Org Shop A',
      warehouseAccess: 'Org Warehouse A',
      erpRole: 'branch_manager',
      createLogin: 'Invite by email',
      status: 'active',
      userId: null,
      notes: 'Add remarks for authorized workspace administrators',
      assignments: [
        { locationType: 'branch', locationId: branchA._id, scope: 'primary', accessRole: 'branch_manager', status: 'active' },
        { locationType: 'shop', locationId: shopA._id, scope: 'sales', accessRole: 'read_operate', status: 'active' },
        { locationType: 'warehouse', locationId: warehouseA._id, scope: 'stock', accessRole: 'read_only', status: 'active' },
      ],
    },
  })
  assertStatus(addedEmployee, 201, 'add employee')
  assert(addedEmployee.json.data.code === employeeCode.toUpperCase(), 'employee code is stored uppercase')
  assert(addedEmployee.json.data.email === 'employee@gulzar.local', 'work email is stored lowercase')
  assert(addedEmployee.json.data.phone === '+1 202 555 0148', 'employee phone is stored')
  assert(addedEmployee.json.data.jobTitle === 'Branch lead', 'job title is stored')
  assert(addedEmployee.json.data.employmentType === 'full_time', 'employment type is stored')
  assert(addedEmployee.json.data.employmentTypeLabel === 'Full-time', 'employment type label is returned')
  assert(String(addedEmployee.json.data.joiningDate).startsWith('2026-01-01'), 'joining date is stored')
  assert(addedEmployee.json.data.reportsTo === 'Nadia Saleh', 'reports to is stored')
  assert(addedEmployee.json.data.shopAssignment === 'Org Shop A', 'shop assignment is stored')
  assert(addedEmployee.json.data.warehouseAccess === 'Org Warehouse A', 'warehouse access is stored')
  assert(addedEmployee.json.data.erpRole === 'branch_manager', 'erp role is stored')
  assert(addedEmployee.json.data.erpRoleLabel === 'Branch Manager', 'erp role label is returned')
  assert(addedEmployee.json.data.createLogin === 'Invite by email', 'create login is stored')
  assert(addedEmployee.json.data.userId == null, 'create login does not create a user')
  assert(addedEmployee.json.data.loginStatusLabel === 'Invitation pending', 'login status label is invitation pending')
  assert(addedEmployee.json.data.branchId?.name === 'Org Branch A', 'detail includes the primary branch')
  assert(addedEmployee.json.data.notes === 'Add remarks for authorized workspace administrators', 'employee notes are stored')
  assert(addedEmployee.json.data.statusLabel === 'Active', 'employee status label is Active')
  assert(addedEmployee.json.data.loginStatus === 'pending', 'employee without a login is pending access')
  assert(addedEmployee.json.data.assignments.length === 3, 'location assignments are stored')
  assert(addedEmployee.json.data.assignments[0].locationName === 'Org Branch A', 'branch assignment includes the location name')
  assert(addedEmployee.json.data.assignments[0].locationTypeLabel === 'Branch', 'branch assignment type label')
  assert(addedEmployee.json.data.assignments[0].scopeLabel === 'Primary', 'primary scope label')
  assert(addedEmployee.json.data.assignments[0].accessRoleLabel === 'Branch Manager', 'branch manager role label')
  assert(addedEmployee.json.data.assignments[1].locationName === 'Org Shop A', 'shop assignment includes the shop name')
  assert(addedEmployee.json.data.assignments[1].accessRoleLabel === 'Read + operate', 'shop access role label')
  assert(addedEmployee.json.data.assignments[2].locationName === 'Org Warehouse A', 'warehouse assignment includes the warehouse name')
  assert(addedEmployee.json.data.assignments[2].scopeLabel === 'Stock', 'stock scope label')
  assert(addedEmployee.json.data.summary?.employees?.total >= 1, 'employee view includes the cards')
  assert(addedEmployee.json.data.summary.departments >= 1, 'employee view counts departments')
  assert(addedEmployee.json.data.summary.pendingAccess >= 1, 'employee view counts pending access')
  assert(typeof addedEmployee.json.data.createdAt === 'string', 'created on is createdAt')

  const missingEmail = await request('POST', '/api/v1/employees', {
    token: adminToken,
    body: {
      name: 'No Email',
      code: 'NO-EMP-EMAIL',
      department: 'Operations',
      jobTitle: 'Officer',
      employmentType: 'full_time',
      erpRole: 'staff',
      branchId: branchA._id,
    },
  })
  assertStatus(missingEmail, 400, 'work email is required')

  const employeeRegister = await request('GET', `/api/v1/employees?branchId=${branchA._id}&limit=100`, {
    token: adminToken,
  })
  assertStatus(employeeRegister, 200, 'employee register')
  const employeeRow = employeeRegister.json.data.find((item) => item.code === employeeCode.toUpperCase())
  assert(employeeRow?.name === 'Org Employee A', 'employee register includes the name')
  assert(employeeRow.department === 'Operations', 'employee register includes the department')
  assert(employeeRow.branchId?.code === 'ORG-A', 'employee register includes the primary branch')
  assert(employeeRow.status === 'active', 'employee register includes the status')
  assert(employeeRow.assignments === undefined, 'employee register omits location assignments')
  assert(employeeRow.email === undefined, 'employee register omits the work email')
  assert(employeeRegister.json.meta.summary?.employees?.total >= 1, 'employee cards count employees')
  assert(employeeRegister.json.meta.summary.employees.active >= 1, 'employee cards count active employees')
  assert(employeeRegister.json.meta.summary.departments >= 1, 'employee cards count departments')
  assert(employeeRegister.json.meta.summary.pendingAccess >= 1, 'employee cards count pending access')

  const editedEmployee = await request('PATCH', `/api/v1/employees/${addedEmployee.json.data._id}`, {
    token: adminToken,
    body: {
      name: 'Org Employee A',
      code: employeeCode,
      email: 'Omar@Example.com',
      phone: '',
      department: 'Operations',
      jobTitle: 'Branch Manager',
      employmentType: 'full_time',
      joiningDate: '2026-01-01',
      reportsTo: 'Amina Rahman',
      branchId: branchA._id,
      shopAssignment: 'Central Shop',
      warehouseAccess: 'Main + Reserve',
      erpRole: 'branch_manager',
      createLogin: 'Invite by email',
      status: 'active',
      notes: 'Add remarks for authorized workspace administrators',
    },
  })
  assertStatus(editedEmployee, 200, 'edit employee')
  assert(editedEmployee.json.data.email === 'omar@example.com', 'edit stores the work email lowercase')
  assert(editedEmployee.json.data.phone === '', 'edit stores an empty phone')
  assert(editedEmployee.json.data.jobTitle === 'Branch Manager', 'edit stores the job title')
  assert(editedEmployee.json.data.employmentTypeLabel === 'Full-time', 'edit returns the employment type label')
  assert(String(editedEmployee.json.data.joiningDate).startsWith('2026-01-01'), 'edit stores the joining date')
  assert(editedEmployee.json.data.reportsTo === 'Amina Rahman', 'edit stores reports to')
  assert(editedEmployee.json.data.shopAssignment === 'Central Shop', 'edit stores the shop assignment')
  assert(editedEmployee.json.data.warehouseAccess === 'Main + Reserve', 'edit stores warehouse access')
  assert(editedEmployee.json.data.erpRoleLabel === 'Branch Manager', 'edit returns the erp role label')
  assert(editedEmployee.json.data.createLogin === 'Invite by email', 'edit stores create login')
  assert(editedEmployee.json.data.loginStatusLabel === 'Invitation pending', 'edit leaves the login pending')
  assert(editedEmployee.json.data.userId == null, 'edit does not create a user')
  assert(editedEmployee.json.data.notes === 'Add remarks for authorized workspace administrators', 'edit stores the employee notes')
  assert(editedEmployee.json.data.code === employeeCode.toUpperCase(), 'edit stores the code uppercase')
  assert(parentId(editedEmployee.json.data.branchId) === String(branchA._id), 'edit keeps the primary branch')
  assert(editedEmployee.json.data.assignments.length === 3, 'edit keeps the location assignments')
  const keptEmployee = await request('PATCH', `/api/v1/employees/${addedEmployee.json.data._id}`, {
    token: adminToken,
    body: { name: 'Org Employee A' },
  })
  assertStatus(keptEmployee, 200, 'later edit keeps the employee')
  assert(keptEmployee.json.data.assignments.length === 3, 'assignments stay after a later edit')
  assert(keptEmployee.json.data.loginStatus === 'pending', 'later edit leaves the login pending')

  const otherBranchEmployee = await request('POST', '/api/v1/employees', {
    token: adminToken,
    body: {
      name: 'North Employee',
      code: `emp-b-${Date.now().toString(36)}`,
      email: `north-${Date.now().toString(36)}@gulzar.local`,
      department: 'Management',
      jobTitle: 'Manager',
      employmentType: 'full_time',
      erpRole: 'supervisor',
      branchId: branchB._id,
      status: 'active',
    },
  })
  assertStatus(otherBranchEmployee, 201, 'employee on branch B')

  const onLeave = await request('PATCH', `/api/v1/employees/${addedEmployee.json.data._id}/status`, {
    token: adminToken,
    body: { status: 'on_leave' },
  })
  assertStatus(onLeave, 200, 'set employee on leave')
  assert(onLeave.json.data.status === 'on_leave', 'employment status is on leave')
  assert(onLeave.json.data.statusLabel === 'On leave', 'on leave label is returned')
  assert(onLeave.json.data.loginStatus === 'pending', 'on leave leaves the login pending')
  assert(onLeave.json.data.assignments.length === 3, 'on leave keeps location assignments')
  const leaveList = await request('GET', '/api/v1/employees?status=on_leave&limit=100', { token: adminToken })
  assertStatus(leaveList, 200, 'filter employees on leave')
  assert(leaveList.json.data.some((item) => item.code === employeeCode.toUpperCase()), 'on leave filter includes the employee')
  assert(leaveList.json.data.every((item) => item.status === 'on_leave'), 'on leave filter returns on leave rows')
  assert(leaveList.json.meta.summary.employees.active >= 1, 'status filter leaves the active card in place')

  const pagedAssignments = await request(
    'GET',
    `/api/v1/employees/${addedEmployee.json.data._id}?page=1&limit=2`,
    { token: adminToken },
  )
  assertStatus(pagedAssignments, 200, 'paged location assignments')
  assert(pagedAssignments.json.data.assignments.length === 2, 'assignment page returns the limit')
  assert(pagedAssignments.json.data.assignmentsMeta?.total === 3, 'assignment table total stays 3')

  const missingLocation = await request('POST', '/api/v1/employees', {
    token: adminToken,
    body: {
      name: 'Missing Location',
      code: `emp-miss-${Date.now().toString(36)}`,
      email: `miss-${Date.now().toString(36)}@gulzar.local`,
      department: 'Operations',
      jobTitle: 'Officer',
      employmentType: 'contract',
      erpRole: 'staff',
      branchId: branchA._id,
      assignments: [
        { locationType: 'warehouse', locationId: MISSING_ID, scope: 'stock', accessRole: 'read_only' },
      ],
    },
  })
  assertStatus(missingLocation, 400, 'unknown assignment location')
  assert(missingLocation.json.errors?.[0]?.field === 'assignments.0.locationId', 'unknown location field')

  const scopedEmployees = await request('GET', '/api/v1/employees?limit=100', { token: limitedToken })
  assertStatus(scopedEmployees, 200, 'scoped employees')
  assert(
    scopedEmployees.json.data.every((item) => parentId(item.branchId) === String(branchA._id)),
    'limited user only sees employees of branch A',
  )
  const hiddenEmployee = await request('GET', `/api/v1/employees/${otherBranchEmployee.json.data._id}`, {
    token: limitedToken,
  })
  assertStatus(hiddenEmployee, 404, 'branch B employee is hidden')
  const foreignEmployee = await request('POST', '/api/v1/employees', {
    token: limitedToken,
    body: {
      name: 'Foreign Employee',
      code: `emp-foreign-${Date.now().toString(36)}`,
      email: `foreign-${Date.now().toString(36)}@gulzar.local`,
      department: 'Sales',
      jobTitle: 'Officer',
      employmentType: 'part_time',
      erpRole: 'staff',
      branchId: branchB._id,
    },
  })
  assertStatus(foreignEmployee, 403, 'create employee on branch B')
  const outsideAssignment = await request('POST', '/api/v1/employees', {
    token: limitedToken,
    body: {
      name: 'Outside Assignment',
      code: `emp-out-${Date.now().toString(36)}`,
      email: `out-${Date.now().toString(36)}@gulzar.local`,
      department: 'Warehouse',
      jobTitle: 'Officer',
      employmentType: 'temporary',
      erpRole: 'staff',
      branchId: branchA._id,
      assignments: [
        { locationType: 'warehouse', locationId: warehouseB._id, scope: 'stock', accessRole: 'read_only' },
      ],
    },
  })
  assertStatus(outsideAssignment, 400, 'assignment outside the caller branches')
  assert(outsideAssignment.json.errors?.[0]?.field === 'assignments.0.locationId', 'outside assignment field')

  await Employee.deleteOne({ _id: addedEmployee.json.data._id })
  await Employee.deleteOne({ _id: otherBranchEmployee.json.data._id })

  const specRes = await request('GET', '/openapi.json')
  assertStatus(specRes, 200, 'openapi')
  const requiredPaths = [
    '/api/v1/branches',
    '/api/v1/branches/{id}',
    '/api/v1/branches/{id}/status',
    '/api/v1/warehouses',
    '/api/v1/warehouses/{id}',
    '/api/v1/warehouses/{id}/status',
    '/api/v1/shops',
    '/api/v1/shops/{id}',
    '/api/v1/shops/{id}/status',
    '/api/v1/employees',
    '/api/v1/employees/{id}',
    '/api/v1/employees/{id}/status',
    '/api/v1/currencies',
    '/api/v1/currencies/{id}',
    '/api/v1/currencies/{id}/status',
  ]
  for (const path of requiredPaths) {
    assert(specRes.json.paths[path], `openapi missing ${path}`)
  }
  assert(specRes.json.paths['/api/v1/branches'].get.security[0].bearerAuth, 'branches require bearerAuth')

  console.log('organization checks passed')
} finally {
  if (server) await new Promise((resolve) => server.close(resolve))
  if (mongoose.connection.readyState !== 0) await mongoose.disconnect()
}
