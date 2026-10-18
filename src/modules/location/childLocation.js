import { assertFound } from '../../common/utils/assert.js'
import { pagination } from '../../common/utils/pagination.js'
import { listQuery } from '../../common/utils/listQuery.js'
import { pick } from '../../common/utils/pick.js'
import { rethrowDuplicate } from '../../common/utils/duplicateKey.js'
import { scopeToBranches } from '../../common/utils/scopeToBranches.js'
import { clearOrgCache, readDropdown } from '../../common/utils/masterListCache.js'
import { assertAssignableBranch } from '../branch/branch.service.js'

const SORT_FIELDS = ['name', 'code', 'status', 'createdAt']
const LIST_FIELDS = 'branchId name code status createdAt updatedAt'
const DETAIL_FIELDS = 'branchId name code address managerId status createdAt updatedAt'
const WRITE_FIELDS = ['branchId', 'name', 'code', 'address', 'managerId', 'status']
const POPULATE = { path: 'branchId', select: 'name code' }

export function createChildLocationService({ Model, cachePrefix, notFound, duplicateMessage }) {
  async function load(id) {
    const doc = await Model.findById(id).select(DETAIL_FIELDS).populate(POPULATE).lean()
    return assertFound(doc, notFound)
  }

  async function findInScope(id, user) {
    const filter = scopeToBranches({ _id: id }, user)
    const doc = await Model.findOne(filter)
    return assertFound(doc, notFound)
  }

  return {
    async list(query, user) {
      const page = pagination(query, SORT_FIELDS)
      const filter = listQuery(query, { searchFields: ['name', 'code'] })
      if (query.branchId) filter.branchId = query.branchId
      const scoped = scopeToBranches(filter, user)

      return readDropdown(cachePrefix, user, query, async () => {
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
    },

    async getById(id, user) {
      const filter = scopeToBranches({ _id: id }, user)
      const doc = await Model.findOne(filter).select(DETAIL_FIELDS).populate(POPULATE).lean()
      return assertFound(doc, notFound)
    },

    async create(body, user) {
      await assertAssignableBranch(body.branchId, user)
      try {
        const doc = await Model.create({
          branchId: body.branchId,
          name: body.name,
          code: body.code,
          address: body.address || '',
          managerId: null,
          status: body.status || 'active',
        })
        clearOrgCache(cachePrefix)
        return load(doc._id)
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
      return load(doc._id)
    },

    async setStatus(id, status, user) {
      const doc = await findInScope(id, user)
      doc.status = status
      await doc.save()
      clearOrgCache(cachePrefix)
      return load(doc._id)
    },
  }
}
