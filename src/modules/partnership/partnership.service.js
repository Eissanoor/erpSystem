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
import { Owner } from '../owner/owner.model.js'
import { AGREEMENT_TYPE_LABELS, PARTNERSHIP_STATUS_LABELS } from './partnership.constants.js'
import { Partnership } from './partnership.model.js'

const LIST_FIELDS = 'name code agreementType effectiveDate startDate branchId status createdAt updatedAt'
const DETAIL_FIELDS =
  'name code agreementType effectiveDate startDate reviewDate capitalCommitment settlementFrequency branchId managingPartner partnerRoster profitAllocation lossAllocation approvalAuthority notes status partners createdAt updatedAt'
const WRITE_FIELDS = [
  'name',
  'code',
  'agreementType',
  'branchId',
  'managingPartner',
  'partnerRoster',
  'profitAllocation',
  'lossAllocation',
  'settlementFrequency',
  'approvalAuthority',
  'notes',
  'status',
]
const SORT_FIELDS = ['name', 'code', 'agreementType', 'effectiveDate', 'status', 'createdAt']
const POPULATE = { path: 'branchId', select: 'name code' }
const SHARE_COLUMNS = [
  ['ownership', 'Ownership'],
  ['profitShare', 'Profit share'],
  ['lossShare', 'Loss share'],
]

function textAmount(value) {
  return new Decimal(decimalText(value) || '0')
}

function inScope(user, branchId) {
  if (user?.permissionCodes?.includes('all_branches')) return true
  return (user?.branchIds || []).map(String).includes(String(branchId))
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
    throw new ApiError(409, 'Partnership code already exists', [{ field: 'code', message: 'Already in use' }])
  }
  throw error
}

function assertShareTotals(partners) {
  for (const [key, label] of SHARE_COLUMNS) {
    const total = partners.reduce((sum, row) => sum.plus(textAmount(row[key])), new Decimal(0))
    if (!total.eq(100)) {
      throw new ApiError(400, `${label} must total 100`, [
        { field: 'partners', message: `${label} must total 100` },
      ])
    }
  }
}

function mapPartner(row) {
  return {
    ownerId: row.ownerId,
    contribution: money.toDecimal(row.contribution),
    ownership: money.toDecimal(row.ownership),
    profitShare: money.toDecimal(row.profitShare),
    lossShare: money.toDecimal(row.lossShare),
  }
}

async function assertPartners(partners, user) {
  assertShareTotals(partners)
  const seen = new Set()
  partners.forEach((row, index) => {
    const id = String(row.ownerId)
    if (seen.has(id)) {
      throw new ApiError(400, 'Partner is listed twice', [
        { field: `partners.${index}.ownerId`, message: 'Each owner can be added once' },
      ])
    }
    seen.add(id)
  })
  const owners = await Owner.find({ _id: { $in: partners.map((row) => row.ownerId) } })
    .select('branchId')
    .lean()
  const byId = new Map(owners.map((row) => [String(row._id), row]))
  partners.forEach((row, index) => {
    const owner = byId.get(String(row.ownerId))
    if (!owner) {
      throw new ApiError(400, 'Unknown owner', [
        { field: `partners.${index}.ownerId`, message: 'Owner does not exist' },
      ])
    }
    if (!inScope(user, owner.branchId)) {
      throw new ApiError(400, 'Owner is outside your access', [
        { field: `partners.${index}.ownerId`, message: 'Owner is outside your branches' },
      ])
    }
  })
  return partners.map(mapPartner)
}

function presentRow(row) {
  const effectiveDate = row.effectiveDate || row.startDate
  return {
    ...row,
    effectiveDate,
    startDate: effectiveDate,
    agreementTypeLabel: AGREEMENT_TYPE_LABELS[row.agreementType] || '',
    statusLabel: PARTNERSHIP_STATUS_LABELS[row.status] || '',
  }
}

async function figures(user) {
  const filter = scopeToBranches({}, user)
  const [total, active, reviewDue, activeAgreements] = await Promise.all([
    Partnership.countDocuments(filter),
    Partnership.countDocuments({ ...filter, status: 'active' }),
    Partnership.countDocuments({ ...filter, status: 'draft' }),
    Partnership.find({ ...filter, status: 'active' }).select('partners').lean(),
  ])
  const activePartners = activeAgreements.reduce((count, row) => count + (row.partners?.length || 0), 0)
  return {
    agreements: { total, active },
    reviewDue,
    activePartners,
  }
}

async function presentPartners(partners, query) {
  const rows = partners || []
  const owners = await Owner.find({ _id: { $in: rows.map((row) => row.ownerId) } })
    .select('name')
    .lean()
  const names = new Map(owners.map((row) => [String(row._id), row.name]))
  const presented = rows.map((row) => ({
    _id: row._id,
    ownerId: row.ownerId,
    partnerName: names.get(String(row.ownerId)) || '',
    contribution: decimalText(row.contribution),
    ownership: decimalText(row.ownership),
    profitShare: decimalText(row.profitShare),
    lossShare: decimalText(row.lossShare),
  }))
  return pageRows(presented, query)
}

function allocationOf(partners) {
  const totals = { contribution: new Decimal(0), ownership: new Decimal(0), profitShare: new Decimal(0), lossShare: new Decimal(0) }
  for (const row of partners || []) {
    totals.contribution = totals.contribution.plus(textAmount(row.contribution))
    totals.ownership = totals.ownership.plus(textAmount(row.ownership))
    totals.profitShare = totals.profitShare.plus(textAmount(row.profitShare))
    totals.lossShare = totals.lossShare.plus(textAmount(row.lossShare))
  }
  return {
    partner: 'Total',
    contribution: totals.contribution.toFixed(),
    ownership: totals.ownership.toFixed(),
    profitShare: totals.profitShare.toFixed(),
    lossShare: totals.lossShare.toFixed(),
  }
}

async function presentDetail(doc, user, query) {
  const { partners, ...rest } = doc
  const [summary, partnerPage] = await Promise.all([figures(user), presentPartners(partners, query)])
  return {
    ...presentRow(rest),
    capitalCommitment: decimalText(rest.capitalCommitment ?? '0'),
    summary,
    partners: partnerPage.items,
    partnersMeta: partnerPage.meta,
    allocation: allocationOf(partners),
  }
}

async function load(id) {
  const doc = await Partnership.findById(id).select(DETAIL_FIELDS).populate(POPULATE).lean()
  return assertFound(doc, 'Partnership not found')
}

export async function list(query, user) {
  const page = pagination(query, SORT_FIELDS)
  const filter = listQuery(query, { searchFields: ['name', 'code'] })
  if (query.branchId) filter.branchId = query.branchId
  const scoped = scopeToBranches(filter, user)
  const [items, total] = await Promise.all([
    Partnership.find(scoped)
      .select(LIST_FIELDS)
      .populate(POPULATE)
      .sort(page.sort)
      .skip(page.skip)
      .limit(page.limit)
      .lean(),
    Partnership.countDocuments(scoped),
  ])
  const result = { items: items.map(presentRow), meta: page.meta(total) }
  if (isDropdownList(query)) return result
  return { items: result.items, meta: { ...result.meta, summary: await figures(user) } }
}

export async function getById(id, user, query) {
  const doc = await Partnership.findOne(scopeToBranches({ _id: id }, user))
    .select(DETAIL_FIELDS)
    .populate(POPULATE)
    .lean()
  return presentDetail(assertFound(doc, 'Partnership not found'), user, query)
}

export async function create(body, user) {
  await assertAssignableBranch(body.branchId, user)
  const partners = await assertPartners(body.partners, user)
  try {
    const effectiveDate = body.effectiveDate
    const doc = await Partnership.create({
      ...pick(body, WRITE_FIELDS),
      effectiveDate,
      startDate: effectiveDate,
      reviewDate: body.reviewDate || null,
      capitalCommitment: money.toDecimal(body.capitalCommitment || '0'),
      partners,
      status: body.status || 'active',
    })
    return presentDetail(await load(doc._id), user)
  } catch (error) {
    throwDuplicate(error)
  }
}

export async function update(id, body, user) {
  const doc = await Partnership.findOne(scopeToBranches({ _id: id }, user))
  assertFound(doc, 'Partnership not found')
  if (body.branchId && String(body.branchId) !== String(doc.branchId)) {
    await assertAssignableBranch(body.branchId, user)
  }
  if (Object.prototype.hasOwnProperty.call(body, 'effectiveDate')) {
    doc.effectiveDate = body.effectiveDate
    doc.startDate = body.effectiveDate
  }
  if (Object.prototype.hasOwnProperty.call(body, 'reviewDate')) {
    doc.reviewDate = body.reviewDate || null
  }
  if (Object.prototype.hasOwnProperty.call(body, 'capitalCommitment')) {
    doc.capitalCommitment = money.toDecimal(body.capitalCommitment || '0')
  }
  if (Object.prototype.hasOwnProperty.call(body, 'partners')) {
    doc.partners = await assertPartners(body.partners, user)
  }
  doc.set(pick(body, WRITE_FIELDS))
  try {
    await doc.save()
  } catch (error) {
    throwDuplicate(error)
  }
  return presentDetail(await load(doc._id), user)
}

export async function setStatus(id, status, user) {
  const doc = await Partnership.findOne(scopeToBranches({ _id: id }, user))
  assertFound(doc, 'Partnership not found')
  if (status === 'active') assertShareTotals(doc.partners)
  doc.status = status
  await doc.save()
  return presentDetail(await load(doc._id), user)
}
