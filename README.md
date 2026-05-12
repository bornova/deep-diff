# @bornova/deep-diff

**This is an ESM rewrite of the original [deep-diff](https://www.npmjs.com/package/deep-diff) library.**
The main functionality of the original library has been preserved for the most part with some notable changes:

- The `DeepDiff` default export was removed for nodejs usage. See [Importing](#importing)
- Some of the optional arguments for `diff` and `observableDiff` functions are now passed as an options object. See [API Documentation](#api-documentation)

**@bornova/deep-diff** is a javascript/node.js module providing utility functions for determining the structural differences between objects and includes some utilities for applying differences across objects.

## Features

- Get the structural differences between two objects.
- Observe the structural differences between two objects.
- When structural differences represent change, apply change from one object to another.
- When structural differences represent change, selectively apply change from one object to another.

## Installation

```
npm install @bornova/deep-diff
```

### Importing

#### nodejs

```javascript
// Import everything
import * as DeepDiff from '@bornova/deep-diff'

// or import individually modules:
import { diff, observableDiff, applyDiff, applyChange, revertChange } from '@bornova/deep-diff'
```

#### browser

```html
<script src="https://cdn.jsdelivr.net/npm/@bornova/deep-diff/dist/browser/deep-diff.min.js"></script>
```

In a browser, `@bornova/deep-diff` exposes a global named `DeepDiff`. The exposed object has the same shape as the namespace produced by `import * as DeepDiff from '@bornova/deep-diff'` in Node — pick whichever import style suits your environment, the API is identical.

## Simple Examples

In order to describe differences, change revolves around an `origin` object. For consistency, the `origin` object is always the operand on the `left-hand-side` of operations. The `comparand`, which may contain changes, is always on the `right-hand-side` of operations.

```javascript
import { diff } from '@bornova/deep-diff'

let lhs = {
  name: 'my object',
  description: "it's an object!",
  details: {
    it: 'has',
    an: 'array',
    with: ['a', 'few', 'elements']
  }
}

let rhs = {
  name: 'updated object',
  description: "it's an object!",
  details: {
    it: 'has',
    an: 'array',
    with: ['a', 'few', 'more', 'elements', { than: 'before' }]
  }
}

let differences = diff(lhs, rhs)
```

The code snippet above would result in the following structure describing the differences. Note that within an array, elements are visited from the end towards the front, so the higher-index `A` records appear before the lower-index ones:

```javascript
;[
  { kind: 'E', path: ['name'], lhs: 'my object', rhs: 'updated object' },
  { kind: 'A', path: ['details', 'with'], index: 4, item: { kind: 'N', rhs: { than: 'before' } } },
  { kind: 'A', path: ['details', 'with'], index: 3, item: { kind: 'N', rhs: 'elements' } },
  { kind: 'E', path: ['details', 'with', 2], lhs: 'elements', rhs: 'more' }
]
```

### Differences

Differences are reported as one or more change records. Change records have the following structure:

- `kind` - indicates the kind of change; will be one of the following:
  - `N` - indicates a newly added property/element
  - `D` - indicates a property/element was deleted
  - `E` - indicates a property/element was edited
  - `A` - indicates a change occurred within an array
- `path` - the property path (from the left-hand-side root)
- `lhs` - the value on the left-hand-side of the comparison (undefined if kind === 'N')
- `rhs` - the value on the right-hand-side of the comparison (undefined if kind === 'D')
- `index` - when kind === 'A', indicates the array index where the change occurred
- `item` - when kind === 'A', contains a nested change record indicating the change that occurred at the array index

Change records are generated for all structural differences between `origin` and `comparand`. The methods only consider an object's own properties and array elements; those inherited from an object's prototype chain are not considered.

Changes to arrays are recorded simplistically. We care most about the shape of the structure; therefore we don't take the time to determine if an object moved from one slot in the array to another. Instead, we only record the structural
differences. If the structural differences are applied from the `comparand` to the `origin` then the two objects will compare as "deep equal" using most `isEqual` implementations such as found in [lodash](https://github.com/bestiejs/lodash) or [underscore](http://underscorejs.org/).

### Changes

When two objects differ, you can observe the differences as they are calculated and selectively apply those changes to the origin object (left-hand-side).

```javascript
import { applyChange, observableDiff } from '@bornova/deep-diff'

let lhs = {
  name: 'my object',
  description: "it's an object!",
  details: {
    it: 'has',
    an: 'array',
    with: ['a', 'few', 'elements']
  }
}

let rhs = {
  name: 'updated object',
  description: "it's an object!",
  details: {
    it: 'has',
    an: 'array',
    with: ['a', 'few', 'more', 'elements', { than: 'before' }]
  }
}

observableDiff(lhs, rhs, (d) => {
  // Apply all changes except to the name property...
  if (d.path && d.path[d.path.length - 1] !== 'name') {
    applyChange(lhs, rhs, d)
  }
})
```

## API Documentation

- `diff(lhs, rhs, [options: { prefilter, accumulator, orderIndependent }])` &mdash; calculates the differences between two objects, using the specified `prefilter`, `accumulator`, and `orderIndependent` options.
- `observableDiff(lhs, rhs, observer, [options: { prefilter, accumulator, orderIndependent }])` &mdash; calculates the differences between two objects and reports each to an observer function, using the specified `prefilter`, `accumulator`, and `orderIndependent` options.
- `applyDiff(target, source, filter)` &mdash; mutates `target` in place so that it becomes structurally equal to `source`, optionally filtering each difference. Note the direction: `target` is the operand that is changed; `source` is the shape it should match.
- `applyChange(target, source, change)` &mdash; applies a single change record to a target object. The `source` argument is unused; the two-argument form `applyChange(target, change)` is also accepted.
- `revertChange(target, source, change)` &mdash; reverts a single change record against a target object. The `source` argument is required to be truthy — if either `target` or `source` is falsy, the call is a no-op.

The library also exports the `Diff` base class, the `DiffArray` / `DiffEdit` / `DiffNew` / `DiffDeleted` subclasses, and a `KIND` constant (`{ NEW: 'N', EDIT: 'E', ARRAY: 'A', DELETED: 'D' }`) for consumers that want stronger types or want to construct change records manually.

### `diff`

The `diff` function calculates the difference between two objects.

#### Arguments

- `lhs` - the left-hand operand; the origin object.
- `rhs` - the right-hand operand; the object being compared structurally with the origin object.
- `options` - A configuration object that can have the following properties:
  - `prefilter`: A function that determines whether difference analysis should continue down the object graph. If it is an object, it has the following properties:
    - `prefilter`: Same `prefilter` function as above.
    - `normalize`: A function that pre-processes every _leaf_ of the tree.
  - `accumulator`: An optional accumulator/array (requirement is that it have a `push` function). Each difference is pushed to the specified accumulator.
  - `orderIndependent`: When `true`, arrays are compared as multisets — element order does not matter. If two arrays differ as multisets, a single `DiffEdit` at the array's path is emitted (not per-index `A` records, since indices into a sorted copy would not be patchable against the original). Default is `false`.

Returns either an array of changes or, if there are no changes, `undefined`. This was originally chosen so the result would pass a truthy test:

```javascript
let changes = diff(obja, objb)
if (changes) {
  // do something with the changes.
}
```

#### Pre-filtering Object Properties

The `prefilter`'s signature is `function(path, key)`, where `path` is the property path of the **parent** object (it does **not** yet include `key`). Return a truthy value to skip that `path`/`key` combination — the difference analysis will not descend into it. Use `[...path, key]` if you need the full path of the property under consideration.

```javascript
import { diff } from '@bornova/deep-diff'
import { assert } from 'chai'

const data = {
  issue: 126,
  submittedBy: 'abuzarhamza',
  title: 'readme.md need some additional example prefilter',
  posts: [
    {
      date: '2018-04-16',
      text: `additional example for prefilter for deep-diff would be great.
      https://stackoverflow.com/questions/38364639/pre-filter-condition-deep-diff-node-js`
    }
  ]
}

const clone = JSON.parse(JSON.stringify(data))
clone.title = 'README.MD needs additional example illustrating how to prefilter'
clone.disposition = 'completed'

const two = diff(data, clone)
const none = diff(data, clone, {
  prefilter: (path, key) => path.length === 0 && ['title', 'disposition'].includes(key)
})

assert.equal(two.length, 2, 'should reflect two differences')
assert.ok(typeof none === 'undefined', 'should reflect no differences')
```

#### Normalizing object properties

The `normalize`'s signature should be `function(path, key, lhs, rhs)` and it should return either a falsy value if no normalization has occured, or a `[lhs, rhs]` array to replace the original values. This step doesn't occur if the path was filtered out in the `prefilter` phase.

```javascript
import { diff } from '@bornova/deep-diff'
import { assert } from 'chai'

const data = {
  pull: 149,
  submittedBy: 'saveman71'
}

const clone = JSON.parse(JSON.stringify(data))
clone.pull = 42

const two = diff(data, clone)
const none = diff(data, clone, {
  prefilter: {
    normalize: (path, key, lhs, rhs) => {
      if (lhs === 149) {
        lhs = 42
      }
      if (rhs === 149) {
        rhs = 42
      }
      return [lhs, rhs]
    }
  }
})

assert.equal(two.length, 1, 'should reflect one difference')
assert.ok(typeof none === 'undefined', 'should reflect no difference')
```

### `observableDiff`

The `observableDiff` function calculates the difference between two objects and reports each to an observer function.

#### Arguments

- `lhs` - The left-hand operand; the origin object.
- `rhs` - The right-hand operand; the object being compared structurally with the origin object.
- `observer` - The observer to report to.
- `options` - A configuration object that can have the following properties:
  - `prefilter`: A function that determines whether difference analysis should continue down the object graph. If it is an object, it has the following properties:
    - `prefilter`: Same `prefilter` function as above.
    - `normalize`: A function that pre-processes every _leaf_ of the tree.
  - `orderIndependent`: When `true`, arrays are compared as multisets. If two arrays differ as multisets, a single `DiffEdit` is emitted at the array's path. Default is `false`.
