import { assertFound } from '../../common/utils/assert.js'
import { pagination } from '../../common/utils/pagination.js'
import { listQuery } from '../../common/utils/listQuery.js'
import { pick } from '../../common/utils/pick.js'
import { rethrowDuplicate } from '../../common/utils/duplicateKey.js'
import { withTransaction } from '../../common/utils/withTransaction.js'
import { ORG_CACHE, clearOrgCache, readDropdown } from '../../common/utils/masterListCache.js'
import { Currency } from './currency.model.js'

const SORT_FIELDS = ['name', 'code', 'status', 'createdAt']
const FIELDS = 'name code symbol decimalPlaces isBaseCurrency status createdAt updatedAt'
const WRITE_FIELDS = ['name', 'code', 'symbol', 'decimalPlaces', 'isBaseCurrency', 'status']

function clearCurrencyCache() {
  clearOrgCache(ORG_CACHE.currencies)
}

async function loadCurrency(id) {
  const currency = await Currency.findById(id).select(FIELDS).lean()
  return assertFound(currency, 'Currency not found')
}

async function saveWithSingleBase(currency) {
  const becomingBase = currency.isBaseCurrency && (currency.isNew || currency.isModified('isBaseCurrency'))
  if (!becomingBase) {
    await currency.save()
    return
  }

  await withTransaction(async (session) => {
    await Currency.updateMany(
      { _id: { $ne: currency._id }, isBaseCurrency: true },
      { $set: { isBaseCurrency: false } },
      { session },
    )
    await currency.save({ session })
  })
}

export async function list(query, user) {
  const page = pagination(query, SORT_FIELDS)
  // Currency has no branch. Every reader with currency.read sees the same list.
  const filter = listQuery(query, { searchFields: ['name', 'code'] })

  return readDropdown(ORG_CACHE.currencies, user, query, async () => {
    const [items, total] = await Promise.all([
      Currency.find(filter).select(FIELDS).sort(page.sort).skip(page.skip).limit(page.limit).lean(),
      Currency.countDocuments(filter),
    ])
    return { items, meta: page.meta(total) }
  })
}

export async function getById(id) {
  return loadCurrency(id)
}

export async function create(body) {
  const currency = new Currency({
    name: body.name,
    code: body.code,
    symbol: body.symbol || '',
    decimalPlaces: body.decimalPlaces ?? 2,
    isBaseCurrency: Boolean(body.isBaseCurrency),
    status: body.status || 'active',
  })
  try {
    await saveWithSingleBase(currency)
  } catch (error) {
    rethrowDuplicate(error, 'code', 'Currency code already exists')
  }
  clearCurrencyCache()
  return loadCurrency(currency._id)
}

export async function update(id, body) {
  const currency = assertFound(await Currency.findById(id), 'Currency not found')
  currency.set(pick(body, WRITE_FIELDS))
  try {
    await saveWithSingleBase(currency)
  } catch (error) {
    rethrowDuplicate(error, 'code', 'Currency code already exists')
  }
  clearCurrencyCache()
  return loadCurrency(currency._id)
}

export async function setStatus(id, status) {
  const currency = assertFound(await Currency.findById(id), 'Currency not found')
  currency.status = status
  await currency.save()
  clearCurrencyCache()
  return loadCurrency(currency._id)
}
