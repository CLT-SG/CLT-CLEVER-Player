'use strict'

const { test, describe } = require('node:test')
const assert = require('node:assert/strict')
const { redact } = require('../src/main/redact')

describe('redact', () => {
  test('removes password and token values', () => {
    const input = 'password=super-secret token=abc123 authorization=Bearer xyz'
    const output = redact(input)
    assert.equal(output.includes('super-secret'), false)
    assert.equal(output.includes('abc123'), false)
    assert.match(output, /password=\[REDACTED\]/)
  })

  test('redacts bearer tokens and serial keys', () => {
    const output = redact('Authorization: Bearer abc.def.ghi serialkey: 1d74f3eda4')
    assert.equal(output.includes('abc.def.ghi'), false)
    assert.equal(output.includes('1d74f3eda4'), false)
  })

  test('redacts HTTP header blocks and cookies', () => {
    const output = redact('Headers: {\n  "set-cookie": ["_gh_sess=abc; path=/"]\n}')
    assert.equal(output.includes('_gh_sess=abc'), false)
    assert.match(output, /\[REDACTED\]/)
  })
})
