'use strict'

/**
 * CLEVER-Player application audio (separate from OS master volume).
 *
 * Electron does not expose a true master app gain. We:
 * - mute/unmute every living webContents via setAudioMuted
 * - track a soft application volume (0–100) for OSD state / future hooks
 *
 * This never remounts webviews or changes slot assignments.
 */

const { webContents } = require('electron')

let applicationMuted = false
let applicationVolume = 100

function clampVolume(value) {
  const n = Number(value)
  if (!Number.isFinite(n)) return null
  return Math.max(0, Math.min(100, Math.round(n)))
}

function listLiveContents() {
  try {
    return webContents.getAllWebContents().filter((wc) => wc && !wc.isDestroyed())
  } catch {
    return []
  }
}

function applyMuteToAll(muted) {
  const flag = !!muted
  let applied = 0
  listLiveContents().forEach((wc) => {
    try {
      if (typeof wc.setAudioMuted === 'function') {
        wc.setAudioMuted(flag)
        applied += 1
      }
    } catch {
      // ignore per-contents failures
    }
  })
  return applied
}

function getApplicationAudioState() {
  return {
    ok: true,
    applicationVolumeSupported: true,
    applicationMuteSupported: true,
    volume: applicationVolume,
    muted: applicationMuted,
    note: 'Application mute affects CLEVER-Player webContents only; it is separate from OS master volume.'
  }
}

function setApplicationMute(muted) {
  applicationMuted = !!muted
  const applied = applyMuteToAll(applicationMuted)
  return {
    ok: true,
    muted: applicationMuted,
    applied
  }
}

function setApplicationVolume(volume) {
  const v = clampVolume(volume)
  if (v === null) return { ok: false, error: 'Invalid volume' }
  applicationVolume = v
  // Soft volume: mute at 0, otherwise unmute if app mute was only from volume.
  if (v === 0) {
    applicationMuted = true
    applyMuteToAll(true)
  } else if (applicationMuted && v > 0) {
    // Volume raise does not auto-unmute if the operator explicitly muted;
    // only auto-unmute when mute was implied by volume 0.
    // Keep explicit mute sticky — operator uses unmute.
  }
  return {
    ok: true,
    volume: applicationVolume,
    muted: applicationMuted,
    note: 'Electron has no global app gain; volume 0 mutes player webContents. Prefer system master volume for loudness.'
  }
}

function reassertApplicationMute() {
  if (applicationMuted) {
    applyMuteToAll(true)
  }
}

module.exports = {
  getApplicationAudioState,
  setApplicationMute,
  setApplicationVolume,
  reassertApplicationMute,
  clampVolume
}
