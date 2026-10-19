import { assertFound } from '../../common/utils/assert.js'
import { pagination } from '../../common/utils/pagination.js'
import { listQuery } from '../../common/utils/listQuery.js'
import { pick } from '../../common/utils/pick.js'
import { rethrowDuplicate } from '../../common/utils/duplicateKey.js'
import { PROD_CACHE, clearOrgCache, readDropdown } from '../../common/utils/masterListCache.js'
import { QuantityUnit } from './quantityUnit.model.js'

const SORT_FIELDS = ['name', 'shortCode', 'status', 'createdAt']
const FIELDS = 'name shortCode decimalAllowed status createdAt updatedAt'
const WRITE_FIELDS = ['name', 'shortCode', 'decimalAllowed', 'status']

function clearUnitCache() {
  clearOrgCache(PROD_CACHE.units, PROD_CACHE.packing, PROD_CACHE.products)
}

async function loadUnit(id) {
  const unit = await QuantityUnit.findById(id).select(FIELDS).lean()
  return assertFound(unit, 'Quantity unit not found')
}

export async function list(query, user) {
  const page = pagination(query, SORT_FIELDS)
  const filter = listQuery(query, { searchFields: ['name', 'shortCode'] })

  return readDropdown(PROD_CACHE.units, user, query, async () => {
    const [items, total] = await Promise.all([
      QuantityUnit.find(filter).select(FIELDS).sort(page.sort).skip(page.skip).limit(page.limit).lean(),
      QuantityUnit.countDocuments(filter),
    ])
    return { items, meta: page.meta(total) }
  })
}

export async function getById(id) {
  return loadUnit(id)
}

export async function create(body) {
  try {
    const unit = await QuantityUnit.create({
      name: body.name,
      shortCode: body.shortCode,
      decimalAllowed: Boolean(body.decimalAllowed),
      status: body.status || 'active',
    })
    clearUnitCache()
    return loadUnit(unit._id)
  } catch (error) {
    rethrowDuplicate(error, 'shortCode', 'Short code already exists')
  }
}

export async function update(id, body) {
  const unit = assertFound(await QuantityUnit.findById(id), 'Quantity unit not found')
  unit.set(pick(body, WRITE_FIELDS))
  try {
    await unit.save()
  } catch (error) {
    rethrowDuplicate(error, 'shortCode', 'Short code already exists')
  }
  clearUnitCache()
  return loadUnit(unit._id)
}

export async function setStatus(id, status) {
  const unit = assertFound(await QuantityUnit.findById(id), 'Quantity unit not found')
  unit.status = status
  await unit.save()
  clearUnitCache()
  return loadUnit(unit._id)
}
