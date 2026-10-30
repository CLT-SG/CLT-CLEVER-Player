'use strict'

const { describe, it } = require('node:test')
const assert = require('node:assert/strict')
const { encodeLocalStorageJson } = require('../src/main/local-storage-json')

describe('encodeLocalStorageJson', () => {
  it('encodes objects so localStorage stores parseable JSON text', () => {
    const encoded = encodeLocalStorageJson({ items: [1], rows: 2 })
    const storageValue = Function(`"use strict"; return (${encoded})`)()
    assert.deepEqual(JSON.parse(storageValue), { items: [1], rows: 2 })
  })

  it('preserves already-stringified JSON documents', () => {
    const raw = JSON.stringify({ items: [], columns: 3 })
    const encoded = encodeLocalStorageJson(raw)
    const storageValue = Function(`"use strict"; return (${encoded})`)()
    assert.deepEqual(JSON.parse(storageValue), { items: [], columns: 3 })
  })

  it('does not stringify objects via String(object)', () => {
    const encoded = encodeLocalStorageJson({ a: 1 })
    assert.equal(encoded.includes('[object Object]'), false)
  })

  it('handles null as empty string', () => {
    const encoded = encodeLocalStorageJson(null)
    const storageValue = Function(`"use strict"; return (${encoded})`)()
    assert.equal(storageValue, '')
  })
})
