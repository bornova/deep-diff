/**
 * @typedef {import('./models.js').DiffKind} DiffKind
 * @typedef {import('./models.js').DiffNewLike} DiffNewLike
 * @typedef {import('./models.js').DiffEditLike} DiffEditLike
 * @typedef {import('./models.js').DiffDeletedLike} DiffDeletedLike
 * @typedef {import('./models.js').DiffArrayLike} DiffArrayLike
 * @typedef {import('./models.js').DiffChange} DiffChange
 * @typedef {import('./diff.js').PrefilterFn} PrefilterFn
 * @typedef {import('./diff.js').PrefilterObject} PrefilterObject
 * @typedef {import('./diff.js').DiffOptions} DiffOptions
 */

export { Diff, DiffArray, DiffDeleted, DiffEdit, DiffNew, KIND, diff, observableDiff } from './diff.js'
export { applyChange, applyDiff, revertChange } from './patch.js'
