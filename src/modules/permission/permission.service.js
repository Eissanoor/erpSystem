import { pagination } from '../../common/utils/pagination.js'
import { listQuery } from '../../common/utils/listQuery.js'
import { Permission } from './permission.model.js'

const SORT_FIELDS = ['module', 'code', 'action', 'createdAt']
const LIST_SELECT = 'module action code description status createdAt updatedAt'

export async function list(query) {
  const page = pagination(query, SORT_FIELDS)
  const filter = listQuery(query, { searchFields: ['code', 'module', 'description'] })
  const [items, total] = await Promise.all([
    Permission.find(filter).select(LIST_SELECT).sort(page.sort).skip(page.skip).limit(page.limit).lean(),
    Permission.countDocuments(filter),
  ])
  return { items, meta: page.meta(total) }
}
