import { Decimal } from 'decimal.js'
import { ApiError } from '../../common/utils/ApiError.js'
import { assertFound } from '../../common/utils/assert.js'
import { pagination } from '../../common/utils/pagination.js'
import { listQuery } from '../../common/utils/listQuery.js'
import { money } from '../../common/utils/money.js'
import { pick } from '../../common/utils/pick.js'
import { rethrowDuplicate } from '../../common/utils/duplicateKey.js'
import {
  clearOrgCache,
  isDropdownList,
  ORG_CACHE,
  readDropdown,
} from '../../common/utils/masterListCache.js'
import { decimalText } from '../product/refs.js'
import { Currency } from '../currency/currency.model.js'
import { balancesByCustomer, customerOverview } from '../receivables/receivables.service.js'
import { CUSTOMER_STATUS_LABELS, PAYMENT_TERMS_LABELS } from './customer.constants.js'
import { Customer } from './customer.model.js'

const SORT_FIELDS = ['name', 'code', 'status', 'createdAt']
const WRITE_FIELDS = [
  'code',
  'name',
  'contactName',
  'phone',
  'email',
  'address',
  'currencyId',
  'paymentTerms',
  'receivableAccount',
  'status',
  'notes',
]
const POPULATE = [{ path: 'currencyId', select: 'name code symbol isBaseCurrency status' }]

function clearCustomerCache() {
  clearOrgCache(ORG_CACHE.customers)
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
  const receivables = balance || emptyBalance()
  const creditLimit = decimalText(doc.creditLimit) || '0'
  const outstanding = receivables.outstanding || '0'
  const availableCredit = Decimal.max(
    new Decimal(creditLimit).minus(outstanding),
    0,
  ).toFixed()

  return {
    _id: doc._id,
    code: doc.code,
    name: doc.name,
    contactName: doc.contactName || '',
    contact: doc.contactName || doc.email || doc.phone || '',
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
    creditLimit,
    availableCredit,
    paymentTerms: doc.paymentTerms,
    paymentTermsLabel: PAYMENT_TERMS_LABELS[doc.paymentTerms] || '',
    receivableAccount: doc.receivableAccount || '',
    receivableAccountId: doc.receivableAccountId || null,
    arApAccount: {
      ar: doc.receivableAccount || '',
      ap: '',
      label: `${doc.receivableAccount || '--'} / --`,
    },
    status: doc.status,
    statusLabel: CUSTOMER_STATUS_LABELS[doc.status] || '',
    notes: doc.notes || '',
    postsLedger: false,
    openingBalance: '0',
    outstanding,
    receivable: outstanding,
    payable: '0',
    receivables,
    balanceNote:
      'Receivable and payable accounts stay separate. A party can be both customer and supplier. Balances derive from posted ledger entries, not manual balance edits.',
    ledgerPath: `/api/v1/customer-receivables/customers/${doc._id}/ledger`,
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

async function loadCustomer(id, query = {}, user = null) {
  const doc = await Customer.findById(id).populate(POPULATE).lean()
  assertFound(doc, 'Customer not found')
  const base = present(doc)

  if (!user) return base

  const [overview, balances] = await Promise.all([
    customerOverview(id, query, user),
    balancesByCustomer(
      {
        branchId: query.branchId,
        currencyId: query.currencyId,
        asOf: query.asOf,
        customerIds: [id],
      },
      user,
    ),
  ])
  const balance = balances.byCustomer.get(String(id)) || emptyBalance()

  return {
    ...base,
    outstanding: overview.outstanding,
    receivable: overview.outstanding,
    availableCredit: overview.availableCredit,
    creditLimit: overview.creditLimit,
    receivables: {
      ...balance,
      unallocatedAdvance: overview.unallocatedAdvance,
    },
    receivablesActivity: {
      outstanding: overview.outstanding,
      current: overview.current,
      overdue: overview.overdue,
      creditLimit: overview.creditLimit,
      availableCredit: overview.availableCredit,
      unallocatedAdvance: overview.unallocatedAdvance,
      collectionAttention: overview.collectionAttention,
      outstandingInvoices: overview.outstandingInvoices,
      latestAllocation: overview.latestAllocation,
      followUp: overview.followUp,
      asOf: overview.asOf,
    },
  }
}

async function countSummary(filter) {
  const base = { ...filter }
  delete base.status
  const [total, active, inactive, creditCustomers] = await Promise.all([
    Customer.countDocuments(base),
    Customer.countDocuments({ ...base, status: 'active' }),
    Customer.countDocuments({ ...base, status: 'inactive' }),
    Customer.countDocuments({
      ...base,
      status: 'active',
      paymentTerms: { $ne: 'cash' },
    }),
  ])
  return { total, active, inactive, creditCustomers }
}

export async function list(query, user) {
  const page = pagination(query, SORT_FIELDS)
  const filter = listQuery(query, {
    searchFields: ['name', 'code', 'contactName', 'email', 'phone', 'receivableAccount'],
  })
  if (query.paymentTerms) filter.paymentTerms = query.paymentTerms
  if (query.currencyId) filter.currencyId = query.currencyId

  return readDropdown(ORG_CACHE.customers, user, query, async () => {
    const [items, total, counts] = await Promise.all([
      Customer.find(filter).populate(POPULATE).sort(page.sort).skip(page.skip).limit(page.limit).lean(),
      Customer.countDocuments(filter),
      countSummary(filter),
    ])

    if (isDropdownList(query)) {
      return {
        items: items.map((row) => present(row)),
        meta: page.meta(total),
      }
    }

    const balances = await balancesByCustomer(
      {
        branchId: query.branchId,
        currencyId: query.currencyId,
        asOf: query.asOf,
        customerIds: items.map((row) => row._id),
      },
      user,
    )

    const cardBalances = await balancesByCustomer(
      {
        branchId: query.branchId,
        currencyId: query.currencyId,
        asOf: query.asOf,
      },
      user,
    )

    let presented = items.map((row) =>
      present(row, balances.byCustomer.get(String(row._id)) || emptyBalance()),
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
          customers: counts.total,
          activeLabel: `${counts.active} active`,
          receivableBalance: cardBalances.summary.totalReceivable,
          inactiveParties: counts.inactive,
          ...cardBalances.summary,
          asOf: cardBalances.asOf,
        },
        totals: {
          receivable: pageOutstanding.toFixed(),
          outstanding: pageOutstanding.toFixed(),
          payable: '0',
          totalReceivable: cardBalances.summary.totalReceivable,
        },
      },
    }
  })
}

export async function getById(id, query = {}, user = null) {
  return loadCustomer(id, query, user)
}

export async function create(body) {
  await assertActiveCurrency(body.currencyId)
  const doc = new Customer({
    code: body.code,
    name: body.name,
    contactName: body.contactName || '',
    phone: body.phone || '',
    email: body.email || '',
    address: body.address || '',
    currencyId: body.currencyId,
    creditLimit: money.toDecimal(body.creditLimit ?? '0'),
    paymentTerms: body.paymentTerms,
    receivableAccount: body.receivableAccount,
    receivableAccountId: null,
    status: body.status || 'active',
    notes: body.notes || '',
  })
  try {
    await doc.save()
  } catch (error) {
    rethrowDuplicate(error, 'code', 'Customer code already exists')
  }
  clearCustomerCache()
  return loadCustomer(doc._id)
}

export async function update(id, body) {
  const doc = assertFound(await Customer.findById(id), 'Customer not found')
  if (body.currencyId) await assertActiveCurrency(body.currencyId)
  doc.set(pick(body, WRITE_FIELDS))
  if (body.creditLimit !== undefined) doc.creditLimit = money.toDecimal(body.creditLimit)
  doc.receivableAccountId = null
  try {
    await doc.save()
  } catch (error) {
    rethrowDuplicate(error, 'code', 'Customer code already exists')
  }
  clearCustomerCache()
  return loadCustomer(doc._id)
}

export async function setStatus(id, status) {
  const doc = assertFound(await Customer.findById(id), 'Customer not found')
  doc.status = status
  await doc.save()
  clearCustomerCache()
  return loadCustomer(doc._id)
}
