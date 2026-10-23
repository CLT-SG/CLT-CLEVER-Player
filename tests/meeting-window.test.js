'use strict'

const { test, describe } = require('node:test')
const assert = require('node:assert/strict')
const {
  chromeLikeUserAgent,
  buildJoinAssistScript,
  buildLeaveMeetingScript,
  normalizeBounds,
  isHttpUrl
} = require('../src/main/meeting-window')

describe('meeting-window helpers', () => {
  test('builds a stock Google Chrome UA without an Electron token', () => {
    const ua = chromeLikeUserAgent()
    assert.match(ua, /Chrome\//)
    assert.match(ua, /Safari\/537\.36$/)
    assert.equal(/Electron\//i.test(ua), false)
    assert.equal(/cleverplayer/i.test(ua), false)
  })

  test('guest join assist script embeds display name and Ask to join', () => {
    const script = buildJoinAssistScript({
      identityMode: 'guest',
      guestDisplayName: 'Lobby A'
    })
    assert.match(script, /Lobby A/)
    assert.match(script, /ask to join/)
    assert.equal(/login-secret/.test(script), false)
  })

  test('signed-in join assist script embeds identifier autofill helpers', () => {
    const script = buildJoinAssistScript({
      identityMode: 'signed_in',
      loginIdentifier: 'wall@example.com',
      loginPassword: 'login-secret'
    })
    assert.match(script, /wall@example\.com/)
    assert.match(script, /login-secret/)
    assert.match(script, /sign in/)
  })

  test('leave script targets Leave/Hang up and avoids end-for-all', () => {
    const script = buildLeaveMeetingScript()
    assert.match(script, /leave call/)
    assert.match(script, /leave meeting/)
    assert.match(script, /hang up/)
    assert.match(script, /end \(the \)\?\(meeting\|call\) for \(all\|everyone\)/)
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
