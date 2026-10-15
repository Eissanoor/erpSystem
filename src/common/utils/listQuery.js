function escapeRegex(value) {
  return String(value).trim().replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

export function listQuery(query, { searchFields = [] } = {}) {
  const filter = {}

  if (query.status) {
    filter.status = query.status
  }

  if (query.search && searchFields.length) {
    const term = escapeRegex(query.search)
    if (term) {
      filter.$or = searchFields.map((field) => ({
        [field]: { $regex: term, $options: 'i' },
      }))
    }
  }

  return filter
}
