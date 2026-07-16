import { g } from 'genshin-ts/runtime/core'
import { float } from 'genshin-ts/runtime/value'

const getFloat = g.defineComposite('timer 输出 float', {
  inputs: { value: { type: 'float' } },
  outputs: { value: { type: 'float' } },
  build(args) {
    return { value: args.value }
  }
})

const getDirection = g.defineComposite('timer 输出 vec3', {
  inputs: { x: { type: 'float' }, y: { type: 'float' } },
  outputs: { value: { type: 'vec3' } },
  build(args, f) {
    return { value: f.create3dVector(args.x, args.y, 0) }
  }
})

const getMultiple = g.defineComposite('timer 多输出', {
  inputs: { value: { type: 'float' } },
  outputs: {
    scalar: { type: 'float' },
    vector: { type: 'vec3' }
  },
  build(args, f) {
    return {
      scalar: args.value,
      vector: f.create3dVector(args.value, 0, 0)
    }
  }
})

g.server({
  name: 'timer-composite-output-types',
  id: 1073742191,
  variables: { timerValue: 0 }
}).on(
  'whenEntityIsCreated',
  (_evt, f) => {
    setInterval((_timerEvt, timerF) => {
      const scalar = timerF.callComposite(getFloat, {
        value: timerF.get('timerValue')
      }).value
      timerF.doubleBranch(timerF.greaterThan(scalar, new float(0)), () => {}, () => {})

      const direction = timerF.callComposite(getDirection, {
        x: scalar,
        y: timerF.get('timerValue')
      }).value
      const directionParts = timerF.split3dVector(direction)
      timerF.printString(timerF.dataTypeConversion(directionParts.xComponent, 'str'))

      const multipleVector = timerF.callComposite(getMultiple, { value: scalar }).vector
      const multipleParts = timerF.split3dVector(multipleVector)
      timerF.printString(timerF.dataTypeConversion(multipleParts.xComponent, 'str'))
    }, 100)
  }
)
