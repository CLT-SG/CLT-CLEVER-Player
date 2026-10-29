'use strict'

const DEFAULT_LAYOUT_RESOLUTION = Object.freeze({ width: 3840, height: 2160 })

function tryParseLayoutResolution(value) {
  const text = value && typeof value === 'object'
    ? (value.width && value.height ? `${value.width}x${value.height}` : '')
    : String(value || '')
  const match = text.match(/(\d+)\s*[x×]\s*(\d+)/i)
  if (!match) return null
  const width = parseInt(match[1], 10)
  const height = parseInt(match[2], 10)
  if (!(width > 0 && height > 0)) return null
  return { width, height }
}

function parseLayoutResolution(value, fallback) {
  const def = fallback && fallback.width > 0 && fallback.height > 0
    ? fallback
    : DEFAULT_LAYOUT_RESOLUTION
  return tryParseLayoutResolution(value) || { width: def.width, height: def.height }
}

function formatLayoutResolution(value, fallback) {
  const parsed = parseLayoutResolution(value, fallback)
  return `${parsed.width}x${parsed.height}`
}

function sameLayoutResolution(left, right) {
  const a = tryParseLayoutResolution(left)
  const b = tryParseLayoutResolution(right)
  if (!a || !b) return false
  return a.width === b.width && a.height === b.height
}

/**
 * Resolve destination template resolution from localStorage JSON text or object.
 */
function resolutionFromTemplateData(raw) {
  if (raw == null || raw === '') return null
  let data = raw
  if (typeof raw === 'string') {
    try {
      data = JSON.parse(raw)
    } catch {
      return tryParseLayoutResolution(raw)
    }
  }
  if (data && typeof data === 'object') {
    return tryParseLayoutResolution(data.resolution)
  }
  return null
}

module.exports = {
  DEFAULT_LAYOUT_RESOLUTION,
  tryParseLayoutResolution,
  parseLayoutResolution,
  formatLayoutResolution,
  sameLayoutResolution,
  resolutionFromTemplateData
}
