import { expect } from 'chai'

import DeepDiff from '../src/index.js'
import { accumulateOrderIndependentDiff } from '../src/deepDiff.js'
import { getOrderIndependentHash } from '../src/utils.js'

describe('deep-diff', () => {
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

  describe('can revert namespace using noConflict', () => {
    if (DeepDiff.noConflict) {
      const deep = DeepDiff.noConflict()

      it('conflict is restored (when applicable)', () => {
        // In node there is no global conflict.
        if (typeof globalConflict !== 'undefined') {
          expect(DeepDiff).to.equal(deep)
        }
      })

      it('DeepDiff functionality available through result of noConflict()', () => {
        expect(DeepDiff.applyDiff).to.equal.a('function')
      })
    }
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

        const diff = DeepDiff.diff(lhs, rhs, prefilter)

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

        const diff = DeepDiff.diff(lhs, rhs, { prefilter: prefilter })

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

        const diff = DeepDiff.diff(lhs, rhs, prefilter)

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

      diff = DeepDiff.diff(testLHS, testRHS, filter)
      expect(diff).to.equal(undefined)

      diff = DeepDiff.diff(testRHS, testLHS, filter)
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

      diff = DeepDiff.diff(testLHS, testRHS, filter)
      expect(diff).to.be.an('array')

      diff = DeepDiff.diff(testRHS, testLHS, filter)
      expect(diff).to.be.an('array')
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
      const diff = DeepDiff.diff(lhs, rhs)

      // there should be differences
      expect(diff).to.be.an('array')
      expect(diff.length).to.equal(6)

      it('differences can be applied', () => {
        const applied = DeepDiff.applyDiff(lhs, rhs)

        it('and the result equals the rhs', () => {
          expect(applied).to.eql(rhs)
        })
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

  describe('Objects from different frames', () => {
    if (typeof globalConflict === 'undefined') {
      return
    }

    // eslint-disable-next-line no-undef
    const frame = document.createElement('iframe')
    // eslint-disable-next-line no-undef
    document.body.appendChild(frame)

    const lhs = new frame.contentWindow.Date(2010, 1, 1)
    const rhs = new frame.contentWindow.Date(2010, 1, 1)

    it('can compare date instances from a different frame', () => {
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

  describe('Order independent hash testing', () => {
    function sameHash(a, b) {
      expect(getOrderIndependentHash(a)).to.equal(getOrderIndependentHash(b))
    }

    function differentHash(a, b) {
      expect(getOrderIndependentHash(a)).to.not.equal(getOrderIndependentHash(b))
    }

    describe('Order indepdendent hash function should give different values for different objects', () => {
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

  describe('Order indepedent array comparison should work', () => {
    it('can compare simple arrays in an order independent fashion', () => {
      const lhs = [1, 2, 3]
      const rhs = [1, 3, 2]

      const diff = accumulateOrderIndependentDiff(lhs, rhs)
      expect(diff).to.equal(undefined)
    })

    it('still works with repeated elements', () => {
      const lhs = [1, 1, 2]
      const rhs = [1, 2, 1]

      const diff = accumulateOrderIndependentDiff(lhs, rhs)
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

      const diff = accumulateOrderIndependentDiff(obj1, obj2)
      expect(diff).to.equal(undefined)
    })

    it('should report some difference in non-equal arrays', () => {
      const lhs = [1, 2, 3]
      const rhs = [2, 2, 3]

      const diff = accumulateOrderIndependentDiff(lhs, rhs)

      expect(diff.length).to.equal(1)
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
      //expect(res).to.equal.ok()
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
})
