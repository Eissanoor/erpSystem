import { assertFound } from '../../common/utils/assert.js'
import { pagination } from '../../common/utils/pagination.js'
import { listQuery } from '../../common/utils/listQuery.js'
import { pick } from '../../common/utils/pick.js'
import { rethrowDuplicate } from '../../common/utils/duplicateKey.js'
import { scopeToBranches } from '../../common/utils/scopeToBranches.js'
import { clearOrgCache, isDropdownList, readDropdown } from '../../common/utils/masterListCache.js'
import { assertAssignableBranch } from '../branch/branch.service.js'
import { childLocations, organizationSummary } from './register.js'

const SORT_FIELDS = ['name', 'code', 'status', 'createdAt']
const LIST_FIELDS = 'branchId name code location managerId status createdAt updatedAt'
const DETAIL_FIELDS = 'branchId name code location address managerId status createdAt updatedAt'
const WRITE_FIELDS = ['branchId', 'name', 'code', 'location', 'address', 'managerId', 'status']
const POPULATE = { path: 'branchId', select: 'name code location' }
const DETAIL_POPULATE = { path: 'branchId', select: 'name code phone location address' }

export function createChildLocationService({ Model, cachePrefix, notFound, duplicateMessage }) {
  async function load(id) {
    const doc = await Model.findById(id).select(DETAIL_FIELDS).populate(DETAIL_POPULATE).lean()
    return assertFound(doc, notFound)
  }

  async function present(doc, user) {
    const branchId = doc.branchId?._id || doc.branchId
    return { ...doc, locations: await childLocations(branchId, user) }
  }

  async function findInScope(id, user) {
    const filter = scopeToBranches({ _id: id }, user)
    const doc = await Model.findOne(filter)
    return assertFound(doc, notFound)
  }

  return {
    async list(query, user) {
      const page = pagination(query, SORT_FIELDS)
      const filter = listQuery(query, { searchFields: ['name', 'code', 'location'] })
      if (query.branchId) filter.branchId = query.branchId
      const scoped = scopeToBranches(filter, user)

      const result = await readDropdown(cachePrefix, user, query, async () => {
        const [items, total] = await Promise.all([
          Model.find(scoped)
            .select(LIST_FIELDS)
            .populate(POPULATE)
            .sort(page.sort)
            .skip(page.skip)
            .limit(page.limit)
            .lean(),
          Model.countDocuments(scoped),
        ])
        return { items, meta: page.meta(total) }
      })

      // Dropdown selects stay slim. The register carries the card counts.
      if (isDropdownList(query)) return result
      return { items: result.items, meta: { ...result.meta, summary: await organizationSummary(user) } }
    },

    async getById(id, user) {
      const filter = scopeToBranches({ _id: id }, user)
      const doc = await Model.findOne(filter).select(DETAIL_FIELDS).populate(DETAIL_POPULATE).lean()
      return present(assertFound(doc, notFound), user)
    },

    async create(body, user) {
      await assertAssignableBranch(body.branchId, user)
      try {
        const doc = await Model.create({
          branchId: body.branchId,
          name: body.name,
          code: body.code,
          location: body.location || '',
          address: body.address || '',
          managerId: null,
          status: body.status || 'active',
        })
        clearOrgCache(cachePrefix)
        return present(await load(doc._id), user)
      } catch (error) {
        rethrowDuplicate(error, 'code', duplicateMessage)
      }
    },

    async update(id, body, user) {
      const doc = await findInScope(id, user)
      if (body.branchId && String(body.branchId) !== String(doc.branchId)) {
        await assertAssignableBranch(body.branchId, user)
      }
      doc.set(pick(body, WRITE_FIELDS))
      try {
        await doc.save()
      } catch (error) {
        rethrowDuplicate(error, 'code', duplicateMessage)
      }
      clearOrgCache(cachePrefix)
      return present(await load(doc._id), user)
    },

    async setStatus(id, status, user) {
      const doc = await findInScope(id, user)
      doc.status = status
      await doc.save()
      clearOrgCache(cachePrefix)
      return present(await load(doc._id), user)
    },
  }
}
