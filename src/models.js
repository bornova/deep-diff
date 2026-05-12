/**
 * The set of valid diff kinds emitted and consumed by this library.
 * - `N` — a new property/element
 * - `E` — an edit to an existing property/element
 * - `A` — a change inside an array, with `index` and `item`
 * - `D` — a deleted property/element
 *
 * @type {Readonly<{ NEW: 'N', EDIT: 'E', ARRAY: 'A', DELETED: 'D' }>}
 */
export const KIND = Object.freeze({
  NEW: 'N',
  EDIT: 'E',
  ARRAY: 'A',
  DELETED: 'D'
})

/**
 * @typedef {'N' | 'E' | 'A' | 'D'} DiffKind
 *
 * @typedef {object} DiffNewLike
 * @property {'N'} kind
 * @property {ReadonlyArray<PropertyKey>} [path]
 * @property {*} rhs
 *
 * @typedef {object} DiffEditLike
 * @property {'E'} kind
 * @property {ReadonlyArray<PropertyKey>} [path]
 * @property {*} lhs
 * @property {*} rhs
 *
 * @typedef {object} DiffDeletedLike
 * @property {'D'} kind
 * @property {ReadonlyArray<PropertyKey>} [path]
 * @property {*} lhs
 *
 * @typedef {object} DiffArrayLike
 * @property {'A'} kind
 * @property {ReadonlyArray<PropertyKey>} [path]
 * @property {number} index
 * @property {DiffChange} item
 *
 * @typedef {DiffNewLike | DiffEditLike | DiffDeletedLike | DiffArrayLike} DiffChange
 */

/**
 * Base class for all diff records.
 *
 * The `path` property, when present, is a frozen copy of the input array
 * — attempts to mutate it will throw in strict mode.
 */
export class Diff {
  /**
   * @param {DiffKind} kind - The kind of change (`'N'`, `'E'`, `'A'`, or `'D'`).
   * @param {ReadonlyArray<PropertyKey>} [path] - Path segments leading to the changed value.
   */
  constructor(kind, path) {
    this.kind = kind

    if (path?.length) {
      // Freeze a defensive copy so consumers cannot mutate the path stored on
      // a change record (and through it, paths shared with sibling changes).
      this.path = Object.freeze(path.slice())
    }
  }
}

/** A change inside an array at a specific index. */
export class DiffArray extends Diff {
  /**
   * @param {ReadonlyArray<PropertyKey> | undefined} path - Path to the array containing the change.
   * @param {number} index - Zero-based index of the changed element.
   * @param {DiffChange} item - The nested change record describing what changed at `index`.
   */
  constructor(path, index, item) {
    super(KIND.ARRAY, path)

    this.index = index
    this.item = item
  }
}

/** A property/element that was deleted from `lhs`. */
export class DiffDeleted extends Diff {
  /**
   * @param {ReadonlyArray<PropertyKey> | undefined} path - Path to the deleted property.
   * @param {*} lhs - The deleted value.
   */
  constructor(path, lhs) {
    super(KIND.DELETED, path)

    this.lhs = lhs
  }
}

/** A change to an existing property/element. */
export class DiffEdit extends Diff {
  /**
   * @param {ReadonlyArray<PropertyKey> | undefined} path - Path to the edited property.
   * @param {*} lhs - The original (left-hand side) value.
   * @param {*} rhs - The new (right-hand side) value.
   */
  constructor(path, lhs, rhs) {
    super(KIND.EDIT, path)

    this.lhs = lhs
    this.rhs = rhs
  }
}

/** A new property/element added on `rhs`. */
export class DiffNew extends Diff {
  /**
   * @param {ReadonlyArray<PropertyKey> | undefined} path - Path to the new property.
   * @param {*} rhs - The new value.
   */
  constructor(path, rhs) {
    super(KIND.NEW, path)

    this.rhs = rhs
  }
}
