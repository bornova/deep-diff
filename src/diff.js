import { Diff, DiffArray, DiffDeleted, DiffEdit, DiffNew, KIND } from './models.js'
import { getOwnKeys, leafEqual, multisetEqual, realTypeOf, typedArrayEqual } from './utils.js'

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
 * @property {DiffChange[]} [accumulator]
 *   When provided, changes are pushed directly into this array (no
 *   intermediate allocation) and it is returned as the result.
 * @property {boolean} [orderIndependent=false]
 *   When `true`, arrays are compared as multisets. If they differ, a single
 *   `DiffEdit` at the array's path is emitted.
 */

/**
 * Recursive walker for child properties/elements. `stack` tracks active
 * `{ lhs, rhs }` ancestor pairs on the recursion stack for cycle detection.
 * `currentPath` is mutated (push/pop) to avoid allocating a new array per
 * node; emitted changes snapshot it via the `Diff` constructor.
 *
 * @param {*} lhs - Left-hand side value.
 * @param {*} rhs - Right-hand side value.
 * @param {DiffChange[]} changes - Accumulator array for emitted changes.
 * @param {PrefilterFn | PrefilterObject | undefined} prefilter - Optional filter/normalizer.
 * @param {PropertyKey[]} currentPath - Mutable path to the current node (shared across calls).
 * @param {*} key - The key used to reach the current node from its parent.
 * @param {{lhsPairs: Map<object, object>, rhsPairs: Map<object, object>}} stack - Cycle-detection state.
 * @param {boolean | undefined} orderIndependent - When true, arrays are compared as multisets.
 * @param {boolean} ldefined - Whether `lhs` is defined (own property / Map entry exists).
 * @param {boolean} rdefined - Whether `rhs` is defined (own property / Map entry exists).
 */
function deepDiff(lhs, rhs, changes, prefilter, currentPath, key, stack, orderIndependent, ldefined, rdefined) {
  if (prefilter) {
    const pathCopy = currentPath.slice()

    if (typeof prefilter === 'function') {
      if (prefilter(pathCopy, key)) return
    } else {
      if (prefilter.prefilter?.(pathCopy, key)) return

      if (prefilter.normalize) {
        const alt = prefilter.normalize(pathCopy, key, lhs, rhs)

        if (alt) {
          lhs = alt[0]
          rhs = alt[1]
          ldefined = lhs !== undefined
          rdefined = rhs !== undefined
        }
      }
    }
  }

  currentPath.push(key)

  try {
    diffValues(lhs, rhs, changes, prefilter, currentPath, stack, orderIndependent, ldefined, rdefined)
  } finally {
    currentPath.pop()
  }
}

/**
 * Core value-level comparison. Handles primitives, dates, regexes, cycle
 * detection, arrays, Maps, Sets, TypedArrays, and objects. Pushes changes
 * into `changes`.
 *
 * @param {*} lhs - Left-hand side value.
 * @param {*} rhs - Right-hand side value.
 * @param {DiffChange[]} changes - Accumulator array for emitted changes.
 * @param {PrefilterFn | PrefilterObject | undefined} prefilter - Optional filter/normalizer.
 * @param {PropertyKey[]} currentPath - Mutable path to the current node (shared across calls).
 * @param {{lhsPairs: Map<object, object>, rhsPairs: Map<object, object>}} stack - Cycle-detection state.
 * @param {boolean | undefined} orderIndependent - When true, arrays are compared as multisets.
 * @param {boolean} ldefined - Whether `lhs` is defined.
 * @param {boolean} rdefined - Whether `rhs` is defined.
 */
function diffValues(lhs, rhs, changes, prefilter, currentPath, stack, orderIndependent, ldefined, rdefined) {
  if (!ldefined && rdefined) {
    changes.push(new DiffNew(currentPath, rhs))

    return
  }

  if (!rdefined && ldefined) {
    changes.push(new DiffDeleted(currentPath, lhs))

    return
  }

  if (lhs === rhs) {
    return
  }

  let ltrue = realTypeOf(lhs)
  let rtrue = realTypeOf(rhs)

  if (ltrue === 'regexp' && rtrue === 'regexp') {
    lhs = RegExp.prototype.toString.call(lhs)
    rhs = RegExp.prototype.toString.call(rhs)
    ltrue = 'string'
    rtrue = 'string'
  }

  if (ltrue !== rtrue) {
    changes.push(new DiffEdit(currentPath, lhs, rhs))

    return
  }

  if (ltrue === 'set') {
    if (!multisetEqual(lhs, rhs)) {
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

  if (ltrue === 'array' || ltrue === 'map' || ltrue === 'object') {
    // Cycle detection in O(1) via separate lhs/rhs pair maps: paired-on-stack ⇒ equal;
    // either side already on the stack but with a different counterpart ⇒ edit.
    const { lhsPairs, rhsPairs } = stack
    const lhsCounterpart = lhsPairs.get(lhs)
    const rhsCounterpart = rhsPairs.get(rhs)

    if (lhsCounterpart === rhs && rhsCounterpart === lhs) return

    if (lhsCounterpart !== undefined || rhsCounterpart !== undefined) {
      changes.push(new DiffEdit(currentPath, lhs, rhs))

      return
    }

    lhsPairs.set(lhs, rhs)
    rhsPairs.set(rhs, lhs)

    try {
      if (ltrue === 'array') {
        diffArrays(lhs, rhs, changes, prefilter, currentPath, stack, orderIndependent)
      } else if (ltrue === 'map') {
        diffMaps(lhs, rhs, changes, prefilter, currentPath, stack, orderIndependent)
      } else {
        diffObjects(lhs, rhs, changes, prefilter, currentPath, stack, orderIndependent)
      }
    } finally {
      lhsPairs.delete(lhs)
      rhsPairs.delete(rhs)
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
 * @param {{lhsPairs: Map<object, object>, rhsPairs: Map<object, object>}} stack - Cycle-detection state.
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
      deepDiff(lhs[i], rhs[i], changes, prefilter, currentPath, i, stack, orderIndependent, true, true)
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
 * @param {{lhsPairs: Map<object, object>, rhsPairs: Map<object, object>}} stack - Cycle-detection state.
 * @param {boolean | undefined} orderIndependent - When true, arrays are compared as multisets.
 */
function diffObjects(lhs, rhs, changes, prefilter, currentPath, stack, orderIndependent) {
  const lkeys = getOwnKeys(lhs)
  const remaining = new Set(getOwnKeys(rhs))

  for (const k of lkeys) {
    if (remaining.delete(k)) {
      deepDiff(lhs[k], rhs[k], changes, prefilter, currentPath, k, stack, orderIndependent, true, true)
    } else {
      deepDiff(lhs[k], undefined, changes, prefilter, currentPath, k, stack, orderIndependent, true, false)
    }
  }

  for (const k of remaining) {
    deepDiff(undefined, rhs[k], changes, prefilter, currentPath, k, stack, orderIndependent, false, true)
  }
}

/**
 * Diff two Map instances structurally by keys and values.
 */
function diffMaps(lhs, rhs, changes, prefilter, currentPath, stack, orderIndependent) {
  const remaining = new Set(rhs.keys())

  for (const k of lhs.keys()) {
    if (remaining.delete(k)) {
      deepDiff(lhs.get(k), rhs.get(k), changes, prefilter, currentPath, k, stack, orderIndependent, true, true)
    } else {
      deepDiff(lhs.get(k), undefined, changes, prefilter, currentPath, k, stack, orderIndependent, true, false)
    }
  }

  for (const k of remaining) {
    deepDiff(undefined, rhs.get(k), changes, prefilter, currentPath, k, stack, orderIndependent, false, true)
  }
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
export function diff(lhs, rhs, options) {
  const { prefilter, accumulator, orderIndependent } = options || {}

  const changes = accumulator || []
  const stack = { lhsPairs: new Map(), rhsPairs: new Map() }

  diffValues(lhs, rhs, changes, prefilter, [], stack, orderIndependent, lhs !== undefined, rhs !== undefined)

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
export function observableDiff(lhs, rhs, observer, options) {
  const changes = diff(lhs, rhs, options) ?? []

  if (typeof observer === 'function') {
    for (const change of changes) observer(change)
  }

  return changes
}

export { Diff, DiffArray, DiffDeleted, DiffEdit, DiffNew, KIND }
