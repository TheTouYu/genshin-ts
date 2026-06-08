import { g } from 'genshin-ts/runtime/core'

g.server({
  id: 1073741860,
  variables: {
    d_str_int: dict([
      { k: 'a', v: 1n },
      { k: 'b', v: 2n }
    ])
  }
}).on('whenEntityIsCreated', (_evt, f) => {
  const d = f.get('d_str_int')

  f.printString('size_init')
  f.printString(str(d.size))

  f.printString('has_a')
  f.printString(str(d.has('a')))
  f.printString('has_missing')
  f.printString(str(d.has('missing')))

  f.printString('get_a')
  f.printString(str(d.get('a')))
  f.printString('get_missing')
  f.printString(str(d.get('missing')))

  d.set('c', 3n)
  f.printString('size_after_set')
  f.printString(str(d.size))

  d.delete('b')
  f.printString('size_after_delete')
  f.printString(str(d.size))

  const keys = d.keys()
  const values = d.values()

  f.printString('keys_len')
  f.printString(str(f.getListLength(keys)))
  f.printString('values_len')
  f.printString(str(f.getListLength(values)))

  f.printString('forEach_items')
  d.forEach((value, key) => {
    f.printString(str(key))
    f.printString(str(value))
  })

  d.clear()
  f.printString('size_after_clear')
  f.printString(str(d.size))
})
