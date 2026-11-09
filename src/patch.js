import { observableDiff } from './diff.js'
import { KIND } from './models.js'
import { arrayRemove, realTypeOf } from './utils.js'

/**
 * Per-direction policy mapping each diff `kind` to either:
 *  - `'rhs'` / `'lhs'`: write that field of the change to the target slot,
 *  - `'delete'`: delete the target slot.
 *
 * `A` is handled separately (recurse into the inner change).
 */
const APPLY = Object.freeze({ E: 'rhs', N: 'rhs', D: 'delete' })
const REVERT = Object.freeze({ E: 'lhs', N: 'delete', D: 'lhs' })

// Keys that must never be written to avoid prototype pollution.
const UNSAFE_KEYS = new Set(['__proto__', 'constructor', 'prototype'])

/**
 * Returns false if `key` is a well-known prototype-pollution vector.
 * Symbols are always safe; only string keys need checking.
 *
 * @param {PropertyKey} key
 * @returns {boolean}
 */
function isSafeKey(key) {
  return typeof key !== 'string' || !UNSAFE_KEYS.has(key)
}

/**
 * Cross-realm safe check for Map instances.
 *
 * @param {*} value
 * @returns {boolean}
 */
function isMap(value) {
  return realTypeOf(value) === 'map'
}

/**
 * Reads `key` from `container`, materializing and storing an empty array or
 * plain object when the current value is not a non-null object.
 *
 * @param {object | Array | Map<*, *>} container
 * @param {PropertyKey} key
 * @param {boolean} isArray
 * @returns {object | Array}
 */
function ensureSlot(container, key, isArray) {
  const map = isMap(container)
  let val = map ? container.get(key) : container[key]

  if (val === null || typeof val !== 'object') {
    val = isArray ? [] : {}
    if (map) container.set(key, val)
    else container[key] = val
  }

  return val
}

/**
 * Walk a path on `target`, materializing missing intermediate containers
 * (arrays when the next segment is numeric, objects otherwise). Returns the
 * parent that owns the final segment.
 *
 * @param {object | Array} start - The root object to walk from.
 * @param {ReadonlyArray<PropertyKey>} path - The sequence of keys to traverse.
 * @returns {object | Array} The parent object that owns the final path segment.
 */
function walkPath(start, path) {
  let it = start
  const last = path.length - 1

  for (let i = 0; i < last; i++) {
    const key = path[i]

    if (!isSafeKey(key)) return Object.create(null)

    it = ensureSlot(it, key, typeof path[i + 1] === 'number')
  }

  return it
}

/**
 * Write or delete a single slot on `parent` according to `policy[kind]`.
 *
 * @param {object | Array} parent - The object or array to mutate.
 * @param {PropertyKey} key - The property key or array index to write or delete.
 * @param {import('./models.js').DiffChange} change - The diff change record.
 * @param {Readonly<Record<string, 'rhs' | 'lhs' | 'delete'>>} policy - The apply/revert policy map.
 */
function writeSlot(parent, key, change, policy) {
  const op = policy[change.kind]
  if (!op || !isSafeKey(key)) return

  if (isMap(parent)) {
    if (op === 'delete') parent.delete(key)
    else parent.set(key, change[op])
  } else {
    if (op === 'delete') delete parent[key]
    else parent[key] = change[op]
  }
}

/**
 * Apply or revert (per `policy`) a kind-`A` change against an array.
 *
 * @param {Array} arr - The array containing the element to change.
 * @param {number} index - Zero-based index of the element to change.
 * @param {import('./models.js').DiffChange} change - The diff change record.
 * @param {Readonly<Record<string, 'rhs' | 'lhs' | 'delete'>>} policy - The apply/revert policy map.
 * @returns {Array} - The same array, mutated in place.
 */
function arrayChange(arr, index, change, policy) {
  if (!isSafeKey(index)) return arr

  if (change.path?.length) {
    objectChange(ensureSlot(arr, index, typeof change.path[0] === 'number'), change, policy)
  } else if (change.kind === KIND.ARRAY) {
    arrayChange(ensureSlot(arr, index, true), change.index, change.item, policy)
  } else {
    const op = policy[change.kind]
    if (!op) return arr

    if (op === 'delete') {
      arr = arrayRemove(arr, index)
    } else {
      arr[index] = change[op]
    }
  }

  return arr
}

/**
 * Apply or revert (per `policy`) a change against `target`.
 *
 * @param {object | Array} target - The object or array to mutate.
 * @param {import('./models.js').DiffChange} change - The diff change record.
 * @param {Readonly<Record<string, 'rhs' | 'lhs' | 'delete'>>} policy - The apply/revert policy map.
 */
function objectChange(target, change, policy) {
  const path = change.path

  if (path?.length) {
    const it = walkPath(target, path)
    const key = path[path.length - 1]

    if (!isSafeKey(key)) return

    if (change.kind === KIND.ARRAY) {
      arrayChange(ensureSlot(it, key, true), change.index, change.item, policy)
    } else {
      writeSlot(it, key, change, policy)
    }
  } else if (change.kind === KIND.ARRAY) {
    // No path: only an `A` change can mutate the target itself.
    // Top-level `E`/`N`/`D` cannot mutate the caller's binding.
    arrayChange(target, change.index, change.item, policy)
  }
}

/**
 * Applies a single change to `target`.
 *
 * Two-argument form: `applyChange(target, change)` is also accepted for
 * convenience — if `change` is omitted and `source` looks like a change
 * record (has a string `kind`), it is treated as the change.
 *
 * @param {object | Array | Map<*, *>} target - Mutated in place.
 * @param {import('./models.js').DiffChange | *} [source] - In the
 *   two-argument form, treated as the change record. Otherwise unused;
 *   provided to mirror the original deep-diff signature.
 * @param {import('./models.js').DiffChange} [change] - The change to apply. Required in the three-argument form.
 */
export function applyChange(target, source, change) {
  // Two-argument form: applyChange(target, change)
  if (change === undefined && source && typeof source.kind === 'string') {
    change = source
  }

  if (!target || !change?.kind) return

  objectChange(target, change, APPLY)
}

/**
 * Computes the differences between `target` and `source`, then mutates
 * `target` so it becomes structurally equal to `source`.
 *
 * @param {object | Array | Map<*, *>} target - Mutated in place.
 * @param {object | Array | Map<*, *>} source - The shape `target` should match after this call.
 * @param {(target: any, source: any, change: import('./models.js').DiffChange) => boolean} [filter]
 */
export function applyDiff(target, source, filter) {
  if (!target || !source) return

  observableDiff(target, source, (change) => {
    if (!filter || filter(target, source, change)) applyChange(target, source, change)
  })
}

/**
 * Reverts a single change against `target` (the inverse of `applyChange`).
 *
 * Two-argument form: `revertChange(target, change)` is also accepted for
 * convenience — if `change` is omitted and `source` looks like a change
 * record (has a string `kind`), it is treated as the change.
 *
 * @param {object | Array | Map<*, *>} target - Mutated in place.
 * @param {import('./models.js').DiffChange | *} [source] - In
 *   the two-argument form, treated as the change record. In the three-argument
 *   form, required as a truthy gate; otherwise unused.
 * @param {import('./models.js').DiffChange} [change] - The change to revert.
 */
export function revertChange(target, source, change) {
  // Two-argument form: revertChange(target, change)
  if (change === undefined && source && typeof source.kind === 'string') {
    change = source
  }

  if (!target || !source || !change?.kind) return

  objectChange(target, change, REVERT)
}
