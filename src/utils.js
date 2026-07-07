/**
 * 32-bit FNV-1a hash. Better distribution than the prior djb2-style additive
 * hash, which made order-independent hash collisions far more likely.
 *
 * @param {string} string - The string to hash.
 * @returns {number} - An unsigned 32-bit integer hash.
 */
function hashThisString(string) {
  let h = 2166136261

  for (let i = 0; i < string.length; i++) {
    h ^= string.charCodeAt(i)
    h = Math.imul(h, 16777619)
  }

  return h >>> 0
}

/**
 * Mix a kind tag into an already-computed payload hash so that values of
 * different kinds with the same payload still produce distinct hashes.
 *
 * @param {string} kind - A string tag identifying the value kind (e.g. `'array'`, `'number'`).
 * @param {number} payload - The hash of the value's contents.
 * @returns {number} - A new unsigned 32-bit integer hash combining kind and payload.
 */
function tagHash(kind, payload) {
  return payload + hashThisString(`[type: ${kind}; ${payload}]`)
}

/**
 * Mix two hashes numerically without string allocations.
 *
 * @param {number} h1
 * @param {number} h2
 * @returns {number}
 */
function mix(h1, h2) {
  let h = 2166136261
  h ^= h1
  h = Math.imul(h, 16777619)
  h ^= h2
  h = Math.imul(h, 16777619)
  return h >>> 0
}

/**
 * Removes a single element from an array at the given index.
 *
 * @param {Array} arr - The array to mutate.
 * @param {number} from - The zero-based index of the element to remove.
 * @returns {Array} - The modified array.
 */
export function arrayRemove(arr, from) {
  arr.splice(from, 1)
  return arr
}

/**
 * Determines the real type of a given subject.
 *
 * Note: `Math` is reported as `'math'` (not `'object'`) so that comparing
 * `Math` against a plain object produces a difference. This is exercised by
 * the test suite.
 *
 * @param {*} subject - The value to inspect.
 * @returns {'undefined'|'boolean'|'number'|'bigint'|'string'|'symbol'|'function'|'null'|'array'|'date'|'regexp'|'math'|'map'|'set'|'typedarray'|'object'} - A lowercase string tag identifying the runtime type.
 */
export function realTypeOf(subject) {
  const type = typeof subject

  if (type !== 'object') return type
  if (subject === null) return 'null'
  if (subject === Math) return 'math'
  if (Array.isArray(subject)) return 'array'

  // Brand check Map & Set
  if (subject instanceof Map) return 'map'
  if (subject instanceof Set) return 'set'

  // Brand check TypedArrays (e.g. Uint8Array, Float64Array)
  if (ArrayBuffer.isView(subject) && !(subject instanceof DataView)) {
    return 'typedarray'
  }

  // Cross-realm safe brand checks for Date, RegExp, Map, Set
  try {
    Date.prototype.getTime.call(subject)
    return 'date'
  } catch {
    // ignore
  }

  try {
    RegExp.prototype.test.call(subject, '')
    return 'regexp'
  } catch {
    // ignore
  }

  try {
    Map.prototype.has.call(subject, undefined)
    return 'map'
  } catch {
    // ignore
  }

  try {
    Set.prototype.has.call(subject, undefined)
    return 'set'
  } catch {
    // ignore
  }

  return 'object'
}

/**
 * Generates an order-independent hash for a given object. Used for
 * `orderIndependent` array comparisons.
 *
 * @param {*} object - The value to hash.
 * @param {WeakSet<object>} [seen] - Tracks already-visited objects to short-circuit cycles.
 * @returns {number} - An unsigned 32-bit integer hash.
 */
export function getOrderIndependentHash(object, seen = new WeakSet()) {
  const type = realTypeOf(object)

  if (type === 'array') {
    if (seen.has(object)) return 0
    seen.add(object)

    let accum = 0

    for (const item of object) accum += getOrderIndependentHash(item, seen)

    seen.delete(object)
    return tagHash('array', accum)
  }

  if (type === 'map') {
    if (seen.has(object)) return 0
    seen.add(object)

    let accum = 0

    for (const [key, val] of object.entries()) {
      const keyHash = getOrderIndependentHash(key, seen)
      const valHash = getOrderIndependentHash(val, seen)
      accum += mix(keyHash, valHash)
    }

    seen.delete(object)
    return tagHash('map', accum)
  }

  if (type === 'set') {
    if (seen.has(object)) return 0
    seen.add(object)

    let accum = 0

    for (const val of object) {
      accum += getOrderIndependentHash(val, seen)
    }

    seen.delete(object)
    return tagHash('set', accum)
  }

  if (type === 'typedarray') {
    let accum = 0

    for (let i = 0; i < object.length; i++) {
      accum = (Math.imul(accum, 31) + object[i]) | 0
    }

    return tagHash('typedarray', accum)
  }

  if (type === 'object') {
    if (seen.has(object)) return 0
    seen.add(object)

    const keys = Object.keys(object).concat(Object.getOwnPropertySymbols(object))
    let accum = 0

    for (const key of keys) {
      const keyHash = hashThisString(String(key))
      const valHash = getOrderIndependentHash(object[key], seen)
      accum += mix(keyHash, valHash)
    }

    seen.delete(object)
    return accum
  }

  return tagHash(type, hashThisString(`value: ${String(object)}`))
}

/**
 * Structural equality of two arrays as multisets, using
 * `getOrderIndependentHash` to identify "equal" elements.
 *
 * @param {Array} a - The first array.
 * @param {Array} b - The second array.
 * @returns {boolean} - `true` if both arrays contain the same elements with the same frequencies, regardless of order.
 */
export function multisetEqual(a, b) {
  if (a.length !== b.length) return false

  const counts = new Map()

  for (const v of a) {
    const h = getOrderIndependentHash(v)
    counts.set(h, (counts.get(h) || 0) + 1)
  }

  for (const v of b) {
    const h = getOrderIndependentHash(v)
    const c = counts.get(h)

    if (!c) return false

    counts.set(h, c - 1)
  }

  return true
}

/**
 * Structural equality of two leaf values, accounting for `NaN` and `Date`
 * (including invalid dates).
 *
 * @param {*} a - The first value.
 * @param {*} b - The second value.
 * @returns {boolean} - `true` if the values are structurally equal.
 */
export function leafEqual(a, b) {
  const ta = realTypeOf(a)

  if (ta !== realTypeOf(b)) return false

  if (ta === 'date') {
    const na = +a
    const nb = +b

    return (Number.isNaN(na) && Number.isNaN(nb)) || na === nb
  }

  if (ta === 'number' && Number.isNaN(a) && Number.isNaN(b)) return true

  return a === b
}
