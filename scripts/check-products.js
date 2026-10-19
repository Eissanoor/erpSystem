import mongoose from 'mongoose'
import { env } from '../src/config/env.js'
import { connectDb } from '../src/config/db.js'
import { createApp } from '../src/app.js'
import { seedAuth } from '../src/seed/seedAuth.js'
import { Product } from '../src/modules/product/product.model.js'

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

  const listed = await request('GET', '/api/v1/products?search=SKU-CHK&limit=20', { token })
  assertStatus(listed, 200, 'product list')
  assert(listed.json.meta?.page === 1 && typeof listed.json.meta.total === 'number', 'product list is paginated')
  const row = listed.json.data.find((item) => item.sku === 'SKU-CHK')
  assert(row, 'list includes the check product')
  assert(row.description === undefined, 'product list omits description')
  assert(typeof row.costPrice === 'string', 'list price is a string')

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

  const stamp = Date.now().toString(36).toUpperCase()
  const blankSkus = [`E${stamp}A`, `E${stamp}B`]
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
  assert(
    spec.components.schemas.PackingUnit.properties.conversionQuantity.type === 'string',
    'conversion quantity is documented as a string',
  )

  console.log('product checks passed')
} finally {
  if (server) await new Promise((resolve) => server.close(resolve))
  if (mongoose.connection.readyState !== 0) await mongoose.disconnect()
}
