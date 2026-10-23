'use strict'

const { test, describe } = require('node:test')
const assert = require('node:assert/strict')
const {
  chromeLikeUserAgent,
  normalizeBounds,
  isHttpUrl
} = require('../src/main/meeting-window')

describe('meeting-window helpers', () => {
  test('builds a Chrome-like UA without an Electron token', () => {
    const ua = chromeLikeUserAgent()
    assert.match(ua, /Chrome\//)
    assert.equal(/Electron\//i.test(ua), false)
  })

  test('normalizes bounds with minimum size', () => {
    assert.deepEqual(normalizeBounds({ x: 10.6, y: 20.2, width: 100, height: 50 }), {
      x: 11,
      y: 20,
      width: 320,
      height: 240
    })
  })

  test('accepts only http(s) meeting URLs', () => {
    assert.equal(isHttpUrl('https://meet.google.com/abc-defg-hij'), true)
    assert.equal(isHttpUrl('http://127.0.0.1/join'), true)
    assert.equal(isHttpUrl('file:///tmp/x'), false)
    assert.equal(isHttpUrl('javascript:alert(1)'), false)
  })
})
