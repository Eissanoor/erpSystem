import { cache } from './cache.js'

export const MASTER_TTL_SECONDS = 10 * 60

export const ORG_CACHE = {
  branches: 'org:branches',
  warehouses: 'org:warehouses',
  shops: 'org:shops',
  currencies: 'org:currencies',
}

export function isDropdownList(query) {
  return (
    Number(query.page) === 1 &&
    Number(query.limit) === 20 &&
    !String(query.search || '').trim() &&
    !query.sort &&
    query.status === 'active'
  )
}

function scopeKey(user) {
  if (user?.permissionCodes?.includes('all_branches')) return 'all'
  return [...(user?.branchIds || [])].map(String).sort().join(',')
}

export function readDropdown(prefix, user, query, loader) {
  if (!isDropdownList(query)) return loader()
  const parent = query.branchId ? String(query.branchId) : 'any'
  const key = `${prefix}:dropdown:${scopeKey(user)}:${parent}`
  return cache.getOrSet(key, MASTER_TTL_SECONDS, loader)
}

export function clearOrgCache(...prefixes) {
  for (const prefix of prefixes) cache.delByPrefix(prefix)
}
