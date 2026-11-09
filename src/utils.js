const typedArrayTagGetter = Object.getOwnPropertyDescriptor(
  Object.getPrototypeOf(Uint8Array.prototype),
  Symbol.toStringTag
).get

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
  return (payload + hashThisString(`[type: ${kind}; ${payload}]`)) >>> 0
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
 * Returns all own enumerable string keys and own symbol keys of `obj`.
 * Avoids `.concat()` array allocation when there are no symbol keys.
 *
 * @param {object} obj - The object to inspect.
 * @returns {PropertyKey[]}
 */
export function getOwnKeys(obj) {
  const keys = Object.keys(obj)
  const symbols = Object.getOwnPropertySymbols(obj)

  if (symbols.length) {
    keys.push(...symbols)
  }

  return keys
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

  // Fast same-realm checks for common built-ins
  if (subject instanceof Date) return 'date'
  if (subject instanceof RegExp) return 'regexp'
  if (subject instanceof Map) return 'map'
  if (subject instanceof Set) return 'set'

  // Unforgeable cross-realm internal-slot check for TypedArrays (excludes DataView)
  if (typedArrayTagGetter.call(subject) !== undefined) {
    return 'typedarray'
  }

  // Fast path for plain objects and custom class instances without Symbol.toStringTag
  if (!(Symbol.toStringTag in subject) && Object.prototype.toString.call(subject) === '[object Object]') {
    return 'object'
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

  if (type === 'array' || type === 'set' || type === 'map' || type === 'object') {
    if (seen.has(object)) return 0
    seen.add(object)

    let accum = 0

    if (type === 'array' || type === 'set') {
      for (const item of object) {
        accum = (accum + getOrderIndependentHash(item, seen)) >>> 0
      }
    } else if (type === 'map') {
      for (const [key, val] of object.entries()) {
        accum = (accum + mix(getOrderIndependentHash(key, seen), getOrderIndependentHash(val, seen))) >>> 0
      }
    } else {
      for (const key of getOwnKeys(object)) {
        accum = (accum + mix(hashThisString(String(key)), getOrderIndependentHash(object[key], seen))) >>> 0
      }
    }

    seen.delete(object)
    return tagHash(type, accum)
  }

  if (type === 'typedarray') {
    const viewTag = typedArrayTagGetter.call(object)
    let accum = 0

    for (let i = 0; i < object.length; i++) {
      accum = mix(accum, getOrderIndependentHash(object[i], seen))
    }

    return tagHash(`typedarray:${viewTag}`, accum)
  }

  if (type === 'date') {
    return tagHash('date', hashThisString(`value: ${Date.prototype.getTime.call(object)}`))
  }

  if (type === 'regexp') {
    return tagHash('regexp', hashThisString(`value: ${RegExp.prototype.toString.call(object)}`))
  }

  return tagHash(type, hashThisString(`value: ${String(object)}`))
}

/**
 * Structural equality of two arrays or Sets as multisets, using
 * `getOrderIndependentHash` to identify "equal" elements.
 *
 * @param {Array | Set<*>} a - The first collection.
 * @param {Array | Set<*>} b - The second collection.
 * @returns {boolean} - `true` if both collections contain the same elements with the same frequencies, regardless of order.
 */
export function multisetEqual(a, b) {
  const aLen = Array.isArray(a) ? a.length : a.size
  const bLen = Array.isArray(b) ? b.length : b.size

  if (aLen !== bLen) return false

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
 * Compare two TypedArray instances by view type and element-by-element equality
 * (accounting for `NaN`).
 *
 * @param {ArrayBufferView & { length: number }} a - The first TypedArray.
 * @param {ArrayBufferView & { length: number }} b - The second TypedArray.
 * @returns {boolean} - `true` if both are the same TypedArray view type with equal elements.
 */
export function typedArrayEqual(a, b) {
  if (typedArrayTagGetter.call(a) !== typedArrayTagGetter.call(b) || a.length !== b.length) {
    return false
  }

  for (let i = 0; i < a.length; i++) {
    if (!Object.is(a[i], b[i]) && a[i] !== b[i]) return false
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
  if (a === b) return true

  if (realTypeOf(a) === 'date' && realTypeOf(b) === 'date') {
    return Object.is(Date.prototype.getTime.call(a), Date.prototype.getTime.call(b))
  }

  return Object.is(a, b)
}
