import { Decimal } from 'decimal.js'
import { ApiError } from '../../common/utils/ApiError.js'
import { assertFound } from '../../common/utils/assert.js'
import { pagination } from '../../common/utils/pagination.js'
import { listQuery } from '../../common/utils/listQuery.js'
import { pick } from '../../common/utils/pick.js'
import { rethrowDuplicate } from '../../common/utils/duplicateKey.js'
import {
  clearOrgCache,
  isDropdownList,
  ORG_CACHE,
  readDropdown,
} from '../../common/utils/masterListCache.js'
import { Currency } from '../currency/currency.model.js'
import { balancesBySupplier, supplierOverview } from '../payables/payables.service.js'
import { PAYMENT_TERMS_LABELS, SUPPLIER_STATUS_LABELS } from './supplier.constants.js'
import { Supplier } from './supplier.model.js'

const SORT_FIELDS = ['name', 'code', 'status', 'createdAt']
const WRITE_FIELDS = [
  'code',
  'name',
  'phone',
  'email',
  'address',
  'currencyId',
  'paymentTerms',
  'payableAccount',
  'status',
  'notes',
]
const POPULATE = [{ path: 'currencyId', select: 'name code symbol isBaseCurrency status' }]

function clearSupplierCache() {
  clearOrgCache(ORG_CACHE.suppliers)
}

function emptyBalance() {
  return {
    outstanding: '0',
    current: '0',
    d1_30: '0',
    d31_60: '0',
    d61: '0',
    overdue: '0',
    overdueOver30: '0',
  }
}

function present(doc, balance = null) {
  const currency = doc.currencyId
  const payables = balance || emptyBalance()
  return {
    _id: doc._id,
    code: doc.code,
    name: doc.name,
    phone: doc.phone || '',
    email: doc.email || '',
    address: doc.address || '',
    currencyId: currency
      ? {
          _id: currency._id,
          name: currency.name,
          code: currency.code,
          symbol: currency.symbol || '',
          isBaseCurrency: Boolean(currency.isBaseCurrency),
        }
      : doc.currencyId,
    paymentTerms: doc.paymentTerms,
    paymentTermsLabel: PAYMENT_TERMS_LABELS[doc.paymentTerms] || '',
    payableAccount: doc.payableAccount || '',
    payableAccountId: doc.payableAccountId || null,
    status: doc.status,
    statusLabel: SUPPLIER_STATUS_LABELS[doc.status] || '',
    notes: doc.notes || '',
    postsLedger: false,
    openingBalance: '0',
    outstanding: payables.outstanding,
    payables,
    balanceNote: 'Payable balances come from posted entries.',
    createdAt: doc.createdAt,
    updatedAt: doc.updatedAt,
  }
}

async function assertActiveCurrency(currencyId) {
  const currency = await Currency.findById(currencyId).select('_id status code name').lean()
  if (!currency || currency.status !== 'active') {
    throw new ApiError(400, 'Inactive currency', [
      { field: 'currencyId', message: 'Currency must be active' },
    ])
  }
  return currency
}

async function loadSupplier(id, query = {}, user = null) {
  const doc = await Supplier.findById(id).populate(POPULATE).lean()
  assertFound(doc, 'Supplier not found')
  const base = present(doc)

  if (!user) return base

  const [overview, balances] = await Promise.all([
    supplierOverview(id, query, user),
    balancesBySupplier(
      {
        branchId: query.branchId,
        currencyId: query.currencyId,
        asOf: query.asOf,
        supplierIds: [id],
      },
      user,
    ),
  ])
  const balance = balances.bySupplier.get(String(id)) || emptyBalance()

  return {
    ...base,
    outstanding: overview.outstanding,
    payables: {
      ...balance,
      unallocatedAdvance: overview.unallocatedAdvance,
    },
    payablesActivity: {
      outstanding: overview.outstanding,
      current: overview.current,
      overdue: overview.overdue,
      unallocatedAdvance: overview.unallocatedAdvance,
      nextDue: overview.nextDue,
      purchaseLedger: overview.purchaseLedger,
      latestAllocation: overview.latestAllocation,
      followUp: overview.followUp,
      asOf: overview.asOf,
    },
  }
}

async function countSummary(filter) {
  const base = { ...filter }
  delete base.status
  const [total, active, inactive] = await Promise.all([
    Supplier.countDocuments(base),
    Supplier.countDocuments({ ...base, status: 'active' }),
    Supplier.countDocuments({ ...base, status: 'inactive' }),
  ])
  return { total, active, inactive }
}

export async function list(query, user) {
  const page = pagination(query, SORT_FIELDS)
  const filter = listQuery(query, { searchFields: ['name', 'code', 'email', 'phone', 'payableAccount'] })
  if (query.paymentTerms) filter.paymentTerms = query.paymentTerms
  if (query.currencyId) filter.currencyId = query.currencyId

  return readDropdown(ORG_CACHE.suppliers, user, query, async () => {
    const [items, total, counts] = await Promise.all([
      Supplier.find(filter).populate(POPULATE).sort(page.sort).skip(page.skip).limit(page.limit).lean(),
      Supplier.countDocuments(filter),
      countSummary(filter),
    ])

    if (isDropdownList(query)) {
      return {
        items: items.map((row) => present(row)),
        meta: page.meta(total),
      }
    }

    const balances = await balancesBySupplier(
      {
        branchId: query.branchId,
        currencyId: query.currencyId,
        asOf: query.asOf,
        supplierIds: items.map((row) => row._id),
      },
      user,
    )

    // Cards ignore table search/status filters — match aging register cards for the branch/currency
    const cardBalances = await balancesBySupplier(
      {
        branchId: query.branchId,
        currencyId: query.currencyId,
        asOf: query.asOf,
      },
      user,
    )

    let presented = items.map((row) =>
      present(row, balances.bySupplier.get(String(row._id)) || emptyBalance()),
    )

    if (query.sort === 'outstanding' || query.sort === '-outstanding') {
      const desc = String(query.sort).startsWith('-')
      presented = presented.sort((left, right) => {
        const delta = new Decimal(left.outstanding).minus(right.outstanding).toNumber()
        return desc ? -delta : delta
      })
    }

    const pageOutstanding = presented.reduce(
      (sum, row) => sum.plus(new Decimal(row.outstanding || '0')),
      new Decimal(0),
    )

    return {
      items: presented,
      meta: {
        ...page.meta(total),
        summary: {
          ...counts,
          ...cardBalances.summary,
          asOf: cardBalances.asOf,
        },
        totals: {
          outstanding: pageOutstanding.toFixed(),
          totalPayable: cardBalances.summary.totalPayable,
        },
      },
    }
  })
}

export async function getById(id, query = {}, user = null) {
  return loadSupplier(id, query, user)
}

export async function create(body) {
  await assertActiveCurrency(body.currencyId)
  const doc = new Supplier({
    code: body.code,
    name: body.name,
    phone: body.phone || '',
    email: body.email || '',
    address: body.address || '',
    currencyId: body.currencyId,
    paymentTerms: body.paymentTerms,
    payableAccount: body.payableAccount,
    payableAccountId: null,
    status: body.status || 'active',
    notes: body.notes || '',
  })
  try {
    await doc.save()
  } catch (error) {
    rethrowDuplicate(error, 'code', 'Supplier code already exists')
  }
  clearSupplierCache()
  return loadSupplier(doc._id)
}

export async function update(id, body) {
  const doc = assertFound(await Supplier.findById(id), 'Supplier not found')
  if (body.currencyId) await assertActiveCurrency(body.currencyId)
  doc.set(pick(body, WRITE_FIELDS))
  doc.payableAccountId = null
  try {
    await doc.save()
  } catch (error) {
    rethrowDuplicate(error, 'code', 'Supplier code already exists')
  }
  clearSupplierCache()
  return loadSupplier(doc._id)
}

export async function setStatus(id, status) {
  const doc = assertFound(await Supplier.findById(id), 'Supplier not found')
  doc.status = status
  await doc.save()
  clearSupplierCache()
  return loadSupplier(doc._id)
}
