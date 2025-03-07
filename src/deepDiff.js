import { DiffNew, DiffDeleted, DiffEdit, DiffArray } from './diffs.js'
import { realTypeOf, getOrderIndependentHash } from './utils.js'

/**
 * Recursively finds differences between two objects.
 * @param {*} lhs - The left-hand side object.
 * @param {*} rhs - The right-hand side object.
 * @param {Array} [changes] - The array to accumulate changes.
 * @param {Function|Object} [prefilter] - A function or object to filter properties.
 * @param {Array} [path] - The current path of the diff.
 * @param {*} [key] - The current key being processed.
 * @param {Array} [stack] - The stack of objects being compared.
 * @param {boolean} [orderIndependent] - Whether to perform order-independent comparison.
 */
function deepDiff(lhs, rhs, changes, prefilter, path, key, stack, orderIndependent) {
  changes = changes || []
  path = path || []
  stack = stack || []

  const currentPath = path.slice(0)

  if (typeof key !== 'undefined' && key !== null) {
    if (prefilter) {
      if (typeof prefilter === 'function' && prefilter(currentPath, key)) {
        return
      } else if (typeof prefilter === 'object') {
        if (prefilter.prefilter && prefilter.prefilter(currentPath, key)) {
          return
        }

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

  if (realTypeOf(lhs) === 'regexp' && realTypeOf(rhs) === 'regexp') {
    lhs = lhs.toString()
    rhs = rhs.toString()
  }

  const ltype = typeof lhs
  const rtype = typeof rhs

  let i, j, k, other

  const ldefined =
    ltype !== 'undefined' ||
    (stack &&
      stack.length > 0 &&
      stack[stack.length - 1].lhs &&
      Object.getOwnPropertyDescriptor(stack[stack.length - 1].lhs, key))

  const rdefined =
    rtype !== 'undefined' ||
    (stack &&
      stack.length > 0 &&
      stack[stack.length - 1].rhs &&
      Object.getOwnPropertyDescriptor(stack[stack.length - 1].rhs, key))

  if (!ldefined && rdefined) {
    changes.push(new DiffNew(currentPath, rhs))
  } else if (!rdefined && ldefined) {
    changes.push(new DiffDeleted(currentPath, lhs))
  } else if (realTypeOf(lhs) !== realTypeOf(rhs)) {
    changes.push(new DiffEdit(currentPath, lhs, rhs))
  } else if (realTypeOf(lhs) === 'date' && lhs - rhs !== 0) {
    changes.push(new DiffEdit(currentPath, lhs, rhs))
  } else if (ltype === 'object' && lhs !== null && rhs !== null) {
    for (i = stack.length - 1; i > -1; --i) {
      if (stack[i].lhs === lhs) {
        other = true
        break
      }
    }
    if (!other) {
      stack.push({ lhs: lhs, rhs: rhs })

      if (Array.isArray(lhs)) {
        if (orderIndependent) {
          lhs.sort((a, b) => getOrderIndependentHash(a) - getOrderIndependentHash(b))
          rhs.sort((a, b) => getOrderIndependentHash(a) - getOrderIndependentHash(b))
        }

        i = rhs.length - 1
        j = lhs.length - 1

        while (i > j) {
          changes.push(new DiffArray(currentPath, i, new DiffNew(undefined, rhs[i--])))
        }

        while (j > i) {
          changes.push(new DiffArray(currentPath, j, new DiffDeleted(undefined, lhs[j--])))
        }

        for (; i >= 0; --i) {
          deepDiff(lhs[i], rhs[i], changes, prefilter, currentPath, i, stack, orderIndependent)
        }
      } else {
        const akeys = Object.keys(lhs).concat(Object.getOwnPropertySymbols(lhs))
        const pkeys = Object.keys(rhs).concat(Object.getOwnPropertySymbols(rhs))

        for (i = 0; i < akeys.length; ++i) {
          k = akeys[i]
          other = pkeys.indexOf(k)

          if (other >= 0) {
            deepDiff(lhs[k], rhs[k], changes, prefilter, currentPath, k, stack, orderIndependent)
            pkeys[other] = null
          } else {
            deepDiff(lhs[k], undefined, changes, prefilter, currentPath, k, stack, orderIndependent)
          }
        }

        for (i = 0; i < pkeys.length; ++i) {
          k = pkeys[i]

          if (k) {
            deepDiff(undefined, rhs[k], changes, prefilter, currentPath, k, stack, orderIndependent)
          }
        }
      }

      stack.length = stack.length - 1
    } else if (lhs !== rhs) {
      changes.push(new DiffEdit(currentPath, lhs, rhs))
    }
  } else if (lhs !== rhs) {
    if (!(ltype === 'number' && isNaN(lhs) && isNaN(rhs))) {
      changes.push(new DiffEdit(currentPath, lhs, rhs))
    }
  }
}

/**
 * Observes differences between two objects and notifies an observer.
 * @param {*} lhs - The left-hand side object.
 * @param {*} rhs - The right-hand side object.
 * @param {Function} observer - The observer function to notify of changes.
 * @param {Function|Object} [prefilter] - A function or object to filter properties.
 * @param {boolean} [orderIndependent] - Whether to perform order-independent comparison.
 * @returns {Array} - The array of changes.
 */
function observableDiff(lhs, rhs, observer, prefilter, orderIndependent) {
  const changes = []

  deepDiff(lhs, rhs, changes, prefilter, null, null, null, orderIndependent)

  if (observer) {
    for (let i = 0; i < changes.length; ++i) {
      observer(changes[i])
    }
  }

  return changes
}

/**
 * Recursively finds differences between two objects with order-independent comparison.
 * @param {*} lhs - The left-hand side object.
 * @param {*} rhs - The right-hand side object.
 * @param {Array} [changes] - The array to accumulate changes.
 * @param {Function|Object} [prefilter] - A function or object to filter properties.
 * @param {Array} [path] - The current path of the diff.
 * @param {*} [key] - The current key being processed.
 * @param {Array} [stack] - The stack of objects being compared.
 * @returns {void}
 */
function orderIndependentDeepDiff(lhs, rhs, changes, prefilter, path, key, stack) {
  return deepDiff(lhs, rhs, changes, prefilter, path, key, stack, true)
}

/**
 * Accumulates differences between two objects.
 * @param {*} lhs - The left-hand side object.
 * @param {*} rhs - The right-hand side object.
 * @param {Function|Object} [prefilter] - A function or object to filter properties.
 * @param {Array} [accum] - The array to accumulate changes.
 * @returns {Array|undefined} - The array of changes or undefined if no changes.
 */
function accumulateDiff(lhs, rhs, prefilter, accum) {
  const observer = accum
    ? (difference) => {
        if (difference) {
          accum.push(difference)
        }
      }
    : undefined

  const changes = observableDiff(lhs, rhs, observer, prefilter)

  return accum ? accum : changes.length ? changes : undefined
}

/**
 * Accumulates differences between two objects with order-independent comparison.
 * @param {*} lhs - The left-hand side object.
 * @param {*} rhs - The right-hand side object.
 * @param {Function|Object} [prefilter] - A function or object to filter properties.
 * @param {Array} [accum] - The array to accumulate changes.
 * @returns {Array|undefined} - The array of changes or undefined if no changes.
 */
function accumulateOrderIndependentDiff(lhs, rhs, prefilter, accum) {
  const observer = accum
    ? (difference) => {
        if (difference) {
          accum.push(difference)
        }
      }
    : undefined

  const changes = observableDiff(lhs, rhs, observer, prefilter, true)

  return accum ? accum : changes.length ? changes : undefined
}

export { deepDiff, observableDiff, orderIndependentDeepDiff, accumulateDiff, accumulateOrderIndependentDiff }
