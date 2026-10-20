import { Decimal } from 'decimal.js'
import { ApiError } from '../../common/utils/ApiError.js'
import { assertFound } from '../../common/utils/assert.js'
import { pagination } from '../../common/utils/pagination.js'
import { listQuery } from '../../common/utils/listQuery.js'
import { pick } from '../../common/utils/pick.js'
import { money } from '../../common/utils/money.js'
import { scopeToBranches } from '../../common/utils/scopeToBranches.js'
import { isDropdownList } from '../../common/utils/masterListCache.js'
import { decimalText } from '../product/refs.js'
import { assertAssignableBranch } from '../branch/branch.service.js'
import { OWNER_STATUS_LABELS, OWNER_TYPE_LABELS } from './owner.constants.js'
import { Owner } from './owner.model.js'

const LIST_FIELDS = 'name code ownerType ownershipPercentage branchId status createdAt updatedAt'
const DETAIL_FIELDS =
  'name code ownerType identityNo email phone address countryOfRegistration branchId ownershipPercentage capitalCommitment effectiveDate capitalAccount capitalAccountId authorizedSignatory notes status interests createdAt updatedAt'
const WRITE_FIELDS = [
  'name',
  'code',
  'ownerType',
  'identityNo',
  'email',
  'phone',
  'address',
  'countryOfRegistration',
  'branchId',
  'capitalAccount',
  'authorizedSignatory',
  'notes',
  'status',
]
const SORT_FIELDS = ['name', 'code', 'ownerType', 'status', 'createdAt']
const POPULATE = { path: 'branchId', select: 'name code' }

function textAmount(value) {
  return new Decimal(decimalText(value) || '0')
}

function latestInterest(interests) {
  if (!interests?.length) return null
  return interests.reduce((latest, row) => {
    if (!latest) return row
    return new Date(row.effectiveDate) >= new Date(latest.effectiveDate) ? row : latest
  }, null)
}

function pageRows(rows, query = {}) {
  const total = rows.length
  if (!query?.page && !query?.limit) {
    return { items: rows, meta: { page: 1, limit: total, total } }
  }
  const page = Math.max(1, Number(query.page) || 1)
  const limit = Math.min(100, Math.max(1, Number(query.limit) || 20))
  const start = (page - 1) * limit
  return { items: rows.slice(start, start + limit), meta: { page, limit, total } }
}

function throwDuplicate(error) {
  if (error?.code === 11000 || error?.cause?.code === 11000) {
    throw new ApiError(409, 'Owner code already exists', [{ field: 'code', message: 'Already in use' }])
  }
  throw error
}

function mapInterest(row) {
  return {
    entity: row.entity || '',
    share: money.toDecimal(row.share),
    committed: money.toDecimal(row.committed || '0'),
    paidIn: money.toDecimal(row.paidIn || '0'),
    effectiveDate: row.effectiveDate,
  }
}

function openingInterest(body) {
  return mapInterest({
    entity: '',
    share: body.ownershipPercentage,
    committed: body.capitalCommitment || '0',
    paidIn: '0',
    effectiveDate: body.effectiveDate,
  })
}

function dayKey(value) {
  if (!value) return ''
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return ''
  return date.toISOString().slice(0, 10)
}

function rememberShare(doc, body) {
  if (Object.prototype.hasOwnProperty.call(body, 'interests')) return
  const shareChanged = Object.prototype.hasOwnProperty.call(body, 'ownershipPercentage')
  const commitmentChanged = Object.prototype.hasOwnProperty.call(body, 'capitalCommitment')
  const dateChanged = Object.prototype.hasOwnProperty.call(body, 'effectiveDate')
  if (!shareChanged && !commitmentChanged && !dateChanged) return
  const share = shareChanged ? body.ownershipPercentage : decimalText(doc.ownershipPercentage)
  const committed = commitmentChanged ? body.capitalCommitment || '0' : decimalText(doc.capitalCommitment)
  const effectiveDate = dateChanged ? body.effectiveDate : doc.effectiveDate
  if (!effectiveDate || share == null || share === '') return
  const latest = latestInterest(doc.interests)
  const unchanged =
    latest &&
    money.eq(latest.share, share) &&
    money.eq(latest.committed, committed || '0') &&
    dayKey(latest.effectiveDate) === dayKey(effectiveDate)
  if (unchanged) return
  doc.interests.push(
    mapInterest({
      entity: latest?.entity || '',
      share,
      committed: committed || '0',
      paidIn: latest ? decimalText(latest.paidIn) : '0',
      effectiveDate,
    }),
  )
}

function presentInterest(row) {
  return {
    _id: row._id,
    entity: row.entity,
    share: decimalText(row.share),
    committed: decimalText(row.committed),
    paidIn: decimalText(row.paidIn),
    effectiveDate: row.effectiveDate,
  }
}

function presentRow(row) {
  return {
    ...row,
    ownershipPercentage: decimalText(row.ownershipPercentage),
    ownerTypeLabel: OWNER_TYPE_LABELS[row.ownerType] || '',
    statusLabel: OWNER_STATUS_LABELS[row.status] || '',
  }
}

async function figures(user) {
  const filter = scopeToBranches({}, user)
  const [total, activeCount, owners] = await Promise.all([
    Owner.countDocuments(filter),
    Owner.countDocuments({ ...filter, status: 'active' }),
    Owner.find({ ...filter, status: 'active' }).select('ownershipPercentage interests').lean(),
  ])
  let share = new Decimal(0)
  let committed = new Decimal(0)
  let paidIn = new Decimal(0)
  for (const owner of owners) {
    share = share.plus(textAmount(owner.ownershipPercentage))
    const current = latestInterest(owner.interests)
    if (!current) continue
    committed = committed.plus(textAmount(current.committed))
    paidIn = paidIn.plus(textAmount(current.paidIn))
  }
  return {
    summary: {
      owners: { total, active: activeCount },
      ownershipAllocated: share.toFixed(),
      capitalPledged: committed.toFixed(),
    },
    allocation: {
      entity: 'Total allocated',
      share: share.toFixed(),
      committed: committed.toFixed(),
      paidIn: paidIn.toFixed(),
      effectiveDate: null,
      effectiveLabel: 'Current',
    },
  }
}

async function presentDetail(doc, user, query) {
  const { interests, ...rest } = doc
  const cards = await figures(user)
  const ordered = [...(interests || [])].sort(
    (left, right) => new Date(right.effectiveDate) - new Date(left.effectiveDate),
  )
  const interestPage = pageRows(ordered.map(presentInterest), query)
  return {
    ...presentRow(rest),
    capitalCommitment: decimalText(rest.capitalCommitment ?? '0'),
    summary: cards.summary,
    interests: interestPage.items,
    interestsMeta: interestPage.meta,
    allocation: cards.allocation,
  }
}

async function load(id) {
  const doc = await Owner.findById(id).select(DETAIL_FIELDS).populate(POPULATE).lean()
  return assertFound(doc, 'Owner not found')
}

export async function list(query, user) {
  const page = pagination(query, SORT_FIELDS)
  const filter = listQuery(query, { searchFields: ['name', 'code'] })
  if (query.branchId) filter.branchId = query.branchId
  const scoped = scopeToBranches(filter, user)
  const [items, total] = await Promise.all([
    Owner.find(scoped)
      .select(LIST_FIELDS)
      .populate(POPULATE)
      .sort(page.sort)
      .skip(page.skip)
      .limit(page.limit)
      .lean(),
    Owner.countDocuments(scoped),
  ])
  const result = { items: items.map(presentRow), meta: page.meta(total) }
  if (isDropdownList(query)) return result
  const cards = await figures(user)
  return { items: result.items, meta: { ...result.meta, summary: cards.summary } }
}

export async function getById(id, user, query) {
  const doc = await Owner.findOne(scopeToBranches({ _id: id }, user))
    .select(DETAIL_FIELDS)
    .populate(POPULATE)
    .lean()
  return presentDetail(assertFound(doc, 'Owner not found'), user, query)
}

export async function create(body, user) {
  await assertAssignableBranch(body.branchId, user)
  const interests = body.interests?.length ? body.interests.map(mapInterest) : [openingInterest(body)]
  const current = latestInterest(interests)
  try {
    const doc = await Owner.create({
      ...pick(body, WRITE_FIELDS),
      ownershipPercentage: money.toDecimal(body.ownershipPercentage),
      capitalCommitment: money.toDecimal(body.capitalCommitment || decimalText(current?.committed) || '0'),
      effectiveDate: body.effectiveDate,
      capitalAccountId: null,
      interests,
      status: body.status || 'active',
    })
    return presentDetail(await load(doc._id), user)
  } catch (error) {
    throwDuplicate(error)
  }
}

export async function update(id, body, user) {
  const doc = await Owner.findOne(scopeToBranches({ _id: id }, user))
  assertFound(doc, 'Owner not found')
  if (body.branchId && String(body.branchId) !== String(doc.branchId)) {
    await assertAssignableBranch(body.branchId, user)
  }
  rememberShare(doc, body)
  if (Object.prototype.hasOwnProperty.call(body, 'ownershipPercentage')) {
    doc.ownershipPercentage = money.toDecimal(body.ownershipPercentage)
  }
  if (Object.prototype.hasOwnProperty.call(body, 'capitalCommitment')) {
    doc.capitalCommitment = money.toDecimal(body.capitalCommitment || '0')
  }
  if (Object.prototype.hasOwnProperty.call(body, 'effectiveDate')) {
    doc.effectiveDate = body.effectiveDate
  }
  if (Object.prototype.hasOwnProperty.call(body, 'interests')) {
    doc.interests = body.interests.map(mapInterest)
  }
  doc.capitalAccountId = null
  doc.set(pick(body, WRITE_FIELDS))
  try {
    await doc.save()
  } catch (error) {
    throwDuplicate(error)
  }
  return presentDetail(await load(doc._id), user)
}

export async function setStatus(id, status, user) {
  const doc = await Owner.findOne(scopeToBranches({ _id: id }, user))
  assertFound(doc, 'Owner not found')
  doc.status = status
  await doc.save()
  return presentDetail(await load(doc._id), user)
}
