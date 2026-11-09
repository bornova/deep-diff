import { expect } from 'chai'

import * as DeepDiff from '../src/index.js'

describe('deep-diff — applyChange, applyDiff and revertChange', () => {
  describe('Changes should be applied correctly', () => {
    it('applies all changes except to the name property via observableDiff', () => {
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
        if (d.path[d.path.length - 1] !== 'name') {
          DeepDiff.applyChange(lhs, rhs, d)
        }
      })

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

    it('materializes missing nested objects and arrays when applying individual changes to an empty object', () => {
      const nestedOne = {
        noChange: 'same',
        levelOne: {
          levelTwo: 'value'
        },
        arrayOne: [
          {
            objValue: 'value'
          }
        ]
      }

      const nestedTwo = {
        noChange: 'same',
        levelOne: {
          levelTwo: 'another value'
        },
        arrayOne: [
          {
            objValue: 'new value'
          },
          {
            objValue: 'more value'
          }
        ]
      }

      const diff = DeepDiff.diff(nestedOne, nestedTwo)

      const resultLevelOne = {}
      DeepDiff.applyChange(resultLevelOne, nestedTwo, diff[0])
      expect(resultLevelOne.levelOne).to.eql({ levelTwo: 'another value' })

      const resultAddedArrayObj = {}
      DeepDiff.applyChange(resultAddedArrayObj, nestedTwo, diff[1])
      expect(resultAddedArrayObj.arrayOne).to.be.an('array')
      expect(resultAddedArrayObj.arrayOne[1]).to.eql({ objValue: 'more value' })

      const resultEditedArrayObj = {}
      DeepDiff.applyChange(resultEditedArrayObj, nestedTwo, diff[2])
      expect(resultEditedArrayObj.arrayOne).to.be.an('array')
      expect(resultEditedArrayObj.arrayOne[0]).to.eql({ objValue: 'new value' })
    })

    it('applies nested array differences correctly (regression test for bug #10)', () => {
      const lhs = {
        id: 'Release',
        phases: [
          {
            id: 'Phase1',
            tasks: [{ id: 'Task1' }, { id: 'Task2' }]
          },
          {
            id: 'Phase2',
            tasks: [{ id: 'Task3' }]
          }
        ]
      }

      const rhs = {
        id: 'Release',
        phases: [
          {
            id: 'Phase2',
            tasks: [{ id: 'Task3' }]
          },
          {
            id: 'Phase1',
            tasks: [{ id: 'Task1' }, { id: 'Task2' }]
          }
        ]
      }

      const target = JSON.parse(JSON.stringify(lhs))
      DeepDiff.applyDiff(target, rhs)
      expect(target).to.eql(rhs)
    })

    it('applies diffs between two top-level arrays (regression test for bug #35)', () => {
      const lhs = ['a', 'a', 'a']
      const rhs = ['a']
      const differences = DeepDiff.diff(lhs, rhs)

      for (const change of differences) {
        DeepDiff.applyChange(lhs, true, change)
      }

      expect(lhs).to.eql(['a'])
    })

    it('round-trips a composite structure via applyChange and revertChange', () => {
      const sym = Symbol('tag')
      const lhs = {
        [sym]: 'v1',
        keep: 42,
        removed: 'gone',
        undef: undefined,
        nested: { a: [1, { x: 'old' }, 3] },
        map: new Map([
          ['k1', 'oldVal'],
          ['k2', 'deleteMe']
        ])
      }
      const rhs = {
        [sym]: 'v2',
        keep: 42,
        added: 'new',
        undef: 'definedNow',
        nested: { a: [1, { x: 'new' }] },
        map: new Map([
          ['k1', 'newVal'],
          ['k3', 'addedKey']
        ])
      }

      const changes = DeepDiff.diff(lhs, rhs)
      const target = {
        [sym]: 'v1',
        keep: 42,
        removed: 'gone',
        undef: undefined,
        nested: { a: [1, { x: 'old' }, 3] },
        map: new Map([
          ['k1', 'oldVal'],
          ['k2', 'deleteMe']
        ])
      }

      for (const change of changes) {
        DeepDiff.applyChange(target, change)
      }
      expect(target).to.eql(rhs)
      expect(target[sym]).to.equal('v2')

      for (let i = changes.length - 1; i >= 0; i--) {
        DeepDiff.revertChange(target, changes[i])
      }
      expect(target).to.eql(lhs)
      expect(target[sym]).to.equal('v1')
      expect('undef' in target).to.equal(true)
      expect('added' in target).to.equal(false)
    })
  })

  describe('revertChange', () => {
    it('does not throw on a path-less diff', () => {
      const diffs = DeepDiff.diff(null, undefined)
      expect(() => DeepDiff.revertChange({}, {}, diffs[0])).to.not.throw()
    })

    it('reverts an array element addition (A)', () => {
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
      const lhs = { a: [{ b: 'old' }] }
      const rhs = { a: [{ b: 'new' }] }
      const diffs = DeepDiff.diff(lhs, rhs)
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

  describe('applyChange and revertChange two-argument form', () => {
    it('accepts (target, change) with no source argument', () => {
      const target = { foo: 'bar' }
      DeepDiff.applyChange(target, { kind: 'E', path: ['foo'], lhs: 'bar', rhs: 'baz' })
      expect(target.foo).to.equal('baz')

      DeepDiff.revertChange(target, { kind: 'E', path: ['foo'], lhs: 'bar', rhs: 'baz' })
      expect(target.foo).to.equal('bar')
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

  describe('revertChange for array deletions and top-level arrays', () => {
    it('restores a deleted array element', () => {
      const lhs = { arr: [1, 2, 3] }
      const rhs = { arr: [1, 2] }
      const target = { arr: [1, 2] }
      const diffs = DeepDiff.diff(lhs, rhs)
      DeepDiff.revertChange(target, lhs, diffs[0])
      expect(target.arr[2]).to.equal(3)
    })

    it('reverts a top-level array addition when the diff has no path', () => {
      const lhs = [1, 2]
      const rhs = [1, 2, 3]
      const target = [1, 2, 3]
      const diffs = DeepDiff.diff(lhs, rhs)
      DeepDiff.revertChange(target, lhs, diffs[0])
      expect(target).to.have.length(2)
      expect(target[2]).to.equal(undefined)
    })
  })

  describe('applyChange on nested array elements', () => {
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

    it('navigates a multi-segment sub-path to edit a deeply nested property (kind E)', () => {
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

    it('applies a nested array change inside an array element via sub-path (kind A)', () => {
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

    it('applies a directly nested array change without a sub-path (kind A)', () => {
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

    it('applies an edit directly to an array element without a sub-path (kind E)', () => {
      const target = { data: [1, 2, 3] }
      const change = { kind: 'A', path: ['data'], index: 2, item: { kind: 'E', lhs: 3, rhs: 99 } }
      DeepDiff.applyChange(target, {}, change)
      expect(target.data[2]).to.equal(99)
    })
  })

  describe('revertChange on nested array elements', () => {
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

    it('navigates a multi-segment sub-path to revert a deeply nested property (kind E)', () => {
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

    it('reverts a nested array change inside an array element via sub-path (kind A)', () => {
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

    it('reverts a directly nested array change without a sub-path (kind A)', () => {
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

    it('applyChange ignores an array change index targeting constructor', () => {
      const target = {}
      const maliciousChange = {
        kind: 'A',
        index: 'constructor',
        item: {
          kind: 'A',
          index: 'prototype',
          item: {
            kind: 'A',
            index: 'polluted',
            item: {
              kind: 'N',
              rhs: 'yes'
            }
          }
        }
      }
      DeepDiff.applyChange(target, maliciousChange)
      expect(Object.prototype.polluted).to.equal(undefined)
      expect({}.polluted).to.equal(undefined)
    })

    it('applyChange ignores an array change index targeting __proto__', () => {
      const target = []
      const maliciousChange = {
        kind: 'A',
        index: '__proto__',
        item: {
          kind: 'N',
          rhs: { polluted: 'yes' }
        }
      }
      DeepDiff.applyChange(target, maliciousChange)
      expect(Object.getPrototypeOf(target)).to.not.have.property('polluted')
    })

    it('applyChange ignores a nested array change with __proto__ in item.path', () => {
      const target = [{}]
      const maliciousChange = {
        kind: 'A',
        index: 0,
        item: {
          kind: 'A',
          path: ['__proto__'],
          index: 'polluted',
          item: {
            kind: 'N',
            rhs: 'yes'
          }
        }
      }
      DeepDiff.applyChange(target, maliciousChange)
      expect(Object.prototype.polluted).to.equal(undefined)
      expect({}.polluted).to.equal(undefined)
    })
  })

  describe('missing container materialization and edge cases', () => {
    it('materializes missing object and array elements in arrayChange', () => {
      const targetObjSlot = { arr: [] }
      DeepDiff.applyChange(targetObjSlot, {
        kind: 'A',
        path: ['arr'],
        index: 0,
        item: { kind: 'N', path: ['x'], rhs: 42 }
      })
      expect(targetObjSlot.arr[0]).to.eql({ x: 42 })

      const targetNestedArrSlot = { arr: [] }
      DeepDiff.applyChange(targetNestedArrSlot, {
        kind: 'A',
        path: ['arr'],
        index: 0,
        item: { kind: 'N', path: [0, 'x'], rhs: 7 }
      })
      expect(targetNestedArrSlot.arr[0]).to.be.an('array')
      expect(targetNestedArrSlot.arr[0][0]).to.eql({ x: 7 })

      const targetDirectArrSlot = { arr: [] }
      DeepDiff.applyChange(targetDirectArrSlot, {
        kind: 'A',
        path: ['arr'],
        index: 0,
        item: { kind: 'A', index: 0, item: { kind: 'N', rhs: 99 } }
      })
      expect(targetDirectArrSlot.arr[0]).to.eql([99])

      const targetPrimitiveIntermediate = { a: 42 }
      DeepDiff.applyChange(targetPrimitiveIntermediate, {
        kind: 'N',
        path: ['a', 'b'],
        rhs: 'replaced'
      })
      expect(targetPrimitiveIntermediate.a).to.eql({ b: 'replaced' })
    })

    it('handles empty array path: [] identically to undefined path and ignores unknown change kinds', () => {
      const target = [1, 2]
      DeepDiff.applyChange(target, {
        kind: 'A',
        path: [],
        index: 2,
        item: { kind: 'N', rhs: 3 }
      })
      expect(target).to.eql([1, 2, 3])

      const obj = { a: 1 }
      DeepDiff.applyChange(obj, { kind: 'UNKNOWN', path: ['a'], rhs: 2 })
      expect(obj.a).to.equal(1)

      DeepDiff.applyChange(target, {
        kind: 'A',
        index: 0,
        item: { kind: 'UNKNOWN', rhs: 99 }
      })
      expect(target[0]).to.equal(1)
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

  describe('Map patching support', () => {
    it('applies Map changes correctly', () => {
      const target = new Map([['a', 1]])
      const source = new Map([
        ['a', 2],
        ['b', 3]
      ])
      DeepDiff.applyDiff(target, source)

      expect(target.get('a')).to.equal(2)
      expect(target.get('b')).to.equal(3)
    })

    it('reverts Map changes correctly', () => {
      const target = new Map([
        ['a', 2],
        ['b', 3]
      ])
      const source = new Map([['a', 1]])
      const changes = DeepDiff.diff(source, target)

      expect(changes).to.be.an('array')
      for (const change of changes) {
        DeepDiff.revertChange(target, source, change)
      }

      expect(target.get('a')).to.equal(1)
      expect(target.has('b')).to.equal(false)
    })

    it('applies nested Map changes correctly', () => {
      const target = { nested: new Map([['x', [1, 2]]]) }
      const source = { nested: new Map([['x', [1, 2, 3]]]) }
      DeepDiff.applyDiff(target, source)

      expect(target.nested.get('x')).to.eql([1, 2, 3])
    })

    it('materializes missing intermediate containers on a Map in walkPath', () => {
      const target = new Map([['a', new Map()]])
      const source = new Map([['a', new Map([['b', { c: 1 }]])]])
      const diff = DeepDiff.diff(target, source)

      const emptyTarget = new Map()
      DeepDiff.applyChange(emptyTarget, source, diff[0])
      expect(emptyTarget.get('a')).to.be.an('object')
      expect(emptyTarget.get('a').b.c).to.equal(1)
    })

    it('materializes missing nested array slots on a Map', () => {
      const target = new Map([['a', []]])
      const source = new Map([['a', [1]]])
      const diff = DeepDiff.diff(target, source)

      const emptyTarget = new Map()
      DeepDiff.applyChange(emptyTarget, source, diff[0])
      expect(emptyTarget.get('a')).to.eql([1])
    })
  })
})
