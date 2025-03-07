import { accumulateDiff, observableDiff } from './deepDiff.js'
import { applyDiff, applyChange, revertChange } from './applyRevert.js'

const DeepDiff = {
  diff: accumulateDiff,
  observableDiff,
  applyDiff,
  applyChange,
  revertChange
}

export default DeepDiff
