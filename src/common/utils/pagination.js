import { ApiError } from './ApiError.js'

const DEFAULT_LIMIT = 20
const MAX_LIMIT = 100

export function pagination(query, allowedSort = ['createdAt']) {
  const page = Math.max(1, Number.parseInt(query.page, 10) || 1)
  let limit = Number.parseInt(query.limit, 10) || DEFAULT_LIMIT
  if (limit < 1) limit = DEFAULT_LIMIT
  if (limit > MAX_LIMIT) limit = MAX_LIMIT

  let sortField = 'createdAt'
  let direction = -1

  if (query.sort) {
    const raw = String(query.sort)
    const desc = raw.startsWith('-')
    const field = desc ? raw.slice(1) : raw
    if (!allowedSort.includes(field)) {
      throw new ApiError(400, 'Invalid sort field', [
        { field: 'sort', message: `Sort must be one of: ${allowedSort.join(', ')}` },
      ])
    }
    sortField = field
    direction = desc ? -1 : 1
  }

  return {
    page,
    limit,
    skip: (page - 1) * limit,
    sort: { [sortField]: direction },
    meta(total) {
      return { page, limit, total }
    },
  }
}
