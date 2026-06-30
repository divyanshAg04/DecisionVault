const cache = new Map();

export function getCached(key) {
  const entry = cache.get(key);
  if (!entry) return null;
  if (Date.now() > entry.expiry) {
    cache.delete(key);
    return null;
  }
  return entry.value;
}

export function setCached(key, value, ttlSeconds = 300) {
  cache.set(key, {
    value,
    expiry: Date.now() + ttlSeconds * 1000,
  });
}

export function clearCache() {
  cache.clear();
}
