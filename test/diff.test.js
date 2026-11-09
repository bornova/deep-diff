import { expect } from 'chai'
import vm from 'node:vm'

import * as DeepDiff from '../src/index.js'
import { getOrderIndependentHash, leafEqual } from '../src/utils.js'

describe('deep-diff — models and constants', () => {
  it('exposes frozen KIND constants', () => {
    expect(DeepDiff.KIND).to.eql({
      NEW: 'N',
      EDIT: 'E',
      ARRAY: 'A',
      DELETED: 'D'
    })
    expect(Object.isFrozen(DeepDiff.KIND)).to.equal(true)
  })

  it('emits instances of Diff and the corresponding Diff* subclasses with frozen paths', () => {
    const changes = DeepDiff.diff({ edited: 1, deleted: 2, arr: [1] }, { edited: 10, added: 3, arr: [1, 2] })

    const edit = changes.find((c) => c.kind === DeepDiff.KIND.EDIT)
    const deleted = changes.find((c) => c.kind === DeepDiff.KIND.DELETED)
    const added = changes.find((c) => c.kind === DeepDiff.KIND.NEW)
    const arrayChange = changes.find((c) => c.kind === DeepDiff.KIND.ARRAY)

    expect(edit).to.be.an.instanceOf(DeepDiff.Diff)
    expect(edit).to.be.an.instanceOf(DeepDiff.DiffEdit)
    expect(Object.isFrozen(edit.path)).to.equal(true)

    expect(deleted).to.be.an.instanceOf(DeepDiff.Diff)
    expect(deleted).to.be.an.instanceOf(DeepDiff.DiffDeleted)
    expect(Object.isFrozen(deleted.path)).to.equal(true)

    expect(added).to.be.an.instanceOf(DeepDiff.Diff)
    expect(added).to.be.an.instanceOf(DeepDiff.DiffNew)
    expect(Object.isFrozen(added.path)).to.equal(true)

    expect(arrayChange).to.be.an.instanceOf(DeepDiff.Diff)
    expect(arrayChange).to.be.an.instanceOf(DeepDiff.DiffArray)
    expect(arrayChange.item).to.be.an.instanceOf(DeepDiff.DiffNew)
    expect(Object.isFrozen(arrayChange.path)).to.equal(true)
  })

  it('omits path when constructed with undefined or an empty array', () => {
    const withoutPath = new DeepDiff.DiffEdit(undefined, 1, 2)
    const withEmptyPath = new DeepDiff.DiffEdit([], 1, 2)

    expect(withoutPath).to.not.have.property('path')
    expect(withEmptyPath).to.not.have.property('path')
  })
})

describe('deep-diff — diff and observableDiff', () => {
  const empty = {}

  describe('A target that has no properties', () => {
    it('shows no differences when compared to another empty object', () => {
      expect(DeepDiff.diff(empty, {})).to.equal(undefined)
    })

    describe('when compared to a different type of keyless object', () => {
      const comparandTuples = [
        ['an array', { key: [] }],
        ['an object', { key: {} }],
        ['a date', { key: new Date() }],
        ['a null', { key: null }],
        ['a regexp literal', { key: /a/ }],
        ['Math', { key: Math }]
      ]

      comparandTuples.forEach((lhsTuple) => {
        comparandTuples.forEach((rhsTuple) => {
          if (lhsTuple[0] === rhsTuple[0]) {
            return
          }

          it('shows differences when comparing ' + lhsTuple[0] + ' to ' + rhsTuple[0], () => {
            const diff = DeepDiff.diff(lhsTuple[1], rhsTuple[1])

            expect(diff).to.be.an('array').with.lengthOf(1)
            expect(diff[0].kind).to.equal('E')
            expect(diff[0].path).to.eql(['key'])
          })
        })
      })
    })

    describe('when compared with an object having other properties', () => {
      const comparand = {
        other: 'property',
        another: 13.13
      }

      it('the differences are reported', () => {
        const diff = DeepDiff.diff(empty, comparand)

        expect(diff).to.be.an('array').with.lengthOf(2)

        expect(diff[0].kind).to.equal('N')
        expect(diff[0].path).to.eql(['other'])
        expect(diff[0].rhs).to.equal('property')

        expect(diff[1].kind).to.equal('N')
        expect(diff[1].path).to.eql(['another'])
        expect(diff[1].rhs).to.equal(13.13)
      })
    })
  })

  describe('A target that has one property', () => {
    const lhs = {
      one: 'property'
    }

    it('shows no differences when compared to itself', () => {
      expect(DeepDiff.diff(lhs, lhs)).to.equal(undefined)
    })

    it('shows the property as removed when compared to an empty object', () => {
      const diff = DeepDiff.diff(lhs, empty)

      expect(diff).to.be.an('array').with.lengthOf(1)
      expect(diff[0].kind).to.equal('D')
      expect(diff[0].path).to.eql(['one'])
      expect(diff[0].lhs).to.equal('property')
    })

    it('shows the property as edited when compared to an object with null', () => {
      const diff = DeepDiff.diff(lhs, {
        one: null
      })

      expect(diff).to.be.an('array').with.lengthOf(1)
      expect(diff[0].kind).to.equal('E')
      expect(diff[0].path).to.eql(['one'])
      expect(diff[0].lhs).to.equal('property')
      expect(diff[0].rhs).to.equal(null)
    })

    it('shows the property as edited when compared to an array', () => {
      const diff = DeepDiff.diff(lhs, ['one'])

      expect(diff).to.be.an('array').with.lengthOf(1)
      expect(diff[0].kind).to.equal('E')
      expect(diff[0]).to.not.have.property('path')
    })
  })

  describe('A target that has null value', () => {
    const lhs = {
      key: null
    }

    it('shows no differences when compared to itself', () => {
      expect(DeepDiff.diff(lhs, lhs)).to.equal(undefined)
    })

    it('shows the property as removed when compared to an empty object', () => {
      const diff = DeepDiff.diff(lhs, empty)

      expect(diff).to.be.an('array').with.lengthOf(1)
      expect(diff[0].kind).to.equal('D')
      expect(diff[0].path).to.eql(['key'])
      expect(diff[0].lhs).to.equal(null)
    })

    it('shows the property is changed when compared to an object that has value', () => {
      const diff = DeepDiff.diff(lhs, {
        key: 'value'
      })

      expect(diff).to.be.an('array').with.lengthOf(1)
      expect(diff[0].kind).to.equal('E')
      expect(diff[0].path).to.eql(['key'])
      expect(diff[0].lhs).to.equal(null)
      expect(diff[0].rhs).to.equal('value')
    })

    it('shows that an object property is changed when it is set to null', () => {
      const diff = DeepDiff.diff(
        {
          key: {
            nested: 'value'
          }
        },
        {
          key: null
        }
      )

      expect(diff).to.be.an('array').with.lengthOf(1)
      expect(diff[0].kind).to.equal('E')
      expect(diff[0].path).to.eql(['key'])
      expect(diff[0].lhs).to.eql({ nested: 'value' })
      expect(diff[0].rhs).to.equal(null)
    })
  })

  describe('A target that has a date value', () => {
    const lhs = {
      key: new Date(555555555555)
    }

    it('shows the property is changed with a new date value', () => {
      const diff = DeepDiff.diff(lhs, {
        key: new Date(777777777777)
      })

      expect(diff).to.be.an('array').with.lengthOf(1)
      expect(diff[0].kind).to.equal('E')
      expect(diff[0].path).to.eql(['key'])
    })
  })

  describe('A target that has a NaN', () => {
    const lhs = {
      key: NaN
    }

    it('shows the property is changed when compared to another number', () => {
      const diff = DeepDiff.diff(lhs, {
        key: 0
      })

      expect(diff).to.be.an('array').with.lengthOf(1)
      expect(diff[0].kind).to.equal('E')
      expect(diff[0].path).to.eql(['key'])
    })

    it('shows no differences when compared to another NaN', () => {
      const diff = DeepDiff.diff(lhs, {
        key: NaN
      })

      expect(diff).to.equal(undefined)
      expect(leafEqual(NaN, NaN)).to.equal(true)
      expect(leafEqual(1, '1')).to.equal(false)
    })
  })

  describe('When filtering keys', () => {
    const lhs = {
      enhancement: 'Filter/Ignore Keys?',
      numero: 11,
      submittedBy: 'ericclemmons',
      supportedBy: ['ericclemmons'],
      status: 'open'
    }

    const rhs = {
      enhancement: 'Filter/Ignore Keys?',
      numero: 11,
      submittedBy: 'ericclemmons',
      supportedBy: ['ericclemmons', 'TylerGarlick', 'flitbit', 'ergdev'],
      status: 'closed',
      fixedBy: 'flitbit'
    }

    describe('if the filtered property is an array', () => {
      it('changes to the array do not appear as a difference', () => {
        const prefilter = function (path, key) {
          return key === 'supportedBy'
        }

        const diff = DeepDiff.diff(lhs, rhs, { prefilter })

        expect(diff).to.be.an('array').with.lengthOf(2)
        expect(diff[0].kind).to.equal('E')
        expect(diff[0].path).to.eql(['status'])
        expect(diff[1].kind).to.equal('N')
        expect(diff[1].path).to.eql(['fixedBy'])
      })
    })

    describe('if the filtered config is passed as an object', () => {
      it('skips properties when prefilter.prefilter returns truthy', () => {
        const prefilter = function (path, key) {
          return key === 'supportedBy'
        }

        const diff = DeepDiff.diff(lhs, rhs, { prefilter: { prefilter } })

        expect(diff).to.be.an('array').with.lengthOf(2)
        expect(diff[0].kind).to.equal('E')
        expect(diff[0].path).to.eql(['status'])
        expect(diff[1].kind).to.equal('N')
        expect(diff[1].path).to.eql(['fixedBy'])
      })

      it('does not skip properties when prefilter.prefilter returns falsy', () => {
        const result = DeepDiff.diff({ a: 1, b: 2 }, { a: 99, b: 99 }, { prefilter: { prefilter: () => false } })
        expect(result).to.be.an('array').with.lengthOf(2)
      })
    })

    describe('if the filtered property is not an array', () => {
      it('changes do not appear as a difference', () => {
        const prefilter = function (path, key) {
          return key === 'fixedBy'
        }

        const diff = DeepDiff.diff(lhs, rhs, { prefilter })

        expect(diff).to.be.an('array').with.lengthOf(4)
        expect(diff[0].kind).to.equal('A')
        expect(diff[1].kind).to.equal('A')
        expect(diff[2].kind).to.equal('A')
        expect(diff[3].kind).to.equal('E')
      })
    })

    it('protects currentPath from mutation inside prefilter and normalize callbacks', () => {
      const changes = DeepDiff.diff(
        { a: { b: 1 }, c: { d: 2 } },
        { a: { b: 10 }, c: { d: 20 } },
        {
          prefilter: {
            prefilter(path) {
              path.push('corrupted')
              return false
            },
            normalize(path) {
              path.push('corrupted-normalize')
              return false
            }
          }
        }
      )

      expect(changes).to.be.an('array').with.lengthOf(2)
      expect(changes[0].path).to.eql(['a', 'b'])
      expect(changes[1].path).to.eql(['c', 'd'])
    })
  })

  describe('Can normalize properties before diffing', () => {
    const testLHS = {
      array: [1, 2, 3, 4, 5]
    }

    const testRHS = {
      array: '1/2/3/4/5'
    }

    it('changes do not appear as a difference', () => {
      const filter = {
        normalize: function (path, key, lhs, rhs) {
          expect(key).to.equal('array')

          if (Array.isArray(lhs)) {
            lhs = lhs.join('/')
          }
          if (Array.isArray(rhs)) {
            rhs = rhs.join('/')
          }
          return [lhs, rhs]
        }
      }

      expect(DeepDiff.diff(testLHS, testRHS, { prefilter: filter })).to.equal(undefined)
      expect(DeepDiff.diff(testRHS, testLHS, { prefilter: filter })).to.equal(undefined)
    })

    it('falsy return does not normalize', () => {
      const filter = {
        normalize: function () {
          return false
        }
      }

      expect(DeepDiff.diff(testLHS, testRHS, { prefilter: filter })).to.be.an('array')
      expect(DeepDiff.diff(testRHS, testLHS, { prefilter: filter })).to.be.an('array')
    })

    it('treats properties normalized to [undefined, undefined] as equal even when missing on one side', () => {
      const filter = {
        normalize: (_path, _key, lhs, rhs) => [lhs ?? undefined, rhs ?? undefined]
      }

      expect(DeepDiff.diff({ a: null }, {}, { prefilter: filter })).to.equal(undefined)
      expect(DeepDiff.diff({}, { a: null }, { prefilter: filter })).to.equal(undefined)
    })
  })

  describe('A target that has nested values', () => {
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

    it('shows no differences when compared to itself', () => {
      expect(DeepDiff.diff(nestedOne, nestedOne)).to.equal(undefined)
    })

    it('shows the properties as removed when compared to an empty object', () => {
      const diff = DeepDiff.diff(nestedOne, empty)

      expect(diff).to.be.an('array').with.lengthOf(3)
      expect(diff[0].kind).to.equal('D')
      expect(diff[0].path).to.eql(['noChange'])
      expect(diff[1].kind).to.equal('D')
      expect(diff[1].path).to.eql(['levelOne'])
      expect(diff[2].kind).to.equal('D')
      expect(diff[2].path).to.eql(['arrayOne'])
    })

    it('shows the nested properties that changed when compared to another object', () => {
      const diff = DeepDiff.diff(nestedOne, nestedTwo)

      expect(diff).to.be.an('array').with.lengthOf(3)
      expect(diff[0].kind).to.equal('E')
      expect(diff[0].path).to.eql(['levelOne', 'levelTwo'])
      expect(diff[0].lhs).to.equal('value')
      expect(diff[0].rhs).to.equal('another value')

      expect(diff[1].kind).to.equal('A')
      expect(diff[1].path).to.eql(['arrayOne'])
      expect(diff[1].index).to.equal(1)
      expect(diff[1].item.kind).to.equal('N')
      expect(diff[1].item.rhs).to.eql({ objValue: 'more value' })

      expect(diff[2].kind).to.equal('E')
      expect(diff[2].path).to.eql(['arrayOne', 0, 'objValue'])
      expect(diff[2].lhs).to.equal('value')
      expect(diff[2].rhs).to.equal('new value')
    })

    it('shows the properties as added when compared to an empty object on left', () => {
      const diff = DeepDiff.diff(empty, nestedOne)

      expect(diff).to.be.an('array').with.lengthOf(3)
      expect(diff[0].kind).to.equal('N')
      expect(diff[0].path).to.eql(['noChange'])
      expect(diff[1].kind).to.equal('N')
      expect(diff[1].path).to.eql(['levelOne'])
      expect(diff[2].kind).to.equal('N')
      expect(diff[2].path).to.eql(['arrayOne'])
    })
  })

  describe('regression test for bug #10', () => {
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

    it('detects the correct number of differences in nested arrays', () => {
      const diff = DeepDiff.diff(lhs, rhs)
      expect(diff).to.be.an('array').with.lengthOf(6)
    })
  })

  describe('Objects from different contexts/frames', () => {
    it('can compare date instances from a different context', () => {
      const context = vm.createContext()
      const lhs = vm.runInNewContext('new Date(2010, 1, 1)', context)
      const rhs = vm.runInNewContext('new Date(2010, 1, 1)', context)

      expect(DeepDiff.diff(lhs, rhs)).to.equal(undefined)
    })

    it('can compare RegExp, Map, Set, TypedArray, Array, and DataView instances across realms', () => {
      const ctx = vm.createContext()
      const crossRegex = vm.runInNewContext('/abc/gi', ctx)
      const crossMap = vm.runInNewContext('new Map([["k", 42]])', ctx)
      const crossSet = vm.runInNewContext('new Set([1, 2])', ctx)
      const crossUint8 = vm.runInNewContext('new Uint8Array([1, 2, 3])', ctx)
      const crossArray = vm.runInNewContext('[1, 2, 3]', ctx)
      const crossDataView = vm.runInNewContext('new DataView(new ArrayBuffer(4))', ctx)

      expect(DeepDiff.diff(crossRegex, /abc/gi)).to.equal(undefined)
      expect(DeepDiff.diff(crossMap, new Map([['k', 42]]))).to.equal(undefined)
      expect(DeepDiff.diff(crossSet, new Set([2, 1]))).to.equal(undefined)
      expect(DeepDiff.diff(crossUint8, new Uint8Array([1, 2, 3]))).to.equal(undefined)
      expect(DeepDiff.diff(crossUint8, new Uint8Array([1, 2, 9])))
        .to.be.an('array')
        .with.lengthOf(1)
      expect(DeepDiff.diff(crossArray, [1, 2, 3])).to.equal(undefined)
      expect(DeepDiff.diff(crossDataView, new Uint8Array(4)))
        .to.be.an('array')
        .with.lengthOf(1)
    })
  })

  describe('Comparing regexes should work', () => {
    const lhs = /foo/
    const rhs = /foo/i

    it('can compare regex instances', () => {
      const diff = DeepDiff.diff(lhs, rhs)

      expect(diff).to.be.an('array').with.lengthOf(1)
      expect(diff[0].kind).to.equal('E')
      expect(diff[0]).to.not.have.property('path')
      expect(diff[0].lhs).to.equal('/foo/')
      expect(diff[0].rhs).to.equal('/foo/i')
    })
  })

  describe('subject.toString is not a function', () => {
    const lhs = {
      left: 'yes',
      right: 'no'
    }

    const rhs = {
      left: {
        toString: true
      },
      right: 'no'
    }

    it('should not throw a TypeError', () => {
      const diff = DeepDiff.diff(lhs, rhs)

      expect(diff).to.be.an('array').with.lengthOf(1)
    })
  })

  describe('regression test for issue #83', () => {
    const lhs = {
      date: null
    }

    const rhs = {
      date: null
    }

    it('should not detect a difference', () => {
      expect(DeepDiff.diff(lhs, rhs)).to.equal(undefined)
    })
  })

  describe('regression test for issue #70', () => {
    it('should detect a difference with undefined property on lhs', () => {
      const diff = DeepDiff.diff({ foo: undefined }, {})

      expect(diff).to.be.an('array').with.lengthOf(1)
      expect(diff[0].kind).to.equal('D')
      expect(diff[0].path).to.eql(['foo'])
      expect(diff[0].lhs).to.equal(undefined)
    })

    it('should detect a difference with undefined property on rhs', () => {
      const diff = DeepDiff.diff({}, { foo: undefined })

      expect(diff).to.be.an('array').with.lengthOf(1)
      expect(diff[0].kind).to.equal('N')
      expect(diff[0].path).to.eql(['foo'])
      expect(diff[0].rhs).to.equal(undefined)
    })
  })

  describe('regression test for issue #98', () => {
    const lhs = { foo: undefined }
    const rhs = { foo: undefined }

    it('should not detect a difference with two undefined property values', () => {
      expect(DeepDiff.diff(lhs, rhs)).to.equal(undefined)
    })
  })

  describe('regression tests for issue #102', () => {
    it('should not throw a TypeError when comparing null to undefined', () => {
      const diff = DeepDiff.diff(null, undefined)

      expect(diff).to.be.an('array').with.lengthOf(1)
      expect(diff[0].kind).to.equal('D')
      expect(diff[0].lhs).to.equal(null)
    })

    it('should not throw a TypeError when lhs is a null-prototype object', () => {
      const diff = DeepDiff.diff(Object.create(null), { foo: undefined })

      expect(diff).to.be.an('array').with.lengthOf(1)
      expect(diff[0].kind).to.equal('N')
      expect(diff[0].rhs).to.equal(undefined)
    })
  })

  describe('Diff-ing symbol-based keys should work', () => {
    it('should work with symbol keys', () => {
      const lhs = {
        [Symbol.iterator]: 'Iterator',
        foo: 'bar'
      }

      const rhs = {
        foo: 'baz'
      }

      const res = DeepDiff.diff(lhs, rhs)
      expect(res).to.be.an('array').with.lengthOf(2)

      let changed = 0
      let deleted = 0
      for (const difference of res) {
        if (difference.kind === 'D') {
          deleted += 1
        } else if (difference.kind === 'E') {
          changed += 1
        }
      }

      expect(changed).to.equal(1)
      expect(deleted).to.equal(1)
    })
  })

  describe('Empty string object keys', () => {
    it('detects a new rhs-only property with an empty string key', () => {
      const diff = DeepDiff.diff({ a: 1 }, { a: 1, '': 'new' })
      expect(diff).to.be.an('array').with.lengthOf(1)
      expect(diff[0].kind).to.equal('N')
      expect(diff[0].path).to.eql([''])
    })

    it('detects a deleted lhs-only property with an empty string key', () => {
      const diff = DeepDiff.diff({ a: 1, '': 'old' }, { a: 1 })
      expect(diff).to.be.an('array').with.lengthOf(1)
      expect(diff[0].kind).to.equal('D')
      expect(diff[0].path).to.eql([''])
    })

    it('detects an edit to a property with an empty string key', () => {
      const diff = DeepDiff.diff({ '': 'old' }, { '': 'new' })
      expect(diff).to.be.an('array').with.lengthOf(1)
      expect(diff[0].kind).to.equal('E')
      expect(diff[0].path).to.eql([''])
    })
  })

  describe('Correct diff kind should be reported', () => {
    it('should report "N" when a new property/element was added', () => {
      const lhs = {
        foo: 'bar'
      }

      const rhs = {
        foo: 'baz',
        faz: 'bar'
      }

      const res = DeepDiff.diff(lhs, rhs)

      expect(res).to.be.an('array').with.lengthOf(2)
      expect(res[1].kind).to.equal('N')
    })

    it('should report "D" when a property/element was deleted', () => {
      const lhs = {
        foo: 'bar'
      }

      const rhs = {
        faz: 'bar'
      }

      const res = DeepDiff.diff(lhs, rhs)

      expect(res).to.be.an('array').with.lengthOf(2)
      expect(res[0].kind).to.equal('D')
    })

    it('should report "E" when a property/element was edited', () => {
      const lhs = {
        foo: 'bar'
      }

      const rhs = {
        foo: 'baz'
      }

      const res = DeepDiff.diff(lhs, rhs)

      expect(res).to.be.an('array').with.lengthOf(1)
      expect(res[0].kind).to.equal('E')
    })

    it('should report "A" when a change occurred within an array', () => {
      const lhs = {
        foo: 'bar',
        with: ['a', 'few', 'elements']
      }

      const rhs = {
        foo: 'bar',
        with: ['a', 'few', 'more', 'elements', { than: 'before' }]
      }

      const res = DeepDiff.diff(lhs, rhs)

      expect(res).to.be.an('array').with.lengthOf(3)
      expect(res[0].kind).to.equal('A')
    })
  })

  describe('circular reference handling', () => {
    it('terminates without throwing when lhs contains a circular reference', () => {
      const lhs = { a: 1 }
      lhs.self = lhs
      const rhs = { a: 2 }
      expect(() => DeepDiff.diff(lhs, rhs)).to.not.throw()
    })

    it('terminates without throwing when rhs contains a circular reference', () => {
      const lhs = { a: 1 }
      const rhs = { a: 2 }
      rhs.self = rhs
      expect(() => DeepDiff.diff(lhs, rhs)).to.not.throw()
    })

    it('terminates without throwing for a self-referential array with orderIndependent', () => {
      const arr = [1, 2, 3]
      arr.push(arr)
      expect(() => DeepDiff.diff(arr, arr, { orderIndependent: true })).to.not.throw()
    })

    it('treats two structurally-equal self-referential objects as equal', () => {
      const lhs = { val: 1 }
      lhs.self = lhs
      const rhs = { val: 1 }
      rhs.self = rhs
      expect(DeepDiff.diff(lhs, rhs)).to.equal(undefined)
    })

    it('records a DiffEdit when a cycle pairs with a non-cycle counterpart', () => {
      const lhs = { val: 1 }
      lhs.self = lhs
      const rhs = { val: 1, self: { val: 1 } }
      const diffs = DeepDiff.diff(lhs, rhs)
      expect(diffs).to.be.an('array')
      const selfDiff = diffs.find((d) => d.path && d.path[d.path.length - 1] === 'self')
      expect(selfDiff).to.exist
      expect(selfDiff.kind).to.equal('E')
    })

    it('does not falsely trigger cycle detection when lhs and rhs share an acyclic subtree at different depths', () => {
      const shared = { a: { b: 1 } }
      const lhs = { x: shared }
      const rhs = { x: { a: shared } }
      const changes = DeepDiff.diff(lhs, rhs)

      expect(changes).to.be.an('array').with.lengthOf(2)
      expect(changes[0].kind).to.equal('D')
      expect(changes[0].path).to.eql(['x', 'a', 'b'])
      expect(changes[1].kind).to.equal('N')
      expect(changes[1].path).to.eql(['x', 'a', 'a'])
    })
  })

  describe('accumulator option', () => {
    it('pushes differences into a provided accumulator array', () => {
      const acc = []
      const result = DeepDiff.diff({ foo: 'bar' }, { foo: 'baz', qux: 1 }, { accumulator: acc })
      expect(result).to.equal(acc)
      expect(acc).to.be.an('array').with.lengthOf(2)
    })

    it('accumulator receives the same changes as a normal diff', () => {
      const lhs = { a: 1, b: 2 }
      const rhs = { a: 9, b: 2, c: 3 }
      const acc = []
      DeepDiff.diff(lhs, rhs, { accumulator: acc })
      const plain = DeepDiff.diff(lhs, rhs)
      expect(acc.length).to.equal(plain.length)
      expect(acc[0].kind).to.equal(plain[0].kind)
    })

    it('returns the accumulator even when it is empty (no differences)', () => {
      const acc = []
      const result = DeepDiff.diff({ foo: 'bar' }, { foo: 'bar' }, { accumulator: acc })
      expect(result).to.equal(acc)
      expect(acc.length).to.equal(0)
    })
  })

  describe('top-level primitive diffs', () => {
    it('returns undefined for two equal primitive values', () => {
      expect(DeepDiff.diff(42, 42)).to.equal(undefined)
      expect(DeepDiff.diff('foo', 'foo')).to.equal(undefined)
      expect(DeepDiff.diff(true, true)).to.equal(undefined)
      expect(DeepDiff.diff(+0, -0)).to.equal(undefined)
    })

    it('returns a path-less DiffEdit for two differing primitives', () => {
      const result = DeepDiff.diff(1, 2)
      expect(result).to.be.an('array').with.lengthOf(1)
      expect(result[0].kind).to.equal('E')
      expect(result[0].lhs).to.equal(1)
      expect(result[0].rhs).to.equal(2)
      expect(result[0]).to.not.have.property('path')
    })

    it('returns undefined for two null values', () => {
      expect(DeepDiff.diff(null, null)).to.equal(undefined)
    })

    it('returns undefined for two equal regexes', () => {
      expect(DeepDiff.diff(/foo/, /foo/)).to.equal(undefined)
    })
  })

  describe('BigInt support', () => {
    it('returns undefined for two equal BigInt values', () => {
      expect(DeepDiff.diff(1n, 1n)).to.equal(undefined)
    })

    it('emits a DiffEdit for two differing BigInt values', () => {
      const result = DeepDiff.diff(1n, 2n)
      expect(result).to.be.an('array').with.lengthOf(1)
      expect(result[0].kind).to.equal('E')
      expect(result[0].lhs).to.equal(1n)
      expect(result[0].rhs).to.equal(2n)
    })

    it('emits a DiffEdit when a BigInt is compared to a number with the same numeric value', () => {
      const result = DeepDiff.diff(1n, 1)
      expect(result).to.be.an('array').with.lengthOf(1)
      expect(result[0].kind).to.equal('E')
    })
  })

  describe('observableDiff without observer', () => {
    it('returns an empty array when there are no changes', () => {
      const result = DeepDiff.observableDiff({ a: 1 }, { a: 1 })
      expect(result).to.be.an('array').with.lengthOf(0)
    })

    it('returns the changes array when there are differences', () => {
      const result = DeepDiff.observableDiff({ a: 1 }, { a: 2 })
      expect(result).to.be.an('array').with.lengthOf(1)
      expect(result[0].kind).to.equal('E')
    })

    it('does not throw when called with options but no observer', () => {
      const acc = []
      const result = DeepDiff.observableDiff({ a: 1 }, { a: 2 }, undefined, { accumulator: acc })
      expect(result).to.equal(acc)
      expect(acc.length).to.equal(1)
    })

    it('handles null options and non-function observer gracefully', () => {
      expect(DeepDiff.diff({ a: 1 }, { a: 2 }, null))
        .to.be.an('array')
        .with.lengthOf(1)
      expect(DeepDiff.observableDiff({ a: 1 }, { a: 2 }, 'not-a-fn', null))
        .to.be.an('array')
        .with.lengthOf(1)
    })
  })

  describe('Map, Set, and TypedArray support', () => {
    it('should detect differences between two Maps', () => {
      const map1 = new Map([
        ['a', 1],
        ['b', 2]
      ])
      const map2 = new Map([
        ['a', 1],
        ['b', 3],
        ['c', 4]
      ])
      const diff = DeepDiff.diff(map1, map2)

      expect(diff).to.be.an('array').with.lengthOf(2)

      const edit = diff.find((d) => d.path && d.path[0] === 'b')
      expect(edit).to.exist
      expect(edit.kind).to.equal('E')
      expect(edit.lhs).to.equal(2)
      expect(edit.rhs).to.equal(3)

      const addition = diff.find((d) => d.path && d.path[0] === 'c')
      expect(addition).to.exist
      expect(addition.kind).to.equal('N')
      expect(addition.rhs).to.equal(4)
    })

    it('should detect differences between two Sets', () => {
      const set1 = new Set([1, 2])
      const set2 = new Set([1, 3])
      const diff = DeepDiff.diff(set1, set2)

      expect(diff).to.be.an('array').with.lengthOf(1)
      expect(diff[0].kind).to.equal('E')
      expect(diff[0].lhs).to.eql(set1)
      expect(diff[0].rhs).to.eql(set2)

      expect(DeepDiff.diff(new Set([1]), new Set([1, 2])))
        .to.be.an('array')
        .with.lengthOf(1)
    })

    it('should detect differences between two TypedArrays', () => {
      const ta1 = new Uint8Array([1, 2, 3])
      const ta2 = new Uint8Array([1, 2, 4])
      const diff = DeepDiff.diff(ta1, ta2)

      expect(diff).to.be.an('array').with.lengthOf(1)
      expect(diff[0].kind).to.equal('E')
      expect(diff[0].lhs).to.eql(ta1)
      expect(diff[0].rhs).to.eql(ta2)
    })

    it('should not be spoofed by Symbol.toStringTag', () => {
      const dateSpoof = { [Symbol.toStringTag]: 'Date' }
      const realDate = new Date(2010, 1, 1)
      const diff = DeepDiff.diff(dateSpoof, realDate)

      expect(diff).to.be.an('array').with.lengthOf(1)
      expect(diff[0].kind).to.equal('E')
    })

    it('should detect deletion of Map keys', () => {
      const map1 = new Map([
        ['a', 1],
        ['b', 2]
      ])
      const map2 = new Map([['a', 1]])
      const diff = DeepDiff.diff(map1, map2)

      expect(diff).to.be.an('array').with.lengthOf(1)
      expect(diff[0].kind).to.equal('D')
      expect(diff[0].path).to.eql(['b'])
    })

    it('should report no changes for equal TypedArrays', () => {
      const ta1 = new Uint8Array([1, 2, 3])
      const ta2 = new Uint8Array([1, 2, 3])

      expect(DeepDiff.diff(ta1, ta2)).to.equal(undefined)
    })

    it('should report differences for TypedArrays of different lengths', () => {
      const ta1 = new Uint8Array([1])
      const ta2 = new Uint8Array([1, 2])
      const diff = DeepDiff.diff(ta1, ta2)

      expect(diff).to.be.an('array').with.lengthOf(1)
      expect(diff[0].kind).to.equal('E')
    })

    it('should handle Map entries with undefined values and null/undefined keys', () => {
      const mWithUndefined = new Map([['a', undefined]])
      const mEmpty = new Map()
      const mWithNumber = new Map([['a', 1]])

      const deletedDiff = DeepDiff.diff(mWithUndefined, mEmpty)
      expect(deletedDiff).to.be.an('array').with.lengthOf(1)
      expect(deletedDiff[0].kind).to.equal('D')
      expect(deletedDiff[0].path).to.eql(['a'])
      expect(deletedDiff[0].lhs).to.equal(undefined)

      const addedDiff = DeepDiff.diff(mEmpty, mWithUndefined)
      expect(addedDiff).to.be.an('array').with.lengthOf(1)
      expect(addedDiff[0].kind).to.equal('N')
      expect(addedDiff[0].path).to.eql(['a'])
      expect(addedDiff[0].rhs).to.equal(undefined)

      const editedToUndefined = DeepDiff.diff(mWithNumber, mWithUndefined)
      expect(editedToUndefined).to.be.an('array').with.lengthOf(1)
      expect(editedToUndefined[0].kind).to.equal('E')
      expect(editedToUndefined[0].lhs).to.equal(1)
      expect(editedToUndefined[0].rhs).to.equal(undefined)

      expect(DeepDiff.diff(mWithUndefined, new Map([['a', undefined]]))).to.equal(undefined)

      const mNullKey1 = new Map([
        [null, 1],
        [undefined, 2]
      ])
      const mNullKey2 = new Map([
        [null, 99],
        [undefined, 2]
      ])
      const nullKeyDiff = DeepDiff.diff(mNullKey1, mNullKey2)
      expect(nullKeyDiff).to.be.an('array').with.lengthOf(1)
      expect(nullKeyDiff[0].kind).to.equal('E')
      expect(nullKeyDiff[0].path).to.eql([null])
    })

    it('should differentiate TypedArrays of different view types with the same elements', () => {
      const u8 = new Uint8Array([1, 2, 3])
      const i32 = new Int32Array([1, 2, 3])
      const f64 = new Float64Array([1, 2, 3])

      expect(DeepDiff.diff(u8, i32)).to.be.an('array').with.lengthOf(1)
      expect(DeepDiff.diff(u8, f64)).to.be.an('array').with.lengthOf(1)
      expect(getOrderIndependentHash(u8)).to.not.equal(getOrderIndependentHash(i32))
    })

    it('should handle BigInt64Array, Float64Array NaN, and fractional Float64Array values', () => {
      const bi1 = new BigInt64Array([1n, 2n])
      const bi2 = new BigInt64Array([1n, 3n])
      expect(DeepDiff.diff(bi1, new BigInt64Array([1n, 2n]))).to.equal(undefined)
      expect(DeepDiff.diff(bi1, bi2)).to.be.an('array').with.lengthOf(1)
      expect(DeepDiff.diff([bi1], [new BigInt64Array([1n, 2n])], { orderIndependent: true })).to.equal(undefined)

      const nanArr1 = new Float64Array([1, NaN])
      const nanArr2 = new Float64Array([1, NaN])
      const nanArr3 = new Float64Array([2, NaN])
      expect(DeepDiff.diff(nanArr1, nanArr2)).to.equal(undefined)
      expect(getOrderIndependentHash(nanArr1)).to.equal(getOrderIndependentHash(nanArr2))
      expect(getOrderIndependentHash(nanArr1)).to.not.equal(getOrderIndependentHash(nanArr3))

      const frac1 = new Float64Array([0.1, 0.2])
      const frac2 = new Float64Array([0.8, 0.9])
      expect(getOrderIndependentHash(frac1)).to.not.equal(getOrderIndependentHash(frac2))
    })
  })
})

describe('deep-diff — order-independent comparison', () => {
  describe('Order independent hash testing', () => {
    function sameHash(a, b) {
      expect(getOrderIndependentHash(a)).to.equal(getOrderIndependentHash(b))
    }

    function differentHash(a, b) {
      expect(getOrderIndependentHash(a)).to.not.equal(getOrderIndependentHash(b))
    }

    describe('Order independent hash function should give different values for different objects', () => {
      it('should give different values for different "simple" types', () => {
        differentHash(1, -20)
        differentHash('foo', 45)
        differentHash('pie', 'something else')
        differentHash(1.3332, 1)
        differentHash(1, null)
        differentHash(
          "this is kind of a long string, don't you think?",
          'the quick brown fox jumped over the lazy doge'
        )
        differentHash(true, 2)
        differentHash(false, 'flooog')
      })

      it('should give different values for string and object with string', () => {
        differentHash('some string', { key: 'some string' })
      })

      it('should give different values for number and array', () => {
        differentHash(1, [1])
      })

      it('should give different values for string and array of string', () => {
        differentHash('string', ['string'])
      })

      it('should give different values for boolean and object with boolean', () => {
        differentHash(true, { key: true })
      })

      it('should give different values for different arrays', () => {
        differentHash([1, 2, 3], [1, 2])
        differentHash([1, 4, 5, 6], ['foo', 1, true, undefined])
        differentHash([1, 4, 6], [1, 4, 7])
        differentHash([1, 3, 5], ['1', '3', '5'])
      })

      it('should give different values for different objects', () => {
        differentHash({ key: 'value' }, { other: 'value' })
        differentHash({ a: { b: 'c' } }, { a: 'b' })
      })

      it('should differentiate between arrays and objects', () => {
        differentHash([1, true, '1'], { a: 1, b: true, c: '1' })
      })
    })

    describe('Order independent hash function should work in pathological cases', () => {
      it('should work in funky javascript cases', () => {
        differentHash(undefined, null)
        differentHash(0, undefined)
        differentHash(0, null)
        differentHash(0, false)
        differentHash(0, [])
        differentHash('', [])
        differentHash(3.22, '3.22')
        differentHash(true, 'true')
        differentHash(false, 0)
      })

      it('should work on empty array and object', () => {
        differentHash([], {})
      })

      it('should work on empty object and undefined', () => {
        differentHash({}, undefined)
      })

      it('should work on empty array and array with 0', () => {
        differentHash([], [0])
      })

      it('should distinguish empty objects inside arrays and Sets', () => {
        differentHash([], [{}])
        differentHash([{}], [{}, {}])
        expect(DeepDiff.diff([[]], [[{}]], { orderIndependent: true }))
          .to.be.an('array')
          .with.lengthOf(1)
        expect(DeepDiff.diff(new Set([[]]), new Set([[{}]])))
          .to.be.an('array')
          .with.lengthOf(1)
      })

      it('should preserve Date millisecond precision and RegExp flags', () => {
        const d1 = new Date(1000)
        const d2 = new Date(1500)
        differentHash(d1, d2)
        expect(DeepDiff.diff(new Set([d1]), new Set([d2])))
          .to.be.an('array')
          .with.lengthOf(1)
        expect(DeepDiff.diff([d1], [d2], { orderIndependent: true }))
          .to.be.an('array')
          .with.lengthOf(1)

        expect(DeepDiff.diff(new Date(NaN), new Date(NaN))).to.equal(undefined)

        const r1 = /foo/g
        const r2 = /foo/i
        differentHash(r1, r2)
        expect(DeepDiff.diff(new Set([r1]), new Set([r2])))
          .to.be.an('array')
          .with.lengthOf(1)
      })

      it('should handle circular Map, Set, and Object without throwing', () => {
        const cyclicMap = new Map()
        cyclicMap.set('self', cyclicMap)
        expect(() => getOrderIndependentHash(cyclicMap)).to.not.throw()

        const cyclicSet = new Set()
        cyclicSet.add(cyclicSet)
        expect(() => getOrderIndependentHash(cyclicSet)).to.not.throw()

        const cyclicObj = { a: 1 }
        cyclicObj.self = cyclicObj
        expect(() => getOrderIndependentHash(cyclicObj)).to.not.throw()
      })
    })

    describe('Order independent hash function should be order independent', () => {
      it('should not care about array order', () => {
        sameHash([1, 2, 3], [3, 2, 1])
        sameHash(['hi', true, 9.4], [true, 'hi', 9.4])
      })

      it('should not care about key order in an object', () => {
        sameHash({ foo: 'bar', foz: 'baz' }, { foz: 'baz', foo: 'bar' })
      })

      it('should work with complicated objects', () => {
        const obj1 = {
          foo: 'bar',
          faz: [
            1,
            'pie',
            {
              food: 'yum'
            }
          ]
        }

        const obj2 = {
          faz: [
            'pie',
            {
              food: 'yum'
            },
            1
          ],
          foo: 'bar'
        }

        sameHash(obj1, obj2)
      })
    })
  })

  describe('Order independent array comparison should work', () => {
    it('can compare simple arrays in an order independent fashion', () => {
      const lhs = [1, 2, 3]
      const rhs = [1, 3, 2]

      const diff = DeepDiff.diff(lhs, rhs, { orderIndependent: true })
      expect(diff).to.equal(undefined)
    })

    it('still works with repeated elements', () => {
      const lhs = [1, 1, 2]
      const rhs = [1, 2, 1]

      const diff = DeepDiff.diff(lhs, rhs, { orderIndependent: true })
      expect(diff).to.equal(undefined)
    })

    it('works on complex objects', () => {
      const obj1 = {
        foo: 'bar',
        faz: [
          1,
          'pie',
          {
            food: 'yum'
          }
        ]
      }

      const obj2 = {
        faz: [
          'pie',
          {
            food: 'yum'
          },
          1
        ],
        foo: 'bar'
      }

      const diff = DeepDiff.diff(obj1, obj2, { orderIndependent: true })
      expect(diff).to.equal(undefined)
    })

    it('should report some difference in non-equal arrays', () => {
      const lhs = [1, 2, 3]
      const rhs = [2, 2, 3]

      const diff = DeepDiff.diff(lhs, rhs)
      expect(diff).to.be.an('array').with.lengthOf(1)
    })

    it('should hash Map, Set, and TypedArrays correctly under order-independent comparison', () => {
      const lhs = [new Map([['a', 1]]), new Set([1, 2]), new Uint8Array([1, 2])]
      const rhs = [new Set([1, 2]), new Uint8Array([1, 2]), new Map([['a', 1]])]
      const diff = DeepDiff.diff(lhs, rhs, { orderIndependent: true })

      expect(diff).to.equal(undefined)
    })
  })

  describe('orderIndependent does not mutate inputs', () => {
    it('leaves the original arrays unchanged after diff', () => {
      const lhs = [3, 1, 2]
      const rhs = [1, 2, 3]
      const lhsCopy = [...lhs]
      const rhsCopy = [...rhs]
      DeepDiff.diff(lhs, rhs, { orderIndependent: true })
      expect(lhs).to.eql(lhsCopy)
      expect(rhs).to.eql(rhsCopy)
    })
  })

  describe('orderIndependent with differing arrays', () => {
    it('emits a single DiffEdit when multisets differ', () => {
      const lhs = [1, 2, 3]
      const rhs = [1, 2, 4]
      const result = DeepDiff.diff(lhs, rhs, { orderIndependent: true })
      expect(result).to.be.an('array').with.lengthOf(1)
      expect(result[0].kind).to.equal('E')
      expect(result[0].lhs).to.eql(lhs)
      expect(result[0].rhs).to.eql(rhs)
    })

    it('emits a DiffEdit for a nested orderIndependent array mismatch', () => {
      const lhs = { arr: [1, 2, 3] }
      const rhs = { arr: [1, 2, 4] }
      const result = DeepDiff.diff(lhs, rhs, { orderIndependent: true })
      expect(result).to.be.an('array').with.lengthOf(1)
      expect(result[0].kind).to.equal('E')
      expect(result[0].path).to.eql(['arr'])
    })
  })

  describe('orderIndependent hash with DAGs (shared references)', () => {
    it('correctly compares objects containing shared references', () => {
      const shared = { a: 1 }
      const lhs = { arr: [{ x: shared, y: shared }] }
      const rhs = { arr: [{ x: { a: 1 }, y: { a: 1 } }] }
      const diff = DeepDiff.diff(lhs, rhs, { orderIndependent: true })
      expect(diff).to.equal(undefined)
    })
  })
})
