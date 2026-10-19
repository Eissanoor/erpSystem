import mongoose from 'mongoose'
import { env } from '../src/config/env.js'
import { connectDb } from '../src/config/db.js'
import { createApp } from '../src/app.js'
import { seedAuth } from '../src/seed/seedAuth.js'
import { cache } from '../src/common/utils/cache.js'
import { Branch } from '../src/modules/branch/branch.model.js'
import { Currency } from '../src/modules/currency/currency.model.js'

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

async function ensureChild(request, token, resource, { name, code, branchId }) {
  const listed = await request('GET', `/api/v1/${resource}?search=${encodeURIComponent(code)}&limit=20`, { token })
  assertStatus(listed, 200, `search ${resource} ${code}`)
  const found = listed.json.data.find((item) => item.code === code)
  if (!found) {
    const created = await request('POST', `/api/v1/${resource}`, {
      token,
      body: { name, code, branchId, status: 'active' },
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
  })
  const warehouseB = await ensureChild(request, adminToken, 'warehouses', {
    name: 'Org Warehouse B',
    code: 'ORG-WB',
    branchId: branchB._id,
  })
  const shopA = await ensureChild(request, adminToken, 'shops', {
    name: 'Org Shop A',
    code: 'ORG-SA',
    branchId: branchA._id,
  })
  await ensureChild(request, adminToken, 'shops', {
    name: 'Org Shop B',
    code: 'ORG-SB',
    branchId: branchB._id,
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
  assert(filtered.json.meta.summary?.warehouses?.total >= 2, 'warehouse page summary counts warehouses')
  assert(filtered.json.meta.summary.branches.total >= 2, 'warehouse page summary counts branches')
  assert(filtered.json.meta.summary.shops.branchCount >= 1, 'warehouse page summary counts shop branches')
  const warehouseRow = filtered.json.data.find((item) => item.code === 'ORG-WA')
  assert(!warehouseRow?.location, 'warehouse register includes location')
  assert(warehouseRow.managerId == null, 'warehouse register manager is unassigned')
  assert(!warehouseRow.branchId?.location, 'warehouse register includes the branch area')

  const warehousePage = await request('GET', `/api/v1/warehouses/${warehouseA._id}`, { token: adminToken })
  assertStatus(warehousePage, 200, 'warehouse page detail')
  assert(typeof warehousePage.json.data.address === 'string', 'warehouse detail keeps the operating address')
  assert(warehousePage.json.data.branchId?.code === 'ORG-A', 'warehouse detail includes the parent branch')
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
  assert(
    branchPage.json.data.locations[0]?.type === 'warehouse',
    'branch hierarchy lists warehouses before shops',
  )

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
    body: { name: 'Blocked Warehouse', code: 'ORG-BLOCK', branchId: branchB._id },
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
    body: { name: 'Missing Branch', code: 'ORG-MISS', branchId: MISSING_ID },
  })
  assertStatus(unknownWarehouse, 400, 'unknown branch on warehouse')
  assert(unknownWarehouse.json.errors?.[0]?.field === 'branchId', 'unknown branch field')

  const unknownShop = await request('POST', '/api/v1/shops', {
    token: adminToken,
    body: { name: 'Missing Shop Branch', code: 'ORG-SMISS', branchId: MISSING_ID },
  })
  assertStatus(unknownShop, 400, 'unknown branch on shop')

  const permissions = await request('GET', '/api/v1/permissions?limit=100', { token: adminToken })
  assertStatus(permissions, 200, 'list permissions')
  const needed = ['branch.read', 'warehouse.read', 'warehouse.create', 'shop.read', 'shop.create', 'currency.read']
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
    body: { name: 'Foreign Warehouse', code: 'ORG-FOREIGN', branchId: branchB._id },
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
      document: { type: 'Registration / lease', reference: 'REG-10012' },
      notes: 'Authorized workspace note',
    },
  })
  assertStatus(formBranch, 201, 'add branch form')
  assert(formBranch.json.data.branchType === 'head_office', 'branch type is stored')
  assert(formBranch.json.data.location === 'City Center', 'city is stored on location')
  assert(formBranch.json.data.address === '18 Commerce Avenue', 'operating address is stored')
  assert(formBranch.json.data.email === 'central@gulzar.local', 'branch email is stored lowercase')
  assert(formBranch.json.data.documentPrefix === 'CEN', 'document prefix is stored uppercase')
  assert(formBranch.json.data.document?.type === 'Registration / lease', 'document type is stored')
  assert(formBranch.json.data.document?.reference === 'REG-10012', 'document reference is stored')
  assert(formBranch.json.data.notes === 'Authorized workspace note', 'internal notes are stored')
  assert(formBranch.json.data.managerId === null, 'manager stays empty until employees exist')
  assert(formBranch.json.data.defaultWarehouseId === null, 'new branch has no default warehouse')

  const missingType = await request('POST', '/api/v1/branches', {
    token: adminToken,
    body: { name: 'No Type', code: 'NO-TYPE', address: '1 Road' },
  })
  assertStatus(missingType, 400, 'branch type is required')

  const foreignDefault = await request('POST', '/api/v1/branches', {
    token: adminToken,
    body: {
      name: 'Default Miss',
      code: `def-${Date.now().toString(36)}`,
      branchType: 'retail',
      address: '1 Road',
      defaultWarehouseId: warehouseA._id,
    },
  })
  assertStatus(foreignDefault, 400, 'default warehouse must belong to the new branch')
  assert(foreignDefault.json.errors?.[0]?.field === 'defaultWarehouseId', 'default warehouse field')
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
