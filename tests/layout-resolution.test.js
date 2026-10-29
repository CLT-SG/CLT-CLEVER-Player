'use strict'

const { describe, it } = require('node:test')
const assert = require('node:assert/strict')
const {
  tryParseLayoutResolution,
  sameLayoutResolution,
  resolutionFromTemplateData,
  formatLayoutResolution
} = require('../src/main/layout-resolution')

describe('layout-resolution', () => {
  it('parses equivalent WxH formats', () => {
    assert.deepEqual(tryParseLayoutResolution('3840x2160'), { width: 3840, height: 2160 })
    assert.deepEqual(tryParseLayoutResolution('1920×1080'), { width: 1920, height: 1080 })
    assert.deepEqual(tryParseLayoutResolution('3840 x 2160'), { width: 3840, height: 2160 })
    assert.equal(tryParseLayoutResolution(''), null)
    assert.equal(tryParseLayoutResolution('unknown'), null)
  })

  it('matches numeric dimensions only', () => {
    assert.equal(sameLayoutResolution('3840x2160', '3840×2160'), true)
    assert.equal(sameLayoutResolution('3840x2160', '1920x1080'), false)
    assert.equal(sameLayoutResolution('3840x2160', 'unknown'), false)
  })

  it('reads resolution from templateData payloads', () => {
    assert.deepEqual(
      resolutionFromTemplateData(JSON.stringify({ resolution: '1920x1080' })),
      { width: 1920, height: 1080 }
    )
    assert.equal(resolutionFromTemplateData('{"name":"x"}'), null)
    assert.equal(formatLayoutResolution({ width: 1280, height: 720 }), '1280x720')
  })
})
