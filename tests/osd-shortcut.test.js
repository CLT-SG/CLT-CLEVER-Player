'use strict'

const { test, describe } = require('node:test')
const assert = require('node:assert/strict')
const { normalizeShortcutList, DEFAULT_OSD_SHORTCUTS } = require('../src/main/osd-shortcut-helpers')

describe('osd shortcut helpers', () => {
  test('falls back to default Alt+O', () => {
    assert.deepEqual(normalizeShortcutList('', ''), DEFAULT_OSD_SHORTCUTS.slice())
    assert.deepEqual(normalizeShortcutList(null, undefined), DEFAULT_OSD_SHORTCUTS.slice())
  })

  test('keeps primary and alternate without duplicates', () => {
    assert.deepEqual(normalizeShortcutList('Ctrl+Shift+O', 'F2'), ['Ctrl+Shift+O', 'F2'])
    assert.deepEqual(normalizeShortcutList('F2', 'F2'), ['F2'])
  })

  test('ignores invalid accelerators', () => {
    assert.deepEqual(normalizeShortcutList('Not A Key', 'F2'), ['F2'])
  })
})
