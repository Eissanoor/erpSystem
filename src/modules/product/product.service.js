import { ApiError } from '../../common/utils/ApiError.js'
import { assertFound } from '../../common/utils/assert.js'
import { pagination } from '../../common/utils/pagination.js'
import { listQuery } from '../../common/utils/listQuery.js'
import { pick } from '../../common/utils/pick.js'
import { money } from '../../common/utils/money.js'
import { PROD_CACHE, clearOrgCache, isDropdownList, readDropdown } from '../../common/utils/masterListCache.js'
import { ProductCategory } from '../productCategory/productCategory.model.js'
import { QuantityUnit } from '../quantityUnit/quantityUnit.model.js'
import { PackingUnit } from '../packingUnit/packingUnit.model.js'
import { assertActiveDoc, decimalText } from './refs.js'
import { Product } from './product.model.js'

const SORT_FIELDS = ['name', 'sku', 'createdAt']
const LIST_FIELDS = 'categoryId sku name barcode quantityUnitId packingUnitId costPrice salePrice reorderLevel trackBatch trackExpiry status createdAt updatedAt'
const DETAIL_FIELDS = `${LIST_FIELDS} description`
const WRITE_FIELDS = [
  'categoryId',
  'sku',
  'name',
  'barcode',
  'description',
  'quantityUnitId',
  'packingUnitId',
  'costPrice',
  'salePrice',
  'reorderLevel',
  'trackBatch',
  'trackExpiry',
  'status',
]
const POPULATE = [
  { path: 'categoryId', select: 'name code' },
  { path: 'quantityUnitId', select: 'name shortCode' },
  { path: 'packingUnitId', select: 'name shortCode' },
]

function clearProductCache() {
  clearOrgCache(PROD_CACHE.products)
}

function present(doc) {
  if (!doc) return doc
  return {
    ...doc,
    costPrice: decimalText(doc.costPrice),
    salePrice: decimalText(doc.salePrice),
    reorderLevel: decimalText(doc.reorderLevel),
  }
}

function rethrowProductDuplicate(error) {
  const source = error?.keyValue || error?.cause?.keyValue || {}
  const field = Object.keys(source)[0]
  if (error?.code === 11000 || error?.cause?.code === 11000) {
    if (field === 'barcode') {
      throw new ApiError(409, 'Barcode already exists', [{ field: 'barcode', message: 'Already in use' }])
    }
    throw new ApiError(409, 'SKU already exists', [{ field: 'sku', message: 'Already in use' }])
  }
  throw error
}

async function assertPackingMatch(packingUnitId, quantityUnitId) {
  const packing = await assertActiveDoc(PackingUnit, packingUnitId, 'packingUnitId', 'Packing unit')
  if (String(packing.quantityUnitId) !== String(quantityUnitId)) {
    throw new ApiError(400, 'Quantity unit mismatch', [
      { field: 'packingUnitId', message: 'Packing unit uses a different quantity unit' },
    ])
  }
}

async function assertRefs(body, current = {}) {
  if (body.categoryId) {
    await assertActiveDoc(ProductCategory, body.categoryId, 'categoryId', 'Category')
  }
  if (body.quantityUnitId) {
    await assertActiveDoc(QuantityUnit, body.quantityUnitId, 'quantityUnitId', 'Quantity unit')
  }

  const quantityUnitId = body.quantityUnitId ?? current.quantityUnitId
  const packingUnitId = body.packingUnitId === null ? null : (body.packingUnitId ?? current.packingUnitId)
  if (!packingUnitId) return

  if (body.packingUnitId) {
    await assertPackingMatch(packingUnitId, quantityUnitId)
    return
  }

  if (body.quantityUnitId) {
    const packing = await PackingUnit.findById(packingUnitId).select('quantityUnitId').lean()
    if (!packing || String(packing.quantityUnitId) !== String(quantityUnitId)) {
      throw new ApiError(400, 'Quantity unit mismatch', [
        { field: 'quantityUnitId', message: 'Packing unit uses a different quantity unit' },
      ])
    }
  }
}

async function loadProduct(id) {
  const product = await Product.findById(id).select(DETAIL_FIELDS).populate(POPULATE).lean()
  return present(assertFound(product, 'Product not found'))
}

async function queryProducts(filter, page) {
  const [items, total] = await Promise.all([
    Product.find(filter).select(LIST_FIELDS).populate(POPULATE).sort(page.sort).skip(page.skip).limit(page.limit).lean(),
    Product.countDocuments(filter),
  ])
  return { items: items.map(present), meta: page.meta(total) }
}

export async function list(query, user) {
  const page = pagination(query, SORT_FIELDS)
  const filter = listQuery(query, { searchFields: ['name', 'sku', 'barcode'] })
  if (query.categoryId) filter.categoryId = query.categoryId

  if (query.categoryId || !isDropdownList(query)) return queryProducts(filter, page)
  return readDropdown(PROD_CACHE.products, user, query, () => queryProducts(filter, page))
}

export async function getById(id) {
  return loadProduct(id)
}

export async function create(body) {
  await assertRefs(body)
  try {
    const product = await Product.create({
      categoryId: body.categoryId,
      sku: body.sku,
      name: body.name,
      barcode: body.barcode,
      description: body.description || '',
      quantityUnitId: body.quantityUnitId,
      packingUnitId: body.packingUnitId ?? null,
      costPrice: money.toDecimal(body.costPrice),
      salePrice: money.toDecimal(body.salePrice),
      reorderLevel: money.toDecimal(body.reorderLevel),
      trackBatch: Boolean(body.trackBatch),
      trackExpiry: Boolean(body.trackExpiry),
      status: body.status || 'active',
    })
    clearProductCache()
    return loadProduct(product._id)
  } catch (error) {
    rethrowProductDuplicate(error)
  }
}

export async function update(id, body) {
  const product = assertFound(await Product.findById(id), 'Product not found')
  await assertRefs(body, product)
  const changes = pick(body, WRITE_FIELDS)
  if (changes.costPrice != null) changes.costPrice = money.toDecimal(changes.costPrice)
  if (changes.salePrice != null) changes.salePrice = money.toDecimal(changes.salePrice)
  if (changes.reorderLevel != null) changes.reorderLevel = money.toDecimal(changes.reorderLevel)
  product.set(changes)
  try {
    await product.save()
  } catch (error) {
    rethrowProductDuplicate(error)
  }
  clearProductCache()
  return loadProduct(product._id)
}

export async function setStatus(id, status) {
  const product = assertFound(await Product.findById(id), 'Product not found')
  product.status = status
  await product.save()
  clearProductCache()
  return loadProduct(product._id)
}
