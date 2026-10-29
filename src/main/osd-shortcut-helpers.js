'use strict'

const { isValidAccelerator } = require('./config-template')

const DEFAULT_OSD_SHORTCUTS = Object.freeze(['Alt+O'])

function normalizeShortcutList(primary, alternate) {
  const list = []
  const seen = new Set()
  ;[primary, alternate].forEach((value) => {
    if (!isValidAccelerator(value)) return
    const key = String(value)
    const id = key.toLowerCase()
    if (seen.has(id)) return
    seen.add(id)
    list.push(key)
  })
  return list.length ? list : DEFAULT_OSD_SHORTCUTS.slice()
}

module.exports = {
  DEFAULT_OSD_SHORTCUTS,
  normalizeShortcutList,
}
