import { expect } from 'chai'

import * as DeepDiff from '../src/index.js'

describe('deep-diff — applyChange, applyDiff and revertChange', () => {
  describe('Changes should be applied correctly', () => {
    const lhs = {
      name: 'my object',
      description: "it's an object!",
      details: {
        it: 'has',
        an: 'array',
        with: ['a', 'few', 'elements']
      }
    }

    const rhs = {
      name: 'updated object',
      description: "it's an object!",
      details: {
        it: 'has',
        an: 'array',
        with: ['a', 'few', 'more', 'elements', { than: 'before' }]
      }
    }

    DeepDiff.observableDiff(lhs, rhs, (d) => {
      // Apply all changes except to the name property...
      if (d.path[d.path.length - 1] !== 'name') {
        DeepDiff.applyChange(lhs, rhs, d)
      }
    })

    it('Should apply all changes except to the name property', () => {
      expect(lhs).to.eql({
        name: 'my object',
        description: "it's an object!",
        details: {
          it: 'has',
          an: 'array',
          with: ['a', 'few', 'more', 'elements', { than: 'before' }]
        }
      })
    })
  })

  describe('revertChange', () => {
    it('does not throw on a path-less diff', () => {
      const diffs = DeepDiff.diff(null, undefined)
      expect(() => DeepDiff.revertChange({}, {}, diffs[0])).to.not.throw()
    })

    it('reverts an array element change (A)', () => {
      const lhs = { arr: ['a', 'b'] }
      const rhs = { arr: ['a', 'b', 'c'] }
      const target = { arr: ['a', 'b', 'c'] }
      const diffs = DeepDiff.diff(lhs, rhs)
      DeepDiff.revertChange(target, lhs, diffs[0])
      expect(target.arr).to.eql(['a', 'b'])
    })

    it('reverts an edit (E)', () => {
      const lhs = { foo: 'bar' }
      const rhs = { foo: 'baz' }
      const target = { foo: 'baz' }
      const diffs = DeepDiff.diff(lhs, rhs)
      DeepDiff.revertChange(target, lhs, diffs[0])
      expect(target.foo).to.equal('bar')
    })

    it('reverts an addition (N) by deleting the property', () => {
      const lhs = {}
      const rhs = { foo: 'bar' }
      const target = { foo: 'bar' }
      const diffs = DeepDiff.diff(lhs, rhs)
      DeepDiff.revertChange(target, lhs, diffs[0])
      expect(target).to.not.have.property('foo')
    })

    it('reverts a deletion (D) by restoring the property', () => {
      const lhs = { foo: 'bar' }
      const rhs = {}
      const target = {}
      const diffs = DeepDiff.diff(lhs, rhs)
      DeepDiff.revertChange(target, lhs, diffs[0])
      expect(target.foo).to.equal('bar')
    })

    it('reverts a nested edit', () => {
      const lhs = { a: { b: 'old' } }
      const rhs = { a: { b: 'new' } }
      const target = { a: { b: 'new' } }
      const diffs = DeepDiff.diff(lhs, rhs)
      DeepDiff.revertChange(target, lhs, diffs[0])
      expect(target.a.b).to.equal('old')
    })

    it('creates an array (not object) for intermediate path nodes when next key is numeric', () => {
      // Bug 1 regression: revertChange was always creating {} for missing intermediate nodes,
      // even when the next path segment is a numeric index (requiring an array).
      const lhs = { a: [{ b: 'old' }] }
      const rhs = { a: [{ b: 'new' }] }
      const diffs = DeepDiff.diff(lhs, rhs)
      // diffs[0] has path ['a', 0, 'b']; revert onto an empty target
      const target = {}
      DeepDiff.revertChange(target, lhs, diffs[0])
      expect(target.a).to.be.an('array')
      expect(target.a[0].b).to.equal('old')
    })
  })

  describe('applyDiff without filter', () => {
    it('applies all changes when called with two arguments', () => {
      const target = { foo: 'bar', baz: 1 }
      const source = { foo: 'qux', baz: 2, extra: true }
      DeepDiff.applyDiff(target, source)
      expect(target.foo).to.equal('qux')
      expect(target.baz).to.equal(2)
      expect(target.extra).to.equal(true)
    })
  })

  describe('applyDiff with filter', () => {
    it('only applies changes that pass the filter', () => {
      const target = { foo: 'bar', baz: 1 }
      const source = { foo: 'qux', baz: 2 }
      DeepDiff.applyDiff(target, source, (_t, _s, change) => {
        return change.path[change.path.length - 1] === 'foo'
      })
      expect(target.foo).to.equal('qux')
      expect(target.baz).to.equal(1)
    })

    it('applies all changes when filter always returns true', () => {
      const target = { foo: 'bar', baz: 1 }
      const source = { foo: 'qux', baz: 2 }
      DeepDiff.applyDiff(target, source, () => true)
      expect(target.foo).to.equal('qux')
      expect(target.baz).to.equal(2)
    })

    it('applies no changes when filter always returns false', () => {
      const target = { foo: 'bar', baz: 1 }
      const source = { foo: 'qux', baz: 2 }
      DeepDiff.applyDiff(target, source, () => false)
      expect(target.foo).to.equal('bar')
      expect(target.baz).to.equal(1)
    })
  })

  describe('applyChange two-argument form', () => {
    it('accepts (target, change) with no source argument', () => {
      const target = { foo: 'bar' }
      DeepDiff.applyChange(target, { kind: 'E', path: ['foo'], lhs: 'bar', rhs: 'baz' })
      expect(target.foo).to.equal('baz')
    })
  })

  describe('symbol-keyed diffs round-trip', () => {
    it('can apply and revert a symbol-keyed change', () => {
      const sym = Symbol('key')
      const lhs = { [sym]: 'original' }
      const rhs = { [sym]: 'changed' }
      const diffs = DeepDiff.diff(lhs, rhs)

      const applyTarget = { [sym]: 'original' }
      DeepDiff.applyChange(applyTarget, lhs, diffs[0])
      expect(applyTarget[sym]).to.equal('changed')

      const revertTarget = { [sym]: 'changed' }
      DeepDiff.revertChange(revertTarget, lhs, diffs[0])
      expect(revertTarget[sym]).to.equal('original')
    })
  })

  describe('applyChange with deletion (kind D)', () => {
    it('removes the property from the target', () => {
      const target = { foo: 'bar', baz: 1 }
      const diffs = DeepDiff.diff({ foo: 'bar', baz: 1 }, { foo: 'bar' })
      DeepDiff.applyChange(target, {}, diffs[0])
      expect(target).to.not.have.property('baz')
    })
  })

  describe('revertChange for array deletions', () => {
    it('restores a deleted array element (revertArrayChange else-branch kind D)', () => {
      const lhs = { arr: [1, 2, 3] }
      const rhs = { arr: [1, 2] }
      const target = { arr: [1, 2] }
      const diffs = DeepDiff.diff(lhs, rhs)
      DeepDiff.revertChange(target, lhs, diffs[0])
      expect(target.arr[2]).to.equal(3)
    })

    it('reverts a top-level array addition using the target directly (no path on diff)', () => {
      // diff on a top-level array produces a DiffArray with no path property, so
      // revertChange must fall back to operating on the target itself.
      const lhs = [1, 2]
      const rhs = [1, 2, 3]
      const target = [1, 2, 3]
      const diffs = DeepDiff.diff(lhs, rhs)
      DeepDiff.revertChange(target, lhs, diffs[0])
      expect(target).to.have.length(2)
      expect(target[2]).to.equal(undefined)
    })
  })

  describe('applyArrayChange with item that has a sub-path', () => {
    it('applies an edit to a nested property of an array element (kind E)', () => {
      const target = { arr: [{ x: 1 }] }
      const change = { kind: 'A', path: ['arr'], index: 0, item: { kind: 'E', path: ['x'], lhs: 1, rhs: 2 } }
      DeepDiff.applyChange(target, {}, change)
      expect(target.arr[0].x).to.equal(2)
    })

    it('deletes a nested property of an array element (kind D)', () => {
      const target = { arr: [{ x: 1 }] }
      const change = { kind: 'A', path: ['arr'], index: 0, item: { kind: 'D', path: ['x'], lhs: 1 } }
      DeepDiff.applyChange(target, {}, change)
      expect(target.arr[0]).to.not.have.property('x')
    })

    it('adds a nested property to an array element (kind N)', () => {
      const target = { arr: [{}] }
      const change = { kind: 'A', path: ['arr'], index: 0, item: { kind: 'N', path: ['y'], rhs: 42 } }
      DeepDiff.applyChange(target, {}, change)
      expect(target.arr[0].y).to.equal(42)
    })

    it('navigates a multi-segment path to edit a deeply nested property (kind E)', () => {
      const target = { arr: [{ nested: { x: 1 } }] }
      const change = {
        kind: 'A',
        path: ['arr'],
        index: 0,
        item: { kind: 'E', path: ['nested', 'x'], lhs: 1, rhs: 2 }
      }
      DeepDiff.applyChange(target, {}, change)
      expect(target.arr[0].nested.x).to.equal(2)
    })

    it('applies a nested array change inside an array element (kind A via sub-path)', () => {
      const target = { arr: [{ nested: [1, 2] }] }
      const change = {
        kind: 'A',
        path: ['arr'],
        index: 0,
        item: { kind: 'A', path: ['nested'], index: 2, item: { kind: 'N', rhs: 3 } }
      }
      DeepDiff.applyChange(target, {}, change)
      expect(target.arr[0].nested[2]).to.equal(3)
    })

    it('applies a nested array change without sub-path (kind A, else-branch)', () => {
      const target = { data: [[1, 2]] }
      const change = {
        kind: 'A',
        path: ['data'],
        index: 0,
        item: { kind: 'A', index: 2, item: { kind: 'N', rhs: 3 } }
      }
      DeepDiff.applyChange(target, {}, change)
      expect(target.data[0][2]).to.equal(3)
    })

    it('applies an edit to an array element without a sub-path (kind E, else-branch)', () => {
      const target = { data: [1, 2, 3] }
      const change = { kind: 'A', path: ['data'], index: 2, item: { kind: 'E', lhs: 3, rhs: 99 } }
      DeepDiff.applyChange(target, {}, change)
      expect(target.data[2]).to.equal(99)
    })
  })

  describe('revertArrayChange with item that has a sub-path', () => {
    it('reverts an edit to a nested property of an array element (kind E)', () => {
      const target = { arr: [{ x: 2 }] }
      const change = { kind: 'A', path: ['arr'], index: 0, item: { kind: 'E', path: ['x'], lhs: 1, rhs: 2 } }
      DeepDiff.revertChange(target, {}, change)
      expect(target.arr[0].x).to.equal(1)
    })

    it('reverts an addition by deleting the nested property (kind N)', () => {
      const target = { arr: [{ x: 2 }] }
      const change = { kind: 'A', path: ['arr'], index: 0, item: { kind: 'N', path: ['x'], rhs: 2 } }
      DeepDiff.revertChange(target, {}, change)
      expect(target.arr[0]).to.not.have.property('x')
    })

    it('reverts a deletion by restoring the nested property (kind D)', () => {
      const target = { arr: [{}] }
      const change = { kind: 'A', path: ['arr'], index: 0, item: { kind: 'D', path: ['x'], lhs: 1 } }
      DeepDiff.revertChange(target, {}, change)
      expect(target.arr[0].x).to.equal(1)
    })

    it('navigates a multi-segment path to revert a deeply nested property (kind E)', () => {
      const target = { arr: [{ nested: { x: 2 } }] }
      const change = {
        kind: 'A',
        path: ['arr'],
        index: 0,
        item: { kind: 'E', path: ['nested', 'x'], lhs: 1, rhs: 2 }
      }
      DeepDiff.revertChange(target, {}, change)
      expect(target.arr[0].nested.x).to.equal(1)
    })

    it('reverts a nested array change inside an array element (kind A via sub-path)', () => {
      const target = { arr: [{ nested: [1, 2, 3] }] }
      const change = {
        kind: 'A',
        path: ['arr'],
        index: 0,
        item: { kind: 'A', path: ['nested'], index: 2, item: { kind: 'N', rhs: 3 } }
      }
      DeepDiff.revertChange(target, {}, change)
      expect(target.arr[0].nested).to.have.length(2)
    })

    it('reverts a nested array change without sub-path (kind A, else-branch)', () => {
      const target = { data: [[1, 2, 3]] }
      const change = {
        kind: 'A',
        path: ['data'],
        index: 0,
        item: { kind: 'A', index: 2, item: { kind: 'N', rhs: 3 } }
      }
      DeepDiff.revertChange(target, {}, change)
      expect(target.data[0]).to.have.length(2)
    })
  })

  describe('prototype pollution protection', () => {
    it('applyChange ignores a change with __proto__ in its path', () => {
      const target = {}
      DeepDiff.applyChange(target, {}, { kind: 'N', path: ['__proto__', 'polluted'], rhs: true })
      expect(Object.prototype.polluted).to.equal(undefined)
      expect({}.polluted).to.equal(undefined)
    })

    it('applyChange ignores a change with constructor in its path', () => {
      const target = {}
      DeepDiff.applyChange(target, {}, { kind: 'N', path: ['constructor', 'polluted'], rhs: true })
      expect({}.polluted).to.equal(undefined)
    })

    it('applyChange ignores a change with prototype in its path', () => {
      const target = {}
      DeepDiff.applyChange(target, {}, { kind: 'N', path: ['prototype', 'polluted'], rhs: true })
      expect({}.polluted).to.equal(undefined)
    })

    it('applyChange ignores a direct write to __proto__', () => {
      const target = {}
      DeepDiff.applyChange(target, {}, { kind: 'N', path: ['__proto__'], rhs: { polluted: true } })
      expect({}.polluted).to.equal(undefined)
    })

    it('revertChange ignores a change with __proto__ in its path', () => {
      const target = {}
      DeepDiff.revertChange(target, {}, { kind: 'D', path: ['__proto__', 'polluted'], lhs: true })
      expect(Object.prototype.polluted).to.equal(undefined)
      expect({}.polluted).to.equal(undefined)
    })
  })

  describe('guard / no-op conditions', () => {
    const validChange = { kind: 'E', path: ['foo'], lhs: 'bar', rhs: 'baz' }

    it('applyChange is a no-op when target is null', () => {
      expect(() => DeepDiff.applyChange(null, {}, validChange)).to.not.throw()
    })

    it('applyChange is a no-op when change has no kind', () => {
      const target = { foo: 'bar' }
      DeepDiff.applyChange(target, {}, { path: ['foo'], lhs: 'bar', rhs: 'baz' })
      expect(target.foo).to.equal('bar')
    })

    it('applyChange two-argument form is a no-op when source has no kind', () => {
      const target = { foo: 'bar' }
      DeepDiff.applyChange(target, { path: ['foo'] })
      expect(target.foo).to.equal('bar')
    })

    it('revertChange is a no-op when target is falsy', () => {
      expect(() => DeepDiff.revertChange(null, {}, validChange)).to.not.throw()
    })

    it('revertChange is a no-op when source is falsy', () => {
      const target = { foo: 'baz' }
      expect(() => DeepDiff.revertChange(target, null, validChange)).to.not.throw()
      expect(target.foo).to.equal('baz')
    })

    it('applyDiff is a no-op when target is falsy', () => {
      expect(() => DeepDiff.applyDiff(null, { foo: 'bar' })).to.not.throw()
    })

    it('applyDiff is a no-op when source is falsy', () => {
      const target = { foo: 'bar' }
      expect(() => DeepDiff.applyDiff(target, null)).to.not.throw()
      expect(target.foo).to.equal('bar')
    })
  })
})
