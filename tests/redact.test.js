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

  test('redacts private keys', () => {
    const output = redact('-----BEGIN RSA PRIVATE KEY-----\nABC\n-----END RSA PRIVATE KEY-----')
    assert.equal(output.includes('ABC'), false)
    assert.equal(output, '[REDACTED PRIVATE KEY]')
  })
})
