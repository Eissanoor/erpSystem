import { ApiError } from '../../common/utils/ApiError.js'
import { assertFound } from '../../common/utils/assert.js'
import { pagination } from '../../common/utils/pagination.js'
import { listQuery } from '../../common/utils/listQuery.js'
import { pick } from '../../common/utils/pick.js'
import { rethrowDuplicate } from '../../common/utils/duplicateKey.js'
import { cache } from '../../common/utils/cache.js'
import { MASTER_TTL_SECONDS, PROD_CACHE, clearOrgCache, isDropdownList } from '../../common/utils/masterListCache.js'
import { Product } from '../product/product.model.js'
import { ProductCategory } from './productCategory.model.js'

const SORT_FIELDS = ['name', 'code', 'status', 'createdAt']
const LIST_FIELDS = 'name code parentId description status createdAt updatedAt'
const DETAIL_FIELDS = 'name code parentId description status createdAt updatedAt'
const STATUS_LABELS = { active: 'Active', inactive: 'Inactive' }
const WRITE_FIELDS = ['name', 'code', 'parentId', 'description', 'status']
const TREE_KEY = `${PROD_CACHE.categories}:tree`

function clearCategoryCache() {
  clearOrgCache(PROD_CACHE.categories, PROD_CACHE.products)
}

async function assertParent(parentId, selfId) {
  if (parentId == null) return
  if (selfId && String(parentId) === String(selfId)) {
    throw new ApiError(400, 'Invalid parent', [
      { field: 'parentId', message: 'A category cannot be its own parent' },
    ])
  }

  const rows = await ProductCategory.find().select('_id parentId').lean()
  const parents = new Map(rows.map((row) => [String(row._id), row.parentId ? String(row.parentId) : null]))
  if (!parents.has(String(parentId))) {
    throw new ApiError(400, 'Unknown category', [
      { field: 'parentId', message: 'Parent category does not exist' },
    ])
  }

  const seen = new Set()
  let current = String(parentId)
  while (current) {
    if (selfId && current === String(selfId)) {
      throw new ApiError(400, 'Invalid parent', [
        { field: 'parentId', message: 'Parent would create a cycle' },
      ])
    }
    if (seen.has(current)) {
      throw new ApiError(400, 'Invalid parent', [
        { field: 'parentId', message: 'Parent would create a cycle' },
      ])
    }
    seen.add(current)
    current = parents.get(current) || null
  }
}

function buildTree(rows) {
  const nodes = new Map(rows.map((row) => [String(row._id), { ...row, children: [] }]))
  const roots = []
  for (const row of rows) {
    const node = nodes.get(String(row._id))
    const parentId = row.parentId ? String(row.parentId) : null
    if (parentId && nodes.has(parentId)) nodes.get(parentId).children.push(node)
    else roots.push(node)
  }
  return roots
}

function statusLabel(status) {
  return STATUS_LABELS[status] || ''
}

function treeOrder(rows) {
  const byParent = new Map()
  for (const row of rows) {
    const key = row.parentId ? String(row.parentId) : ''
    const list = byParent.get(key) || []
    list.push(row)
    byParent.set(key, list)
  }
  for (const list of byParent.values()) {
    list.sort((left, right) => left.name.localeCompare(right.name) || left.code.localeCompare(right.code))
  }
  const ordered = []
  const seen = new Set()
  const visit = (key) => {
    for (const row of byParent.get(key) || []) {
      const id = String(row._id)
      if (seen.has(id)) continue
      seen.add(id)
      ordered.push(row)
      visit(id)
    }
  }
  visit('')
  for (const key of [...byParent.keys()].filter((item) => item && !seen.has(item))) visit(key)
  return ordered
}

async function childCounts() {
  const rows = await ProductCategory.aggregate([
    { $match: { parentId: { $ne: null } } },
    { $group: { _id: '$parentId', count: { $sum: 1 } } },
  ])
  return new Map(rows.map((row) => [String(row._id), row.count]))
}

async function parentRefs(rows) {
  const ids = [...new Set(rows.map((row) => (row.parentId ? String(row.parentId) : '')).filter(Boolean))]
  if (!ids.length) return new Map()
  const parents = await ProductCategory.find({ _id: { $in: ids } }).select('name code').lean()
  return new Map(parents.map((parent) => [String(parent._id), parent]))
}

function presentRow(row, parents, counts) {
  const parent = row.parentId ? parents.get(String(row.parentId)) : null
  return {
    ...row,
    parentId: row.parentId || null,
    parent: parent ? { _id: parent._id, name: parent.name, code: parent.code } : null,
    description: row.description || '',
    statusLabel: statusLabel(row.status),
    childCount: counts.get(String(row._id)) || 0,
  }
}

async function figures() {
  const [total, active, inactive, topLevel, latest] = await Promise.all([
    ProductCategory.countDocuments(),
    ProductCategory.countDocuments({ status: 'active' }),
    ProductCategory.countDocuments({ status: 'inactive' }),
    ProductCategory.countDocuments({ parentId: null }),
    ProductCategory.findOne().sort({ updatedAt: -1 }).select('updatedAt').lean(),
  ])
  return {
    total,
    active,
    inactive,
    topLevel,
    withParent: total - topLevel,
    updatedAt: latest?.updatedAt || null,
  }
}

async function loadCategory(id) {
  const category = await ProductCategory.findById(id).select(DETAIL_FIELDS).lean()
  return assertFound(category, 'Category not found')
}

async function applyParentFilter(filter, parentId) {
  if (!parentId) return
  if (parentId === 'none') {
    filter.parentId = null
    return
  }
  const parent = await ProductCategory.findById(parentId).select('_id').lean()
  if (!parent) {
    throw new ApiError(400, 'Unknown category', [
      { field: 'parentId', message: 'Parent category does not exist' },
    ])
  }
  filter.parentId = parentId
}

export async function list(query) {
  const page = pagination(query, SORT_FIELDS)
  const filter = listQuery(query, { searchFields: ['name', 'code'] })
  await applyParentFilter(filter, query.parentId)
  const counts = await childCounts()
  let rows
  let total
  if (query.sort) {
    ;[rows, total] = await Promise.all([
      ProductCategory.find(filter).select(LIST_FIELDS).sort(page.sort).skip(page.skip).limit(page.limit).lean(),
      ProductCategory.countDocuments(filter),
    ])
  } else {
    const matched = await ProductCategory.find(filter).select(LIST_FIELDS).lean()
    const ordered = treeOrder(matched)
    total = ordered.length
    rows = ordered.slice(page.skip, page.skip + page.limit)
  }
  const parents = await parentRefs(rows)
  const result = { items: rows.map((row) => presentRow(row, parents, counts)), meta: page.meta(total) }
  if (isDropdownList(query) && !query.parentId) return result
  return { items: result.items, meta: { ...result.meta, summary: await figures() } }
}

export async function tree() {
  return cache.getOrSet(TREE_KEY, MASTER_TTL_SECONDS, async () => {
    const rows = await ProductCategory.find({ status: 'active' })
      .select('name code parentId status')
      .sort({ name: 1 })
      .lean()
    return buildTree(rows)
  })
}

async function breadcrumb(category) {
  const trail = []
  const seen = new Set()
  let current = category
  while (current) {
    const id = String(current._id)
    if (seen.has(id)) break
    seen.add(id)
    trail.push({ _id: current._id, name: current.name, code: current.code })
    if (!current.parentId) break
    current = await ProductCategory.findById(current.parentId).select('name code parentId').lean()
  }
  return trail.reverse()
}

function pageProducts(query) {
  const page = Math.max(1, Number(query?.page) || 1)
  const limit = Math.min(100, Math.max(1, Number(query?.limit) || 20))
  return { page, limit, skip: (page - 1) * limit }
}

export async function getById(id, query = {}) {
  const category = await loadCategory(id)
  const productPage = pageProducts(query)
  const trail = await breadcrumb(category)
  const [parentDoc, children, productCount, products] = await Promise.all([
    category.parentId
      ? ProductCategory.findById(category.parentId).select('name code').lean()
      : null,
    ProductCategory.find({ parentId: category._id }).select('name code status').sort({ name: 1 }).lean(),
    Product.countDocuments({ categoryId: category._id }),
    Product.find({ categoryId: category._id })
      .select('name sku quantityUnitId')
      .populate({ path: 'quantityUnitId', select: 'name shortCode' })
      .sort({ name: 1 })
      .skip(productPage.skip)
      .limit(productPage.limit)
      .lean(),
  ])
  return {
    ...category,
    parentId: category.parentId || null,
    parent: parentDoc ? { _id: parentDoc._id, name: parentDoc.name, code: parentDoc.code } : null,
    description: category.description || '',
    statusLabel: statusLabel(category.status),
    level: trail.length,
    breadcrumb: trail,
    childCount: children.length,
    children: children.map((child) => ({
      _id: child._id,
      name: child.name,
      code: child.code,
      status: child.status,
      statusLabel: statusLabel(child.status),
    })),
    productCount,
    products,
    productsMeta: { page: productPage.page, limit: productPage.limit, total: productCount },
  }
}

export async function create(body) {
  await assertParent(body.parentId, null)
  try {
    const category = await ProductCategory.create({
      name: body.name,
      code: body.code,
      parentId: body.parentId ?? null,
      description: body.description || '',
      status: body.status || 'active',
    })
    clearCategoryCache()
    return getById(category._id)
  } catch (error) {
    rethrowDuplicate(error, 'code', 'Category code already exists')
  }
}

export async function update(id, body) {
  const category = assertFound(await ProductCategory.findById(id), 'Category not found')
  if (Object.prototype.hasOwnProperty.call(body, 'parentId')) await assertParent(body.parentId, id)
  category.set(pick(body, WRITE_FIELDS))
  try {
    await category.save()
  } catch (error) {
    rethrowDuplicate(error, 'code', 'Category code already exists')
  }
  clearCategoryCache()
  return loadCategory(category._id)
}

export async function setStatus(id, status) {
  const category = assertFound(await ProductCategory.findById(id), 'Category not found')
  category.status = status
  await category.save()
  clearCategoryCache()
  return loadCategory(category._id)
}
