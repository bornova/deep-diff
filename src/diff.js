import { Diff, DiffArray, DiffDeleted, DiffEdit, DiffNew, KIND } from './models.js'
import { leafEqual, multisetEqual, realTypeOf } from './utils.js'

/**
 * @typedef {import('./models.js').DiffChange} DiffChange
 *
 * @typedef {(path: PropertyKey[], key: PropertyKey) => boolean} PrefilterFn
 *
 * @typedef {object} PrefilterObject
 * @property {PrefilterFn} [prefilter]
 * @property {(path: PropertyKey[], key: PropertyKey, lhs: *, rhs: *) => ([*, *] | false | null | undefined)} [normalize]
 *
 * @typedef {object} DiffOptions
 * @property {PrefilterFn | PrefilterObject} [prefilter]
 *   Either a function `(path, key) => skip?` or an object with optional
 *   `prefilter` and `normalize` callbacks. `path` is the parent path
 *   (excludes `key`).
 * @property {DiffChange[]} [accumulator] - When provided, changes are
 *   pushed directly into this array (no intermediate allocation) and it is
 *   returned as the result.
 * @property {boolean} [orderIndependent=false]
 *   When `true`, arrays are compared as multisets. If they differ, a single
 *   `DiffEdit` at the array's path is emitted.
 */

/**
 * Returns true if `key` is an own (non-inherited) property of `parent`.
 * Tolerates `parent` being `null`/`undefined` and `key` being `undefined`
 * (both can occur at the recursion root before any parent is established).
 *
 * @param {*} parent - The object to check (may be `null` or `undefined`).
 * @param {PropertyKey | undefined} key - The key to look up.
 * @returns {boolean}
 */
function hasOwn(parent, key) {
  return parent != null && key !== undefined && Object.hasOwn(parent, key)
}

/**
 * Recursive walker. `stack` is an array of `{ lhs, rhs }` pairs currently on
 * the recursion stack, used for cycle detection. `currentPath` is mutated
 * (push/pop) to avoid allocating a new array per node; emitted changes
 * snapshot it via the `Diff` constructor.
 *
 * @param {*} lhs - Left-hand side value.
 * @param {*} rhs - Right-hand side value.
 * @param {DiffChange[]} changes - Accumulator array for emitted changes.
 * @param {PrefilterFn | PrefilterObject | undefined} prefilter - Optional filter/normalizer.
 * @param {PropertyKey[]} currentPath - Mutable path to the current node (shared across calls).
 * @param {PropertyKey | undefined} key - The key used to reach the current node from its parent.
 * @param {{pairs: Map<object, object>, parents: Array<{lhs: object, rhs: object}>}} stack - Cycle-detection state.
 * @param {boolean | undefined} orderIndependent - When true, arrays are compared as multisets.
 */
function deepDiff(lhs, rhs, changes, prefilter, currentPath, key, stack, orderIndependent) {
  const hasKey = key !== undefined && key !== null

  if (hasKey) {
    if (prefilter) {
      if (typeof prefilter === 'function') {
        if (prefilter(currentPath, key)) return
      } else {
        if (prefilter.prefilter?.(currentPath, key)) return

        if (prefilter.normalize) {
          const alt = prefilter.normalize(currentPath, key, lhs, rhs)

          if (alt) {
            lhs = alt[0]
            rhs = alt[1]
          }
        }
      }
    }

    currentPath.push(key)
  }

  try {
    diffValues(lhs, rhs, changes, prefilter, currentPath, key, stack, orderIndependent)
  } finally {
    if (hasKey) currentPath.pop()
  }
}

/**
 * Core value-level comparison. Handles primitives, dates, regexes, cycle
 * detection, arrays, and objects. Pushes changes into `changes`.
 *
 * @param {*} lhs - Left-hand side value.
 * @param {*} rhs - Right-hand side value.
 * @param {DiffChange[]} changes - Accumulator array for emitted changes.
 * @param {PrefilterFn | PrefilterObject | undefined} prefilter - Optional filter/normalizer.
 * @param {PropertyKey[]} currentPath - Mutable path to the current node (shared across calls).
 * @param {PropertyKey | undefined} key - The key used to reach the current node from its parent.
 * @param {{pairs: Map<object, object>, parents: Array<{lhs: object, rhs: object}>}} stack - Cycle-detection state.
 * @param {boolean | undefined} orderIndependent - When true, arrays are compared as multisets.
 */
function diffValues(lhs, rhs, changes, prefilter, currentPath, key, stack, orderIndependent) {
  if (realTypeOf(lhs) === 'regexp' && realTypeOf(rhs) === 'regexp') {
    lhs = lhs.toString()
    rhs = rhs.toString()
  }

  const ltype = typeof lhs
  const rtype = typeof rhs
  const lastStack = stack.parents.at(-1)

  const ldefined = ltype !== 'undefined' || hasOwn(lastStack?.lhs, key)
  const rdefined = rtype !== 'undefined' || hasOwn(lastStack?.rhs, key)

  if (!ldefined && rdefined) {
    changes.push(new DiffNew(currentPath, rhs))

    return
  }

  if (!rdefined && ldefined) {
    changes.push(new DiffDeleted(currentPath, lhs))

    return
  }

  const ltrue = realTypeOf(lhs)

  if (ltrue !== realTypeOf(rhs)) {
    changes.push(new DiffEdit(currentPath, lhs, rhs))

    return
  }

  if (ltrue === 'date') {
    if (!leafEqual(lhs, rhs)) changes.push(new DiffEdit(currentPath, lhs, rhs))

    return
  }

  if (ltrue === 'set') {
    const larr = Array.from(lhs)
    const rarr = Array.from(rhs)
    if (!multisetEqual(larr, rarr)) {
      changes.push(new DiffEdit(currentPath, lhs, rhs))
    }
    return
  }

  if (ltrue === 'typedarray') {
    if (!typedArrayEqual(lhs, rhs)) {
      changes.push(new DiffEdit(currentPath, lhs, rhs))
    }
    return
  }

  if (ltype === 'object' && lhs !== null && rhs !== null) {
    // Cycle detection in O(1) via the pair map: paired-on-stack ⇒ equal;
    // either side already on the stack but with a different counterpart ⇒ edit.
    const pairs = stack.pairs
    const lhsCounterpart = pairs.get(lhs)
    const rhsCounterpart = pairs.get(rhs)

    if (lhsCounterpart === rhs && rhsCounterpart === lhs) return

    if (lhsCounterpart !== undefined || rhsCounterpart !== undefined) {
      if (lhs !== rhs) changes.push(new DiffEdit(currentPath, lhs, rhs))

      return
    }

    pairs.set(lhs, rhs)
    pairs.set(rhs, lhs)
    stack.parents.push({ lhs, rhs })

    try {
      if (Array.isArray(lhs)) {
        diffArrays(lhs, rhs, changes, prefilter, currentPath, stack, orderIndependent)
      } else if (ltrue === 'map') {
        diffMaps(lhs, rhs, changes, prefilter, currentPath, stack, orderIndependent)
      } else {
        diffObjects(lhs, rhs, changes, prefilter, currentPath, stack, orderIndependent)
      }
    } finally {
      pairs.delete(lhs)
      pairs.delete(rhs)
      stack.parents.pop()
    }

    return
  }

  if (!leafEqual(lhs, rhs)) {
    changes.push(new DiffEdit(currentPath, lhs, rhs))
  }
}

/**
 * Diff two arrays. Walks back-to-front so element order in the change list
 * matches the documented traversal.
 *
 * @param {Array} lhs - Left-hand side array.
 * @param {Array} rhs - Right-hand side array.
 * @param {DiffChange[]} changes - Accumulator array for emitted changes.
 * @param {PrefilterFn | PrefilterObject | undefined} prefilter - Optional filter/normalizer.
 * @param {PropertyKey[]} currentPath - Mutable path to the current node (shared across calls).
 * @param {{pairs: Map<object, object>, parents: Array<{lhs: object, rhs: object}>}} stack - Cycle-detection state.
 * @param {boolean | undefined} orderIndependent - When true, arrays are compared as multisets.
 */
function diffArrays(lhs, rhs, changes, prefilter, currentPath, stack, orderIndependent) {
  if (orderIndependent) {
    if (!multisetEqual(lhs, rhs)) changes.push(new DiffEdit(currentPath, lhs, rhs))

    return
  }

  const max = Math.max(lhs.length, rhs.length)

  for (let i = max - 1; i >= 0; i--) {
    if (i >= lhs.length) {
      changes.push(new DiffArray(currentPath, i, new DiffNew(undefined, rhs[i])))
    } else if (i >= rhs.length) {
      changes.push(new DiffArray(currentPath, i, new DiffDeleted(undefined, lhs[i])))
    } else {
      deepDiff(lhs[i], rhs[i], changes, prefilter, currentPath, i, stack, orderIndependent)
    }
  }
}

/**
 * Diff two plain objects. Uses Set lookup (O(n)) and includes Symbol-keyed
 * properties on both sides.
 *
 * @param {object} lhs - Left-hand side object.
 * @param {object} rhs - Right-hand side object.
 * @param {DiffChange[]} changes - Accumulator array for emitted changes.
 * @param {PrefilterFn | PrefilterObject | undefined} prefilter - Optional filter/normalizer.
 * @param {PropertyKey[]} currentPath - Mutable path to the current node (shared across calls).
 * @param {{pairs: Map<object, object>, parents: Array<{lhs: object, rhs: object}>}} stack - Cycle-detection state.
 * @param {boolean | undefined} orderIndependent - When true, arrays are compared as multisets.
 */
function diffObjects(lhs, rhs, changes, prefilter, currentPath, stack, orderIndependent) {
  const lkeys = Object.keys(lhs).concat(Object.getOwnPropertySymbols(lhs))
  const rkeys = Object.keys(rhs).concat(Object.getOwnPropertySymbols(rhs))
  const remaining = new Set(rkeys)

  for (const k of lkeys) {
    if (remaining.has(k)) {
      deepDiff(lhs[k], rhs[k], changes, prefilter, currentPath, k, stack, orderIndependent)
      remaining.delete(k)
    } else {
      deepDiff(lhs[k], undefined, changes, prefilter, currentPath, k, stack, orderIndependent)
    }
  }

  for (const k of remaining) {
    deepDiff(undefined, rhs[k], changes, prefilter, currentPath, k, stack, orderIndependent)
  }
}

/**
 * Diff two Map instances structurally by keys and values.
 */
function diffMaps(lhs, rhs, changes, prefilter, currentPath, stack, orderIndependent) {
  const lkeys = Array.from(lhs.keys())
  const rkeys = Array.from(rhs.keys())
  const remaining = new Set(rkeys)

  for (const k of lkeys) {
    if (remaining.has(k)) {
      deepDiff(lhs.get(k), rhs.get(k), changes, prefilter, currentPath, k, stack, orderIndependent)
      remaining.delete(k)
    } else {
      deepDiff(lhs.get(k), undefined, changes, prefilter, currentPath, k, stack, orderIndependent)
    }
  }

  for (const k of remaining) {
    deepDiff(undefined, rhs.get(k), changes, prefilter, currentPath, k, stack, orderIndependent)
  }
}

/**
 * Compare two TypedArray instances element-by-element.
 */
function typedArrayEqual(a, b) {
  if (a.length !== b.length) return false
  for (let i = 0; i < a.length; i++) {
    if (a[i] !== b[i]) return false
  }
  return true
}

/**
 * Accumulates differences between two values.
 *
 * @param {*} lhs - Left-hand side value.
 * @param {*} rhs - Right-hand side value.
 * @param {DiffOptions} [options] - Optional configuration: prefilter, accumulator, orderIndependent.
 * @returns {DiffChange[] | undefined} - The list of changes, or `undefined`
 *   when there are no changes and no `accumulator` was provided. When an
 *   `accumulator` is provided, that same array is always returned.
 */
export function diff(lhs, rhs, options = {}) {
  const { prefilter, accumulator, orderIndependent } = options

  const changes = accumulator || []
  const stack = { pairs: new Map(), parents: [] }

  deepDiff(lhs, rhs, changes, prefilter, [], undefined, stack, orderIndependent)

  if (accumulator) return accumulator

  return changes.length ? changes : undefined
}

/**
 * Observes differences between two values and notifies an observer.
 *
 * @param {*} lhs - Left-hand side value.
 * @param {*} rhs - Right-hand side value.
 * @param {(change: DiffChange) => void} [observer] - Called once per change,
 *   in emission order.
 * @param {DiffOptions} [options] - Same options as {@link diff}; if an
 *   `accumulator` is supplied it will receive the changes too.
 * @returns {DiffChange[]} - The list of changes (always an array, possibly
 *   empty). Equal to `options.accumulator` when one was provided.
 */
export function observableDiff(lhs, rhs, observer, options = {}) {
  const changes = diff(lhs, rhs, options) ?? []

  if (observer) {
    for (const change of changes) observer(change)
  }

  return changes
}

export { Diff, DiffArray, DiffDeleted, DiffEdit, DiffNew, KIND }
