export function pick(source, keys) {
  const out = {}
  if (!source) return out
  for (const key of keys) {
    if (Object.prototype.hasOwnProperty.call(source, key) && source[key] !== undefined) {
      out[key] = source[key]
    }
  }
  return out
}
