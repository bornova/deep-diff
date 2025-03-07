/**
 * Represents a generic Diff.
 * @class
 */
class Diff {
  /**
   * Creates an instance of Diff.
   * @param {string} kind - The kind of the diff.
   * @param {Array} path - The path of the diff.
   */
  constructor(kind, path) {
    Object.defineProperty(this, 'kind', { value: kind, enumerable: true })

    if (path && path.length) {
      Object.defineProperty(this, 'path', { value: path, enumerable: true })
    }
  }
}

/**
 * Represents an edit Diff.
 * @class
 * @extends Diff
 */
class DiffEdit extends Diff {
  /**
   * Creates an instance of DiffEdit.
   * @param {Array} path - The path of the diff.
   * @param {*} origin - The original value.
   * @param {*} value - The new value.
   */
  constructor(path, origin, value) {
    super('E', path)

    Object.defineProperty(this, 'lhs', { value: origin, enumerable: true })
    Object.defineProperty(this, 'rhs', { value: value, enumerable: true })
  }
}

/**
 * Represents a new Diff.
 * @class
 * @extends Diff
 */
class DiffNew extends Diff {
  /**
   * Creates an instance of DiffNew.
   * @param {Array} path - The path of the diff.
   * @param {*} value - The new value.
   */
  constructor(path, value) {
    super('N', path)

    Object.defineProperty(this, 'rhs', { value: value, enumerable: true })
  }
}

/**
 * Represents a deleted Diff.
 * @class
 * @extends Diff
 */
class DiffDeleted extends Diff {
  /**
   * Creates an instance of DiffDeleted.
   * @param {Array} path - The path of the diff.
   * @param {*} value - The deleted value.
   */
  constructor(path, value) {
    super('D', path)

    Object.defineProperty(this, 'lhs', { value: value, enumerable: true })
  }
}

/**
 * Represents an array Diff.
 * @class
 * @extends Diff
 */
class DiffArray extends Diff {
  /**
   * Creates an instance of DiffArray.
   * @param {Array} path - The path of the diff.
   * @param {number} index - The index in the array.
   * @param {Diff} item - The diff item.
   */
  constructor(path, index, item) {
    super('A', path)

    Object.defineProperty(this, 'index', { value: index, enumerable: true })
    Object.defineProperty(this, 'item', { value: item, enumerable: true })
  }
}

export { Diff, DiffEdit, DiffNew, DiffDeleted, DiffArray }
