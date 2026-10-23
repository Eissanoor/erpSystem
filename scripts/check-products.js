import mongoose from 'mongoose'
import { env } from '../src/config/env.js'
import { connectDb } from '../src/config/db.js'
import { createApp } from '../src/app.js'
import { seedAuth } from '../src/seed/seedAuth.js'
import { Product } from '../src/modules/product/product.model.js'
import { ProductCategory } from '../src/modules/productCategory/productCategory.model.js'
import { Branch } from '../src/modules/branch/branch.model.js'
import { Warehouse } from '../src/modules/warehouse/warehouse.model.js'
import { StockBalance } from '../src/modules/inventory/stockBalance.model.js'

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
  assert(login.json.data.user.permissionCodes.includes('product.create'), 'admin can create products')
  const token = login.json.data.accessToken

  async function ensure(path, key, body) {
    const code = body[key].toUpperCase()
    const listed = await request('GET', `/api/v1/${path}?search=${encodeURIComponent(code)}&limit=20`, { token })
    assertStatus(listed, 200, `search ${path} ${code}`)
    const found = listed.json.data.find((item) => item[key] === code)
    if (!found) {
      const created = await request('POST', `/api/v1/${path}`, { token, body })
      assertStatus(created, 201, `create ${path} ${code}`)
      return created.json.data
    }
    const updated = await request('PATCH', `/api/v1/${path}/${found._id}`, { token, body })
    assertStatus(updated, 200, `reset ${path} ${code}`)
    return updated.json.data
  }

  const kg = await ensure('quantity-units', 'shortCode', {
    name: 'Kilogram',
    shortCode: 'kg',
    decimalAllowed: true,
    status: 'active',
  })
  const pcs = await ensure('quantity-units', 'shortCode', {
    name: 'Piece',
    shortCode: 'pcs',
    decimalAllowed: false,
    status: 'active',
  })
  assert(kg.shortCode === 'KG' && pcs.shortCode === 'PCS', 'short codes are stored uppercase')

  const carton = await ensure('packing-units', 'shortCode', {
    name: 'Carton',
    shortCode: 'ctn',
    conversionQuantity: '12',
    quantityUnitId: kg._id,
    status: 'active',
  })
  await ensure('packing-units', 'shortCode', {
    name: 'Box',
    shortCode: 'box',
    conversionQuantity: '6',
    quantityUnitId: pcs._id,
    status: 'active',
  })
  assert(typeof carton.conversionQuantity === 'string', 'conversion quantity is a string')

  const categoryA = await ensure('product-categories', 'code', {
    name: 'Check Category A',
    code: 'cat-a',
    parentId: null,
    description: 'Parent category',
    status: 'active',
  })
  const categoryB = await ensure('product-categories', 'code', {
    name: 'Check Category B',
    code: 'cat-b',
    parentId: categoryA._id,
    status: 'active',
  })
  assert(categoryA.code === 'CAT-A', 'category code is stored uppercase')

  const cycle = await request('PATCH', `/api/v1/product-categories/${categoryA._id}`, {
    token,
    body: { parentId: categoryB._id },
  })
  assertStatus(cycle, 400, 'category parent cycle')
  assert(cycle.json.errors?.[0]?.field === 'parentId', 'cycle error points at parentId')

  const selfParent = await request('PATCH', `/api/v1/product-categories/${categoryA._id}`, {
    token,
    body: { parentId: categoryA._id },
  })
  assertStatus(selfParent, 400, 'category cannot parent itself')

  const tree = await request('GET', '/api/v1/product-categories/tree', { token })
  assertStatus(tree, 200, 'category tree')
  const nodeA = tree.json.data.find((item) => item.code === 'CAT-A')
  assert(nodeA, 'tree includes category A')
  assert(nodeA.children.some((item) => item.code === 'CAT-B'), 'category B is nested under A')

  const categories = await request('GET', '/api/v1/product-categories?limit=100', { token })
  assertStatus(categories, 200, 'category register')
  const registerA = categories.json.data.find((item) => item.code === 'CAT-A')
  const registerB = categories.json.data.find((item) => item.code === 'CAT-B')
  assert(registerA && registerB, 'register includes both categories')
  assert(registerA.parent == null && registerA.childCount >= 1, 'top-level category has no parent')
  assert(registerB.parent?.code === 'CAT-A', 'child row names its parent')
  assert(registerB.description === '', 'register returns the description')
  assert(registerA.statusLabel === 'Active', 'register returns the status label')
  const categorySummary = categories.json.meta.summary
  assert(categorySummary.total >= 2 && categorySummary.active >= 1, 'category cards count the register')
  assert(categorySummary.topLevel + categorySummary.withParent === categorySummary.total, 'top-level and parented categories add up')
  assert(categorySummary.inactive + categorySummary.active === categorySummary.total, 'active and inactive categories add up')

  const categorySearch = await request('GET', '/api/v1/product-categories?search=CAT-B&limit=20', { token })
  assertStatus(categorySearch, 200, 'category search')
  assert(categorySearch.json.meta.summary.total === categorySummary.total, 'search leaves the category cards')
  assert(categorySearch.json.data.every((item) => item.code === 'CAT-B'), 'search matches the code')

  const topLevel = await request('GET', '/api/v1/product-categories?parentId=none&limit=100', { token })
  assertStatus(topLevel, 200, 'top-level categories')
  assert(topLevel.json.data.every((item) => item.parentId == null), 'parentId none returns top-level categories')
  assert(topLevel.json.meta.summary.topLevel === categorySummary.topLevel, 'parent filter leaves the top-level card')

  const childrenOfA = await request('GET', `/api/v1/product-categories?parentId=${categoryA._id}&limit=100`, { token })
  assertStatus(childrenOfA, 200, 'categories under a parent')
  assert(childrenOfA.json.data.some((item) => item.code === 'CAT-B'), 'parent filter returns the child')
  assert(childrenOfA.json.data.every((item) => String(item.parentId) === String(categoryA._id)), 'parent filter returns direct children')

  const categoryDropdown = await request('GET', '/api/v1/product-categories?status=active&page=1&limit=20', { token })
  assertStatus(categoryDropdown, 200, 'category dropdown')
  assert(categoryDropdown.json.meta.summary === undefined, 'category dropdown omits summary')

  const categoryDetail = await request('GET', `/api/v1/product-categories/${categoryB._id}?page=1&limit=20`, { token })
  assertStatus(categoryDetail, 200, 'category detail')
  assert(categoryDetail.json.data.parent?.name === 'Check Category A', 'detail names the parent category')
  assert(categoryDetail.json.data.breadcrumb.map((item) => item.code).join('/') === 'CAT-A/CAT-B', 'breadcrumb walks from the top')
  assert(categoryDetail.json.data.level === 2, 'a child category is level 2')
  assert(typeof categoryDetail.json.data.childCount === 'number', 'detail counts direct children')

  const parentDetail = await request('GET', `/api/v1/product-categories/${categoryA._id}?page=1&limit=100`, { token })
  assertStatus(parentDetail, 200, 'parent category detail')
  assert(parentDetail.json.data.level === 1, 'a top-level category is level 1')
  assert(parentDetail.json.data.children.some((item) => item.code === 'CAT-B' && item.statusLabel === 'Active'), 'detail lists child categories')
  assert(parentDetail.json.data.productCount >= 1, 'detail counts directly assigned products')
  const assigned = parentDetail.json.data.products.find((item) => item.sku === 'SKU-CHK')
  assert(assigned?.name === 'Check Product', 'detail lists the assigned product')
  assert(assigned.quantityUnitId.shortCode === 'KG', 'assigned product includes its unit')
  assert(parentDetail.json.data.productsMeta.total === parentDetail.json.data.productCount, 'product page total matches the assignment count')

  const teaStamp = Date.now().toString(36)
  const addedCategory = await request('POST', '/api/v1/product-categories', {
    token,
    body: {
      code: `cat-tea-${teaStamp}`,
      name: 'Tea',
      description: 'Loose-leaf tea, tea bags, and herbal infusions',
      parentId: categoryA._id,
      status: 'active',
    },
  })
  assertStatus(addedCategory, 201, 'add category')
  assert(addedCategory.json.data.code === `CAT-TEA-${teaStamp}`.toUpperCase(), 'add category stores the code uppercase')
  assert(addedCategory.json.data.name === 'Tea', 'add category stores the name')
  assert(addedCategory.json.data.description === 'Loose-leaf tea, tea bags, and herbal infusions', 'add category stores the description')
  assert(addedCategory.json.data.parent?.code === 'CAT-A', 'add category stores the parent')
  assert(addedCategory.json.data.level === 2, 'a child category is saved at level 2')
  assert(addedCategory.json.data.childCount === 0, 'a new category has no children')
  assert(addedCategory.json.data.statusLabel === 'Active', 'add category defaults to active')
  assert(addedCategory.json.data.productCount === 0, 'a new category has no products')

  const topCategory = await request('POST', '/api/v1/product-categories', {
    token,
    body: {
      code: `cat-top-${teaStamp}`,
      name: 'Top category',
      parentId: null,
    },
  })
  assertStatus(topCategory, 201, 'add top-level category')
  assert(topCategory.json.data.level === 1 && topCategory.json.data.parent == null, 'an empty parent is level 1')
  assert(topCategory.json.data.status === 'active' && topCategory.json.data.childCount === 0, 'status defaults to active')
  await ProductCategory.deleteMany({ _id: { $in: [addedCategory.json.data._id, topCategory.json.data._id] } })

  const missingParent = await request('GET', '/api/v1/product-categories?parentId=000000000000000000000000&limit=20', { token })
  assertStatus(missingParent, 400, 'unknown parent category')
  assert(missingParent.json.errors?.[0]?.field === 'parentId', 'unknown parent points at parentId')

  const product = await ensure('products', 'sku', {
    categoryId: categoryA._id,
    sku: 'sku-chk',
    name: 'Check Product',
    description: 'Hidden on the list',
    quantityUnitId: kg._id,
    packingUnitId: carton._id,
    costPrice: '12.50',
    salePrice: '20',
    reorderLevel: '0',
    status: 'active',
  })
  assert(product.sku === 'SKU-CHK', 'sku is stored uppercase')
  assert(typeof product.costPrice === 'string', 'cost price is a string')
  assert(typeof product.salePrice === 'string' && typeof product.reorderLevel === 'string', 'prices are strings')
  assert(product.description === 'Hidden on the list', 'detail keeps the description')
  assert(product.packingUnitId.conversionQuantity === '12', 'packing unit returns base units per pack')

  const addStamp = Date.now().toString(36).toUpperCase()
  const added = await request('POST', '/api/v1/products', {
    token,
    body: {
      categoryId: categoryA._id,
      sku: `bev-${addStamp}`,
      name: 'Arabica Coffee 1 kg',
      barcode: `6281101042118${addStamp}`,
      description: 'Whole-bean Arabica coffee in a sealed 1 kg bag',
      quantityUnitId: kg._id,
      packingUnitId: carton._id,
      costPrice: '1250.00',
      salePrice: '1850.00',
      reorderLevel: '40',
      trackBatch: false,
      trackExpiry: false,
      status: 'active',
    },
  })
  assertStatus(added, 201, 'add product')
  assert(added.json.data.sku === `BEV-${addStamp}`, 'add product stores the sku uppercase')
  assert(added.json.data.barcode === `6281101042118${addStamp}`, 'add product stores the barcode')
  assert(added.json.data.description === 'Whole-bean Arabica coffee in a sealed 1 kg bag', 'add product stores the description')
  assert(added.json.data.costPrice === '1250' || added.json.data.costPrice === '1250.00', 'add product stores the cost price')
  assert(added.json.data.salePrice === '1850' || added.json.data.salePrice === '1850.00', 'add product stores the sale price')
  assert(added.json.data.reorderLevel === '40', 'add product stores the reorder level')
  assert(added.json.data.trackBatch === false && added.json.data.trackExpiry === false, 'tracking stays off')
  assert(added.json.data.status === 'active', 'add product defaults to active')
  assert(added.json.data.packingUnitId.conversionQuantity === '12', 'add product returns base units per packing unit')
  assert(added.json.data.available === undefined, 'add product does not return a stock balance')
  assert((await StockBalance.countDocuments({ productId: added.json.data._id })) === 0, 'add product does not create stock')

  const baseOnly = await request('POST', '/api/v1/products', {
    token,
    body: {
      categoryId: categoryA._id,
      sku: `bev-base-${addStamp}`,
      name: 'Base unit only',
      quantityUnitId: kg._id,
      packingUnitId: null,
      costPrice: '1',
      salePrice: '2',
      reorderLevel: '0',
    },
  })
  assertStatus(baseOnly, 201, 'add product with the base unit only')
  assert(baseOnly.json.data.packingUnitId == null, 'empty packing unit stays empty')
  assert((await StockBalance.countDocuments({ productId: baseOnly.json.data._id })) === 0, 'base unit product has no stock')
  await Product.deleteMany({ _id: { $in: [added.json.data._id, baseOnly.json.data._id] } })

  const mismatch = await request('POST', '/api/v1/products', {
    token,
    body: {
      categoryId: categoryA._id,
      sku: 'SKU-BAD',
      name: 'Mismatched Product',
      quantityUnitId: pcs._id,
      packingUnitId: carton._id,
      costPrice: '1',
      salePrice: '2',
      reorderLevel: '0',
    },
  })
  assertStatus(mismatch, 400, 'packing unit quantity mismatch')
  assert(mismatch.json.errors?.[0]?.field === 'packingUnitId', 'mismatch points at packingUnitId')

  const duplicate = await request('POST', '/api/v1/products', {
    token,
    body: {
      categoryId: categoryA._id,
      sku: 'SKU-CHK',
      name: 'Duplicate Product',
      quantityUnitId: kg._id,
      costPrice: '1',
      salePrice: '2',
      reorderLevel: '0',
    },
  })
  assertStatus(duplicate, 409, 'duplicate sku')
  assert(duplicate.json.success === false, 'duplicate success flag')
  assert(Array.isArray(duplicate.json.errors), 'duplicate errors array')
  assert(duplicate.json.errors[0].field === 'sku', 'duplicate field is sku')

  await StockBalance.deleteMany({ productId: product._id })

  const listed = await request('GET', '/api/v1/products?search=SKU-CHK&limit=20', { token })
  assertStatus(listed, 200, 'product list')
  assert(listed.json.meta?.page === 1 && typeof listed.json.meta.total === 'number', 'product list is paginated')
  const row = listed.json.data.find((item) => item.sku === 'SKU-CHK')
  assert(row, 'list includes the check product')
  assert(row.description === undefined, 'product list omits description')
  assert(typeof row.costPrice === 'string', 'list price is a string')
  assert(row.available === '0' && row.reorderState === 'out_of_stock', 'catalog row includes stock state')
  assert(listed.json.meta.summary?.active?.total >= 1, 'catalog returns the active card')
  assert(listed.json.meta.summary.lowStockShare != null, 'catalog returns the low stock share')

  const dropdown = await request('GET', '/api/v1/products?status=active&page=1&limit=20', { token })
  assertStatus(dropdown, 200, 'product dropdown')
  assert(dropdown.json.meta.summary === undefined, 'product dropdown omits summary')
  assert(dropdown.json.data[0]?.available === undefined, 'product dropdown omits stock columns')

  const stamp = Date.now().toString(36)
  const branch = await request('POST', '/api/v1/branches', {
    token,
    body: {
      name: 'Product Check Branch',
      code: `pcb-${stamp}`,
      branchType: 'operating',
      address: 'City Center',
    },
  })
  assertStatus(branch, 201, 'catalog branch')
  const warehouse = await request('POST', '/api/v1/warehouses', {
    token,
    body: {
      branchId: branch.json.data._id,
      name: 'Main Warehouse',
      code: `pcw-${stamp}`,
      address: 'City Center',
    },
  })
  assertStatus(warehouse, 201, 'catalog warehouse')
  const warehouseId = warehouse.json.data._id

  const leveled = await request('PATCH', `/api/v1/products/${product._id}`, {
    token,
    body: { reorderLevel: '40' },
  })
  assertStatus(leveled, 200, 'set reorder level')
  await StockBalance.create({
    warehouseId,
    productId: product._id,
    quantity: mongoose.Types.Decimal128.fromString('24'),
    reservedQuantity: mongoose.Types.Decimal128.fromString('6'),
  })

  const catalog = await request('GET', `/api/v1/products?warehouseId=${warehouseId}&search=SKU-CHK&limit=20`, { token })
  assertStatus(catalog, 200, 'warehouse catalog')
  const stocked = catalog.json.data.find((item) => item.sku === 'SKU-CHK')
  assert(stocked.available === '18', 'available is on hand minus reserved')
  assert(stocked.reserved === '6', 'reserved is returned')
  assert(stocked.reorderState === 'critical' && stocked.reorderStateLabel === 'Critical', 'half the reorder level is critical')
  assert(catalog.json.meta.summary.inventoryValue === '300', 'inventory value is on hand times cost')
  assert(catalog.json.meta.summary.lowStock >= 1, 'critical stock counts as low stock')
  assert(typeof catalog.json.meta.summary.active.addedThisMonth === 'number', 'active card includes this month')
  assert(typeof catalog.json.meta.summary.inactive === 'number', 'inactive card is present')

  const openCatalog = await request('GET', `/api/v1/products?warehouseId=${warehouseId}&limit=20`, { token })
  assertStatus(openCatalog, 200, 'warehouse catalog page')
  assert(openCatalog.json.meta.summary.active.total === catalog.json.meta.summary.active.total, 'search leaves the active card')
  assert(openCatalog.json.meta.summary.inventoryValue === '300', 'search leaves the inventory value')
  assert(openCatalog.json.meta.summary.lowStock === catalog.json.meta.summary.lowStock, 'search leaves the low stock card')

  const statusFiltered = await request('GET', `/api/v1/products?warehouseId=${warehouseId}&status=inactive&limit=20`, {
    token,
  })
  assertStatus(statusFiltered, 200, 'catalog status filter')
  assert(statusFiltered.json.meta.summary.inactive === catalog.json.meta.summary.inactive, 'status filter leaves the inactive card')
  assert(statusFiltered.json.meta.summary.inventoryValue === '300', 'status filter leaves the inventory value')

  const missingWarehouse = await request('GET', '/api/v1/products?warehouseId=000000000000000000000000&limit=20', { token })
  assertStatus(missingWarehouse, 400, 'unknown warehouse')
  assert(missingWarehouse.json.errors?.[0]?.field === 'warehouseId', 'unknown warehouse points at warehouseId')

  await StockBalance.deleteMany({ warehouseId })
  await Warehouse.deleteOne({ _id: warehouseId })
  await Branch.deleteOne({ _id: branch.json.data._id })
  await request('PATCH', `/api/v1/products/${product._id}`, { token, body: { reorderLevel: '0' } })

  const inactiveCategory = await request('PATCH', `/api/v1/product-categories/${categoryA._id}/status`, {
    token,
    body: { status: 'inactive' },
  })
  assertStatus(inactiveCategory, 200, 'inactivate category')
  const productStill = await request('GET', `/api/v1/products/${product._id}`, { token })
  assertStatus(productStill, 200, 'product remains after category inactivation')
  const reactivate = await request('PATCH', `/api/v1/product-categories/${categoryA._id}/status`, {
    token,
    body: { status: 'active' },
  })
  assertStatus(reactivate, 200, 'reactivate category')

  const blankStamp = Date.now().toString(36).toUpperCase()
  const blankSkus = [`E${blankStamp}A`, `E${blankStamp}B`]
  for (const sku of blankSkus) {
    const created = await request('POST', '/api/v1/products', {
      token,
      body: {
        categoryId: categoryA._id,
        sku,
        name: 'No barcode',
        quantityUnitId: pcs._id,
        costPrice: '0',
        salePrice: '0',
        reorderLevel: '0',
      },
    })
    assertStatus(created, 201, `create ${sku} without barcode`)
  }
  await Product.deleteMany({ sku: { $in: blankSkus } })

  const specRes = await request('GET', '/openapi.json')
  assertStatus(specRes, 200, 'openapi')
  const spec = specRes.json
  assert(spec.paths['/api/v1/product-categories/tree'], 'openapi documents the category tree')
  for (const field of ['costPrice', 'salePrice', 'reorderLevel']) {
    assert(spec.components.schemas.Product.properties[field].type === 'string', `${field} is documented as a string`)
    assert(spec.components.schemas.ProductWrite.properties[field].type === 'string', `${field} write is a string`)
  }
  assert(spec.components.schemas.ProductRegisterSummary, 'openapi documents the product cards')
  assert(spec.components.schemas.Product.properties.reorderState.enum.includes('out_of_stock'), 'reorder state is documented')
  assert(
    spec.components.schemas.PackingUnit.properties.conversionQuantity.type === 'string',
    'conversion quantity is documented as a string',
  )

  console.log('product checks passed')
} finally {
  if (server) await new Promise((resolve) => server.close(resolve))
  if (mongoose.connection.readyState !== 0) await mongoose.disconnect()
}
