import { g } from 'genshin-ts/runtime/core'

const graph = g
  .server({
    id: 1073741861
  })
  .on('whenEntityIsCreated', (evt, f) => {
    const a = 3.5
    const b = -2

    const absVal = Math.abs(b)
    const floorVal = Math.floor(a)
    const ceilVal = Math.ceil(a)
    const roundVal = Math.round(a)
    const truncVal = Math.trunc(-3.7)
    const powVal = Math.pow(2, 3)
    const sqrtVal = Math.sqrt(16)
    const logVal = Math.log(2)
    const log10Val = Math.log10(100)
    const log2Val = Math.log2(8)
    const sinVal = Math.sin(1)
    const cosVal = Math.cos(1)
    const tanVal = Math.tan(1)
    const asinVal = Math.asin(0.5)
    const acosVal = Math.acos(0.5)
    const atanVal = Math.atan(1)
    const randVal = Math.random()

    const minVal = Math.min(3, 1, 2)
    const maxVal = Math.max(3, 1, 2)
    const hypot2 = Math.hypot(3, 4)
    const hypot3 = Math.hypot(1, 2, 2)
    const signNeg = Math.sign(-9)
    const signZero = Math.sign(0)
    const cbrtVal = Math.cbrt(27)
    const atan2Val = Math.atan2(1, -1)

    const combo = Math.max(Math.min(a, b), Math.abs(b))
    const combo2 = Math.hypot(Math.sin(a), Math.cos(a))

    const ints = list('int', [1n, 2n, 3n])
    const len = ints.length

    const asNum = Number(2)
    const asText = String(len)
    const asFlag = Boolean(true)

    const v0 = Vector3.zero
    const v1 = Vector3.one
    const vUp = Vector3.up
    const vRight = Vector3.right
    const vLerp = Vector3.Lerp(v0, v1, 0.5)
    const vDot = Vector3.Dot(vUp, vRight)
    const vCross = Vector3.Cross(vUp, vRight)
    const vDist = Vector3.Distance(v0, v1)
    const vNorm = Vector3.Normalize(v1)
    const vMag = Vector3.Magnitude(v1)
    const vClamp = Vector3.ClampMagnitude(v1, 0.25)

    const randInt = Random.Range(1n, 3n)
    const randFloat = Random.Range(0, 1)
    const randUnit = Random.value

    const mfAbs = Mathf.Abs(-7)
    const mfFloor = Mathf.FloorToInt(3.9)
    const mfRound = Mathf.RoundToInt(2.5)
    const mfPow = Mathf.Pow(2, 4)
    const mfSin = Mathf.Sin(1)

    const tagEntity = GameObject.FindWithTag(1n)
    const tagList = GameObject.FindGameObjectsWithTag(2n)
    const prefabList = GameObject.FindByPrefabId(100n)
    const guidEntity = GameObject.Find(0n)

    console.log(asText)
    console.log(asFlag)
    console.log(asNum)

    f.printString(str(absVal))
    f.printString(str(floorVal))
    f.printString(str(ceilVal))
    f.printString(str(roundVal))
    f.printString(str(truncVal))
    f.printString(str(powVal))
    f.printString(str(sqrtVal))
    f.printString(str(logVal))
    f.printString(str(log10Val))
    f.printString(str(log2Val))
    f.printString(str(sinVal))
    f.printString(str(cosVal))
    f.printString(str(tanVal))
    f.printString(str(asinVal))
    f.printString(str(acosVal))
    f.printString(str(atanVal))
    f.printString(str(randVal))
    f.printString(str(minVal))
    f.printString(str(maxVal))
    f.printString(str(hypot2))
    f.printString(str(hypot3))
    f.printString(str(signNeg))
    f.printString(str(signZero))
    f.printString(str(cbrtVal))
    f.printString(str(atan2Val))
    f.printString(str(combo))
    f.printString(str(combo2))
    f.printString(str(len))
    f.printString(str(vDot))
    f.printString(str(vDist))
    f.printString(str(vMag))
    f.printString(str(vCross))
    f.printString(str(vLerp))
    f.printString(str(vNorm))
    f.printString(str(vClamp))
    f.printString(str(f.getListLength(tagList)))
    f.printString(str(f.getListLength(prefabList)))
    f.printString(str(randInt))
    f.printString(str(randFloat))
    f.printString(str(randUnit))
    f.printString(str(mfAbs))
    f.printString(str(mfFloor))
    f.printString(str(mfRound))
    f.printString(str(mfPow))
    f.printString(str(mfSin))
    f.printString(str(tagEntity))
    f.printString(str(guidEntity))
  })
  .on('whenAttacked', (evt, f) => {
    const v = evt.attackerEntity
    stage.set('a', evt.damage)
    setTimeout(() => {
      print(str(v))
      print(str(stage.get('a').asType('float')))
    }, 2000)
  })

graph.onSignal('wire_signal', (evt, f) => {
  console.log(str(evt.eventSourceGuid))
})
