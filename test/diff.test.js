import { expect } from 'chai'
import vm from 'node:vm'

import * as DeepDiff from '../src/index.js'
import { getOrderIndependentHash } from '../src/utils.js'

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

      comparandTuples.forEach(function (lhsTuple) {
        comparandTuples.forEach(function (rhsTuple) {
          if (lhsTuple[0] === rhsTuple[0]) {
            return
          }

          it('shows differences when comparing ' + lhsTuple[0] + ' to ' + rhsTuple[0], () => {
            const diff = DeepDiff.diff(lhsTuple[1], rhsTuple[1])

            expect(diff).to.be.an('array')
            expect(diff.length).to.equal(1)
            expect(diff[0]).to.have.property('kind')
            expect(diff[0].kind).to.equal('E')
          })
        })
      })
    })

    describe('when compared with an object having other properties', () => {
      const comparand = {
        other: 'property',
        another: 13.13
      }
      const diff = DeepDiff.diff(empty, comparand)

      it('the differences are reported', () => {
        expect(diff).to.be.an('array')
        expect(diff.length).to.equal(2)

        expect(diff[0]).to.have.property('kind')
        expect(diff[0].kind).to.equal('N')
        expect(diff[0]).to.have.property('path')
        expect(diff[0].path).to.be.an('array')
        expect(diff[0].path[0]).to.eql('other')
        expect(diff[0]).to.have.property('rhs')
        expect(diff[0].rhs).to.equal('property')

        expect(diff[1]).to.have.property('kind')
        expect(diff[1].kind).to.equal('N')
        expect(diff[1]).to.have.property('path')
        expect(diff[1].path).to.be.an('array')
        expect(diff[1].path[0]).to.eql('another')
        expect(diff[1]).to.have.property('rhs')
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

      expect(diff).to.be.an('array')
      expect(diff.length).to.equal(1)
      expect(diff[0]).to.have.property('kind')
      expect(diff[0].kind).to.equal('D')
    })

    it('shows the property as edited when compared to an object with null', () => {
      const diff = DeepDiff.diff(lhs, {
        one: null
      })

      expect(diff).to.be.an('array')
      expect(diff.length).to.equal(1)
      expect(diff[0]).to.have.property('kind')
      expect(diff[0].kind).to.equal('E')
    })

    it('shows the property as edited when compared to an array', () => {
      const diff = DeepDiff.diff(lhs, ['one'])

      expect(diff).to.be.an('array')
      expect(diff.length).to.equal(1)
      expect(diff[0]).to.have.property('kind')
      expect(diff[0].kind).to.equal('E')
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

      expect(diff).to.be.an('array')
      expect(diff.length).to.equal(1)
      expect(diff[0]).to.have.property('kind')
      expect(diff[0].kind).to.equal('D')
    })

    it('shows the property is changed when compared to an object that has value', () => {
      const diff = DeepDiff.diff(lhs, {
        key: 'value'
      })

      expect(diff).to.be.an('array')
      expect(diff.length).to.equal(1)
      expect(diff[0]).to.have.property('kind')
      expect(diff[0].kind).to.equal('E')
    })

    it('shows that an object property is changed when it is set to null', () => {
      lhs.key = {
        nested: 'value'
      }

      const diff = DeepDiff.diff(lhs, {
        key: null
      })

      expect(diff).to.be.an('array')
      expect(diff.length).to.equal(1)
      expect(diff[0]).to.have.property('kind')
      expect(diff[0].kind).to.equal('E')
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

      expect(diff).to.be.an('array')
      expect(diff.length).to.equal(1)
      expect(diff[0]).to.have.property('kind')
      expect(diff[0].kind).to.equal('E')
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

      expect(diff).to.be.an('array')
      expect(diff.length).to.equal(1)
      expect(diff[0]).to.have.property('kind')
      expect(diff[0].kind).to.equal('E')
    })

    it('shows no differences when compared to another NaN', () => {
      const diff = DeepDiff.diff(lhs, {
        key: NaN
      })

      expect(diff).to.equal(undefined)
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

        expect(diff).to.be.an('array')
        expect(diff.length).to.equal(2)
        expect(diff[0]).to.have.property('kind')
        expect(diff[0].kind).to.equal('E')
        expect(diff[1]).to.have.property('kind')
        expect(diff[1].kind).to.equal('N')
      })
    })

    describe('if the filtered config is passed as an object', () => {
      it('changes to the array to not appear as a difference', () => {
        const prefilter = function (path, key) {
          return key === 'supportedBy'
        }

        const diff = DeepDiff.diff(lhs, rhs, { prefilter })

        expect(diff).to.be.an('array')
        expect(diff.length).to.equal(2)
        expect(diff[0]).to.have.property('kind')
        expect(diff[0].kind).to.equal('E')
        expect(diff[1]).to.have.property('kind')
        expect(diff[1].kind).to.equal('N')
      })
    })

    describe('if the filtered property is not an array', () => {
      it('changes do not appear as a difference', () => {
        const prefilter = function (path, key) {
          return key === 'fixedBy'
        }

        const diff = DeepDiff.diff(lhs, rhs, { prefilter })

        expect(diff).to.be.an('array')
        expect(diff.length).to.equal(4)
        expect(diff[0]).to.have.property('kind')
        expect(diff[0].kind).to.equal('A')
        expect(diff[1]).to.have.property('kind')
        expect(diff[1].kind).to.equal('A')
        expect(diff[2]).to.have.property('kind')
        expect(diff[2].kind).to.equal('A')
        expect(diff[3]).to.have.property('kind')
        expect(diff[3].kind).to.equal('E')
      })
    })
  })

  describe('Can normalize properties to before diffing', () => {
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

      let diff

      diff = DeepDiff.diff(testLHS, testRHS, { prefilter: filter })
      expect(diff).to.equal(undefined)

      diff = DeepDiff.diff(testRHS, testLHS, { prefilter: filter })
      expect(diff).to.equal(undefined)
    })

    it('falsy return does not normalize', () => {
      const filter = {
        // eslint-disable-next-line no-unused-vars
        normalize: function (path, key, lhs, rhs) {
          return false
        }
      }

      let diff

      diff = DeepDiff.diff(testLHS, testRHS, { prefilter: filter })
      expect(diff).to.be.an('array')

      diff = DeepDiff.diff(testRHS, testLHS, { prefilter: filter })
      expect(diff).to.be.an('array')
    })
  })

  describe('object prefilter with prefilter method', () => {
    it('skips properties when prefilter.prefilter returns truthy', () => {
      const lhs = { a: 1, b: 2 }
      const rhs = { a: 99, b: 99 }
      const prefilter = {
        prefilter: (path, key) => key === 'a'
      }
      const result = DeepDiff.diff(lhs, rhs, { prefilter })
      expect(result).to.be.an('array')
      expect(result.length).to.equal(1)
      expect(result[0].path[result[0].path.length - 1]).to.equal('b')
    })

    it('does not skip properties when prefilter.prefilter returns falsy', () => {
      const lhs = { a: 1, b: 2 }
      const rhs = { a: 99, b: 99 }
      const prefilter = {
        prefilter: () => false
      }
      const result = DeepDiff.diff(lhs, rhs, { prefilter })
      expect(result).to.be.an('array')
      expect(result.length).to.equal(2)
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

    it('shows the property as removed when compared to an empty object', () => {
      const diff = DeepDiff.diff(nestedOne, empty)

      expect(diff).to.be.an('array')
      expect(diff.length).to.equal(3)
      expect(diff[0]).to.have.property('kind')
      expect(diff[0].kind).to.equal('D')
      expect(diff[1]).to.have.property('kind')
      expect(diff[1].kind).to.equal('D')
    })

    it('shows the property is changed when compared to an object that has value', () => {
      const diff = DeepDiff.diff(nestedOne, nestedTwo)

      expect(diff).to.be.an('array')
      expect(diff.length).to.equal(3)
    })

    it('shows the property as added when compared to an empty object on left', () => {
      const diff = DeepDiff.diff(empty, nestedOne)

      expect(diff).to.be.an('array')
      expect(diff.length).to.equal(3)
      expect(diff[0]).to.have.property('kind')
      expect(diff[0].kind).to.equal('N')
    })

    describe('when diff is applied to a different empty object', () => {
      const diff = DeepDiff.diff(nestedOne, nestedTwo)

      it('has result with nested values', () => {
        const result = {}

        DeepDiff.applyChange(result, nestedTwo, diff[0])
        expect(result.levelOne).to.be.an('object')
        expect(result.levelOne.levelTwo).to.be.a('string')
        expect(result.levelOne.levelTwo).to.eql('another value')
      })

      it('has result with array object values', () => {
        const result = {}

        DeepDiff.applyChange(result, nestedTwo, diff[2])
        expect(result.arrayOne).to.be.an('array')
        expect(result.arrayOne[0]).to.be.an('object')
        expect(result.arrayOne[0].objValue).to.be.a('string')
        expect(result.arrayOne[0].objValue).to.equal('new value')
      })

      it('has result with added array objects', () => {
        const result = {}

        DeepDiff.applyChange(result, nestedTwo, diff[1])
        expect(result.arrayOne).to.be.an('array')
        expect(result.arrayOne[1]).to.be.an('object')
        expect(result.arrayOne[1].objValue).to.be.a('string')
        expect(result.arrayOne[1].objValue).to.equal('more value')
      })
    })
  })

  describe('regression test for bug #10, ', () => {
    const lhs = {
      id: 'Release',
      phases: [
        {
          id: 'Phase1',
          tasks: [
            {
              id: 'Task1'
            },
            {
              id: 'Task2'
            }
          ]
        },
        {
          id: 'Phase2',
          tasks: [
            {
              id: 'Task3'
            }
          ]
        }
      ]
    }

    const rhs = {
      id: 'Release',
      phases: [
        {
          // E: Phase1 -> Phase2
          id: 'Phase2',
          tasks: [
            {
              id: 'Task3'
            }
          ]
        },
        {
          id: 'Phase1',
          tasks: [
            {
              id: 'Task1'
            },
            {
              id: 'Task2'
            }
          ]
        }
      ]
    }

    describe('differences in nested arrays are detected', () => {
      it('detects the correct number of differences', () => {
        const diff = DeepDiff.diff(lhs, rhs)
        expect(diff).to.be.an('array')
        expect(diff.length).to.equal(6)
      })

      it('differences can be applied', () => {
        const target = JSON.parse(JSON.stringify(lhs))
        DeepDiff.applyDiff(target, rhs)
        expect(target).to.eql(rhs)
      })
    })
  })

  describe('regression test for bug #35', () => {
    const lhs = ['a', 'a', 'a']
    const rhs = ['a']

    it('can apply diffs between two top level arrays', () => {
      const differences = DeepDiff.diff(lhs, rhs)

      differences.forEach(function (it) {
        DeepDiff.applyChange(lhs, true, it)
      })

      expect(lhs).to.eql(['a'])
    })
  })

  describe('Objects from different contexts/frames', () => {
    it('can compare date instances from a different context', () => {
      const context = vm.createContext()
      const lhs = vm.runInNewContext('new Date(2010, 1, 1)', context)
      const rhs = vm.runInNewContext('new Date(2010, 1, 1)', context)
      const differences = DeepDiff.diff(lhs, rhs)

      expect(differences).to.equal(undefined)
    })
  })

  describe('Comparing regexes should work', () => {
    const lhs = /foo/
    const rhs = /foo/i

    it('can compare regex instances', () => {
      const diff = DeepDiff.diff(lhs, rhs)

      expect(diff.length).to.equal(1)

      expect(diff[0].kind).to.equal('E')
      expect(diff[0].path).to.not.be.an('array')
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

      expect(diff.length).to.equal(1)
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

      expect(diff).to.be.an('array')
      expect(diff.length).to.equal(1)

      expect(diff[0].kind).to.equal('D')
      expect(diff[0].path).to.be.an('array')
      expect(diff[0].path).to.have.length(1)
      expect(diff[0].path[0]).to.equal('foo')
      expect(diff[0].lhs).to.equal(undefined)
    })

    it('should detect a difference with undefined property on rhs', () => {
      const diff = DeepDiff.diff({}, { foo: undefined })

      expect(diff).to.be.an('array')
      expect(diff.length).to.equal(1)

      expect(diff[0].kind).to.equal('N')
      expect(diff[0].path).to.be.an('array')
      expect(diff[0].path).to.have.length(1)
      expect(diff[0].path[0]).to.equal('foo')
      expect(diff[0].rhs).to.equal(undefined)
    })
  })

  describe('regression test for issue #98', () => {
    const lhs = { foo: undefined }
    const rhs = { foo: undefined }

    it('should not detect a difference with two undefined property values', () => {
      const diff = DeepDiff.diff(lhs, rhs)

      expect(diff).to.equal(undefined)
    })
  })

  describe('regression tests for issue #102', () => {
    it('should not throw a TypeError', () => {
      const diff = DeepDiff.diff(null, undefined)

      expect(diff).to.be.an('array')
      expect(diff.length).to.equal(1)

      expect(diff[0].kind).to.equal('D')
      expect(diff[0].lhs).to.equal(null)
    })

    it('should not throw a TypeError', () => {
      const diff = DeepDiff.diff(Object.create(null), { foo: undefined })

      expect(diff).to.be.an('array')
      expect(diff.length).to.equal(1)

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
      expect(res).to.be.an('array')
      expect(res).to.have.length(2)

      let changed = 0,
        deleted = 0
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
      expect(diff).to.be.an('array')
      expect(diff.length).to.equal(1)
      expect(diff[0].kind).to.equal('N')
      expect(diff[0].path[0]).to.equal('')
    })

    it('detects a deleted lhs-only property with an empty string key', () => {
      const diff = DeepDiff.diff({ a: 1, '': 'old' }, { a: 1 })
      expect(diff).to.be.an('array')
      expect(diff.length).to.equal(1)
      expect(diff[0].kind).to.equal('D')
    })

    it('detects an edit to a property with an empty string key', () => {
      const diff = DeepDiff.diff({ '': 'old' }, { '': 'new' })
      expect(diff).to.be.an('array')
      expect(diff.length).to.equal(1)
      expect(diff[0].kind).to.equal('E')
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

      expect(res).to.be.an('array')
      expect(res).to.have.length(2)

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

      expect(res).to.be.an('array')
      expect(res).to.have.length(2)

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

      expect(res).to.be.an('array')
      expect(res).to.have.length(1)

      expect(res[0].kind).to.equal('E')
    })

    it('should report "A" when a a change occurred within an array', () => {
      const lhs = {
        foo: 'bar',
        with: ['a', 'few', 'elements']
      }

      const rhs = {
        foo: 'bar',
        with: ['a', 'few', 'more', 'elements', { than: 'before' }]
      }

      const res = DeepDiff.diff(lhs, rhs)

      expect(res).to.be.an('array')
      expect(res).to.have.length(3)

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
      // Bug 2 regression: stack.push happened before the orderIndependent sort, so the stack
      // held pre-sort references and circular-ref detection never fired for sorted copies.
      const arr = [1, 2, 3]
      arr.push(arr)
      expect(() => DeepDiff.diff(arr, arr, { orderIndependent: true })).to.not.throw()
    })
  })

  describe('circular reference equality semantics', () => {
    it('treats two structurally-equal self-referential objects as equal', () => {
      const lhs = { val: 1 }
      lhs.self = lhs
      const rhs = { val: 1 }
      rhs.self = rhs
      // Both sides cycle back to a counterpart already paired on the recursion stack,
      // so they should be considered structurally equal — no diff.
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
  })

  describe('accumulator option', () => {
    it('pushes differences into a provided accumulator array', () => {
      const acc = []
      const result = DeepDiff.diff({ foo: 'bar' }, { foo: 'baz', qux: 1 }, { accumulator: acc })
      expect(result).to.equal(acc)
      expect(acc).to.be.an('array')
      expect(acc.length).to.equal(2)
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

      expect(diff.length).to.equal(1)
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
      expect(result).to.be.an('array')
      expect(result.length).to.equal(1)
      expect(result[0].kind).to.equal('E')
      expect(result[0].lhs).to.eql(lhs)
      expect(result[0].rhs).to.eql(rhs)
    })

    it('emits a DiffEdit for a nested orderIndependent array mismatch', () => {
      const lhs = { arr: [1, 2, 3] }
      const rhs = { arr: [1, 2, 4] }
      const result = DeepDiff.diff(lhs, rhs, { orderIndependent: true })
      expect(result).to.be.an('array')
      expect(result.length).to.equal(1)
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

  describe('top-level primitive diffs', () => {
    it('returns undefined for two equal primitive values', () => {
      expect(DeepDiff.diff(42, 42)).to.equal(undefined)
      expect(DeepDiff.diff('foo', 'foo')).to.equal(undefined)
      expect(DeepDiff.diff(true, true)).to.equal(undefined)
    })

    it('returns a path-less DiffEdit for two differing primitives', () => {
      const result = DeepDiff.diff(1, 2)
      expect(result).to.be.an('array')
      expect(result.length).to.equal(1)
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
      expect(result).to.be.an('array')
      expect(result.length).to.equal(1)
      expect(result[0].kind).to.equal('E')
      expect(result[0].lhs).to.equal(1n)
      expect(result[0].rhs).to.equal(2n)
    })

    it('emits a DiffEdit when a BigInt is compared to a number with the same numeric value', () => {
      const result = DeepDiff.diff(1n, 1)
      expect(result).to.be.an('array')
      expect(result[0].kind).to.equal('E')
    })
  })

  describe('observableDiff without observer', () => {
    it('returns an empty array when there are no changes', () => {
      const result = DeepDiff.observableDiff({ a: 1 }, { a: 1 })
      expect(result).to.be.an('array')
      expect(result.length).to.equal(0)
    })

    it('returns the changes array when there are differences', () => {
      const result = DeepDiff.observableDiff({ a: 1 }, { a: 2 })
      expect(result).to.be.an('array')
      expect(result.length).to.equal(1)
      expect(result[0].kind).to.equal('E')
    })

    it('does not throw when called with options but no observer', () => {
      const acc = []
      const result = DeepDiff.observableDiff({ a: 1 }, { a: 2 }, undefined, { accumulator: acc })
      expect(result).to.equal(acc)
      expect(acc.length).to.equal(1)
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

      expect(diff).to.be.an('array')
      expect(diff.length).to.equal(2)

      // Edit to 'b'
      const edit = diff.find((d) => d.path && d.path[0] === 'b')
      expect(edit).to.exist
      expect(edit.kind).to.equal('E')
      expect(edit.lhs).to.equal(2)
      expect(edit.rhs).to.equal(3)

      // Addition of 'c'
      const addition = diff.find((d) => d.path && d.path[0] === 'c')
      expect(addition).to.exist
      expect(addition.kind).to.equal('N')
      expect(addition.rhs).to.equal(4)
    })

    it('should detect differences between two Sets', () => {
      const set1 = new Set([1, 2])
      const set2 = new Set([1, 3])
      const diff = DeepDiff.diff(set1, set2)

      expect(diff).to.be.an('array')
      expect(diff.length).to.equal(1)
      expect(diff[0].kind).to.equal('E')
      expect(diff[0].lhs).to.eql(set1)
      expect(diff[0].rhs).to.eql(set2)
    })

    it('should detect differences between two TypedArrays', () => {
      const ta1 = new Uint8Array([1, 2, 3])
      const ta2 = new Uint8Array([1, 2, 4])
      const diff = DeepDiff.diff(ta1, ta2)

      expect(diff).to.be.an('array')
      expect(diff.length).to.equal(1)
      expect(diff[0].kind).to.equal('E')
      expect(diff[0].lhs).to.eql(ta1)
      expect(diff[0].rhs).to.eql(ta2)
    })

    it('should not be spoofed by Symbol.toStringTag', () => {
      const dateSpoof = { [Symbol.toStringTag]: 'Date' }
      const realDate = new Date(2010, 1, 1)
      const diff = DeepDiff.diff(dateSpoof, realDate)

      expect(diff).to.be.an('array')
      expect(diff.length).to.equal(1)
      expect(diff[0].kind).to.equal('E')
    })
  })
})
