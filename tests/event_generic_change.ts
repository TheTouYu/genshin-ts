import { g } from 'genshin-ts/runtime/core'

g.server({ id: 1073741861 }).on('whenCustomVariableChanges', (evt, f) => {
  const pre = evt.preChangeValue.asType('int')
  const post = evt.postChangeValue.asType('int')
  f.addition(pre, post)
})

g.server({ id: 1073741862 }).on('whenNodeGraphVariableChanges', (evt, f) => {
  const preDict = evt.preChangeValue.asDict('str', 'int')
  const postDict = evt.postChangeValue.asDict('str', 'int')
  const preVal = f.queryDictionaryValueByKey(preDict, 'k')
  const postVal = f.queryDictionaryValueByKey(postDict, 'k')
  f.addition(preVal, postVal)
})

g.server({ id: 1073741863 }).on('whenCustomVariableChanges', (evt, _f) => {
  print(str(evt.postChangeValue.asType('int')))
})
