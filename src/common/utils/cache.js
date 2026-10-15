const store = new Map()
const inflight = new Map()

function readFresh(key) {
  const entry = store.get(key)
  if (!entry) return undefined
  if (entry.expiresAt <= Date.now()) {
    store.delete(key)
    return undefined
  }
  return entry.value
}

export const cache = {
  async getOrSet(key, ttlSeconds, loader) {
    const cached = readFresh(key)
    if (cached !== undefined) return cached

    if (inflight.has(key)) return inflight.get(key)

    const pending = Promise.resolve()
      .then(loader)
      .then((value) => {
        store.set(key, {
          value,
          expiresAt: Date.now() + ttlSeconds * 1000,
        })
        return value
      })
      .finally(() => {
        inflight.delete(key)
      })

    inflight.set(key, pending)
    return pending
  },

  del(key) {
    store.delete(key)
  },

  delByPrefix(prefix) {
    for (const key of store.keys()) {
      if (key.startsWith(prefix)) store.delete(key)
    }
  },
}
