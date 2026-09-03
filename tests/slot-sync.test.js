'use strict'

const { test, describe } = require('node:test')
const assert = require('node:assert/strict')
const {
  ACTIONS,
  slotLetter,
  normalizePayload,
  isFullReload,
  isIncremental,
  buildRuntimeScript,
  describeUpdate,
  shouldFallbackToReload
} = require('../src/main/slot-sync')

describe('slot sync runtime patch engine', () => {
  test('maps slot indexes to letters used by video wall logs', () => {
    assert.equal(slotLetter(0), 'A')
    assert.equal(slotLetter(1), 'B')
    assert.equal(slotLetter(11), 'L')
  })

  test('defaults a template id push without action to full layout reload', () => {
    const payload = normalizePayload({ id: 20 })
    assert.equal(payload.action, ACTIONS.RELOAD_LAYOUT)
    assert.equal(isFullReload(payload), true)
    assert.equal(isIncremental(payload), false)
  })

  test('numeric slot ids in a payload keep the cell index so the replacement lands on the right cell', () => {
    const payload = normalizePayload({
      action: 'slot_update',
      slots: [{ index: 0, slot: 2, slot_id: 2, old_slot_id: 83 }]
    })
    assert.equal(payload.action, ACTIONS.SLOT_UPDATE)
    assert.equal(payload.slots[0].index, 0)
    assert.equal(payload.slots[0].slot, 'A')
    assert.equal(payload.slots[0].slot_id, 2)
    assert.equal(isIncremental(payload), true)
    assert.equal(isFullReload(payload), false)
  })

  test('accepts slot_update without rebuilding the layout', () => {
    const payload = normalizePayload({
      action: 'slot_update',
      slot: 'B',
      slot_id: 12
    })
    assert.equal(payload.action, ACTIONS.SLOT_UPDATE)
    assert.equal(payload.slots[0].slot, 'B')
    assert.equal(isIncremental(payload), true)
    assert.equal(isFullReload(payload), false)
  })

  test('layout_changed on an incremental action does not force a layout reload', () => {
    const payload = normalizePayload({
      action: 'slot_update',
      layout_changed: true,
      slot_id: 6
    })
    assert.equal(isFullReload(payload), false)
    assert.equal(isIncremental(payload), true)
  })

  test('accepts playlist_update with template id', () => {
    const payload = normalizePayload({
      action: 'playlist_update',
      template_id: 20,
      slots: [{ slot_id: 55, index: 1 }]
    })
    assert.equal(payload.action, ACTIONS.PLAYLIST_UPDATE)
    assert.equal(payload.template_id, 20)
    assert.equal(payload.slots[0].slot, 'B')
    assert.equal(isIncremental(payload), true)
  })

  test('builds a renderer script that prefers the runtime patch hook', () => {
    const script = buildRuntimeScript({
      action: 'slot_update',
      slots: [{ slot: 'B', slot_id: 12, index: 1 }]
    })
    assert.match(script, /cleverApplyRuntimeUpdate/)
    assert.match(script, /clever-runtime-update/)
    assert.match(script, /"action":"slot_update"/)
    assert.equal(script.includes('loadURL'), false)
  })

  test('describes monitoring log lines for slot, playlist, and webcast updates', () => {
    assert.deepEqual(
      describeUpdate({ action: 'slot_update', slots: [{ slot: 'B' }] }),
      ['[INFO] Slot B updated']
    )
    assert.deepEqual(
      describeUpdate({ action: 'playlist_update', slots: [{ slot_id: 55 }] }),
      ['[INFO] Playlist 55 updated']
    )
    assert.deepEqual(
      describeUpdate({
        action: 'content_update',
        slots: [{ slot: '3', mode: 'web', reason: 'webcast' }]
      }),
      ['[INFO] WebCast Slot 3 soft reloaded']
    )
  })

  test('falls back to reload_layout when the renderer cannot apply a patch', () => {
    assert.equal(shouldFallbackToReload(null), true)
    assert.equal(shouldFallbackToReload({ applied: false }), true)
    assert.equal(shouldFallbackToReload({ applied: true, action: 'slot_update' }), false)
  })
})
