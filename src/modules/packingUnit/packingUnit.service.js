import { ApiError } from '../../common/utils/ApiError.js'
import { assertFound } from '../../common/utils/assert.js'
import { pagination } from '../../common/utils/pagination.js'
import { listQuery } from '../../common/utils/listQuery.js'
import { pick } from '../../common/utils/pick.js'
import { rethrowDuplicate } from '../../common/utils/duplicateKey.js'
import { money } from '../../common/utils/money.js'
import { PROD_CACHE, clearOrgCache, readDropdown } from '../../common/utils/masterListCache.js'
import { QuantityUnit } from '../quantityUnit/quantityUnit.model.js'
import { Product } from '../product/product.model.js'
import { assertActiveDoc, decimalText } from '../product/refs.js'
import { PackingUnit } from './packingUnit.model.js'

const SORT_FIELDS = ['name', 'shortCode', 'status', 'createdAt']
const LIST_FIELDS = 'name shortCode conversionQuantity quantityUnitId status createdAt updatedAt'
const WRITE_FIELDS = ['name', 'shortCode', 'conversionQuantity', 'quantityUnitId', 'status']
const POPULATE = { path: 'quantityUnitId', select: 'name shortCode' }

function clearPackingCache() {
  clearOrgCache(PROD_CACHE.packing, PROD_CACHE.products)
}

function present(doc) {
  if (!doc) return doc
  return { ...doc, conversionQuantity: decimalText(doc.conversionQuantity) }
}

async function loadPacking(id) {
  const packing = await PackingUnit.findById(id).select(LIST_FIELDS).populate(POPULATE).lean()
  return present(assertFound(packing, 'Packing unit not found'))
}

async function assertQuantityUnitChange(packingId, quantityUnitId) {
  const conflict = await Product.exists({
    packingUnitId: packingId,
    quantityUnitId: { $ne: quantityUnitId },
  })
  if (conflict) {
    throw new ApiError(400, 'Quantity unit mismatch', [
      {
        field: 'quantityUnitId',
        message: 'Products using this packing unit have a different quantity unit',
      },
    ])
  }
}

export async function list(query, user) {
  const page = pagination(query, SORT_FIELDS)
  const filter = listQuery(query, { searchFields: ['name', 'shortCode'] })
  if (query.quantityUnitId) filter.quantityUnitId = query.quantityUnitId

  const result = await readDropdown(PROD_CACHE.packing, user, query, async () => {
    const [items, total] = await Promise.all([
      PackingUnit.find(filter)
        .select(LIST_FIELDS)
        .populate(POPULATE)
        .sort(page.sort)
        .skip(page.skip)
        .limit(page.limit)
        .lean(),
      PackingUnit.countDocuments(filter),
    ])
    return { items: items.map(present), meta: page.meta(total) }
  }, query.quantityUnitId)

  return result
}

export async function getById(id) {
  return loadPacking(id)
}

export async function create(body) {
  await assertActiveDoc(QuantityUnit, body.quantityUnitId, 'quantityUnitId', 'Quantity unit')
  try {
    const packing = await PackingUnit.create({
      name: body.name,
      shortCode: body.shortCode,
      conversionQuantity: money.toDecimal(body.conversionQuantity),
      quantityUnitId: body.quantityUnitId,
      status: body.status || 'active',
    })
    clearPackingCache()
    return loadPacking(packing._id)
  } catch (error) {
    rethrowDuplicate(error, 'shortCode', 'Short code already exists')
  }
}

export async function update(id, body) {
  const packing = assertFound(await PackingUnit.findById(id), 'Packing unit not found')
  if (body.quantityUnitId && String(body.quantityUnitId) !== String(packing.quantityUnitId)) {
    await assertActiveDoc(QuantityUnit, body.quantityUnitId, 'quantityUnitId', 'Quantity unit')
    await assertQuantityUnitChange(packing._id, body.quantityUnitId)
  }
  const changes = pick(body, WRITE_FIELDS)
  if (changes.conversionQuantity != null) changes.conversionQuantity = money.toDecimal(changes.conversionQuantity)
  packing.set(changes)
  try {
    await packing.save()
  } catch (error) {
    rethrowDuplicate(error, 'shortCode', 'Short code already exists')
  }
  clearPackingCache()
  return loadPacking(packing._id)
}

export async function setStatus(id, status) {
  const packing = assertFound(await PackingUnit.findById(id), 'Packing unit not found')
  packing.status = status
  await packing.save()
  clearPackingCache()
  return loadPacking(packing._id)
}
