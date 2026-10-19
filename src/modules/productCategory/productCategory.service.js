import { ApiError } from '../../common/utils/ApiError.js'
import { assertFound } from '../../common/utils/assert.js'
import { pagination } from '../../common/utils/pagination.js'
import { listQuery } from '../../common/utils/listQuery.js'
import { pick } from '../../common/utils/pick.js'
import { rethrowDuplicate } from '../../common/utils/duplicateKey.js'
import { cache } from '../../common/utils/cache.js'
import { MASTER_TTL_SECONDS, PROD_CACHE, clearOrgCache } from '../../common/utils/masterListCache.js'
import { ProductCategory } from './productCategory.model.js'

const SORT_FIELDS = ['name', 'code', 'status', 'createdAt']
const LIST_FIELDS = 'name code parentId status createdAt updatedAt'
const DETAIL_FIELDS = 'name code parentId description status createdAt updatedAt'
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

async function loadCategory(id) {
  const category = await ProductCategory.findById(id).select(DETAIL_FIELDS).lean()
  return assertFound(category, 'Category not found')
}

export async function list(query) {
  const page = pagination(query, SORT_FIELDS)
  const filter = listQuery(query, { searchFields: ['name', 'code'] })
  const [items, total] = await Promise.all([
    ProductCategory.find(filter).select(LIST_FIELDS).sort(page.sort).skip(page.skip).limit(page.limit).lean(),
    ProductCategory.countDocuments(filter),
  ])
  return { items, meta: page.meta(total) }
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

export async function getById(id) {
  return loadCategory(id)
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
    return loadCategory(category._id)
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
