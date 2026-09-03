'use strict'

const ACTIONS = Object.freeze({
  NOOP: 'noop',
  RELOAD_LAYOUT: 'reload_layout',
  SLOT_UPDATE: 'slot_update',
  PLAYLIST_UPDATE: 'playlist_update',
  CONTENT_UPDATE: 'content_update'
})

const INCREMENTAL_ACTIONS = Object.freeze([
  ACTIONS.SLOT_UPDATE,
  ACTIONS.PLAYLIST_UPDATE,
  ACTIONS.CONTENT_UPDATE
])

function slotLetter(index) {
  if (index === null || index === undefined || index < 0) {
    return ''
  }
  let n = Number(index) + 1
  let letter = ''
  while (n > 0) {
    n -= 1
    letter = String.fromCharCode(65 + (n % 26)) + letter
    n = Math.floor(n / 26)
  }
  return letter
}

function normalizePayload(body) {
  const source = body && typeof body === 'object' ? body : {}
  let action = typeof source.action === 'string' && source.action
    ? source.action
    : null

  if (!action) {
    if (source.id && !source.slot && !source.slot_id && !Array.isArray(source.slots)) {
      action = ACTIONS.RELOAD_LAYOUT
    } else {
      action = ACTIONS.SLOT_UPDATE
    }
  }

  let slots = Array.isArray(source.slots) ? source.slots.slice() : []
  if (slots.length === 0 && (source.slot !== undefined || source.slot_id !== undefined || source.index !== undefined)) {
    slots = [{
      slot: source.slot,
      slot_id: source.slot_id,
      index: source.index,
      reason: source.reason,
      mode: source.mode,
      version: source.version,
      playlist_version: source.playlist_version,
      template_id: source.template_id,
      soft_reload: source.soft_reload
    }]
  }

  slots = slots.map((slot, offset) => {
    const index = Number.isInteger(slot && slot.index) ? slot.index : offset
    const letter = slot && typeof slot.slot === 'string' && slot.slot
      ? slot.slot
      : slotLetter(index)
    return Object.assign({}, slot, {
      index,
      slot: letter
    })
  })

  return {
    action,
    template_id: source.template_id || source.templateId || source.id || null,
    layout_version: source.layout_version || null,
    layout_changed: Boolean(source.layout_changed),
    slots,
    reason: source.reason || null,
    templateData: source.templateData,
    pushed: source.pushed
  }
}

function isFullReload(payload) {
  if (!payload) {
    return true
  }
  return payload.action === ACTIONS.RELOAD_LAYOUT
}

function isIncremental(payload) {
  if (!payload || isFullReload(payload)) {
    return false
  }
  return INCREMENTAL_ACTIONS.includes(payload.action)
}

function buildRuntimeScript(payload) {
  const encoded = JSON.stringify(payload || {})
  return `(function () {
    var payload = ${encoded};
    try {
      if (typeof window.cleverApplyRuntimeUpdate === 'function') {
        var result = window.cleverApplyRuntimeUpdate(payload);
        return result && typeof result.then === 'function'
          ? { applied: true, deferred: true, action: payload.action }
          : Object.assign({ applied: true, action: payload.action }, result || {});
      }
      window.dispatchEvent(new CustomEvent('clever-runtime-update', { detail: payload }));
      return { applied: true, action: payload.action, via: 'event' };
    } catch (error) {
      return { applied: false, error: String(error && error.message ? error.message : error) };
    }
  })()`
}

function describeUpdate(payload) {
  if (!payload) {
    return ['[INFO] Slot updated']
  }
  if (isFullReload(payload)) {
    const templateId = payload.template_id ? ` template ${payload.template_id}` : ''
    return [`[INFO] Layout reload${templateId}`]
  }

  const slots = Array.isArray(payload.slots) && payload.slots.length > 0
    ? payload.slots
    : [{ slot: payload.slot, slot_id: payload.slot_id, index: payload.index, mode: payload.mode, reason: payload.reason }]

  return slots.map((slot) => {
    const letter = slot.slot || slotLetter(slot.index)
    const slotId = slot.slot_id || slot.id || ''
    if (payload.action === ACTIONS.PLAYLIST_UPDATE) {
      return `[INFO] Playlist ${slotId || letter} updated`
    }
    if (payload.action === ACTIONS.CONTENT_UPDATE && (slot.mode === 'web' || slot.reason === 'webcast')) {
      return `[INFO] WebCast Slot ${letter || slot.index} soft reloaded`
    }
    if (letter) {
      return `[INFO] Slot ${letter} updated`
    }
    return `[INFO] Slot ${slot.index !== undefined ? slot.index : ''} updated`.trim()
  })
}

function shouldFallbackToReload(result) {
  if (!result) {
    return true
  }
  if (result.applied === false) {
    return true
  }
  return false
}

module.exports = {
  ACTIONS,
  INCREMENTAL_ACTIONS,
  slotLetter,
  normalizePayload,
  isFullReload,
  isIncremental,
  buildRuntimeScript,
  describeUpdate,
  shouldFallbackToReload
}
