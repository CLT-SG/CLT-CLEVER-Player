'use strict'

function stripQuotes(value) {
  const text = String(value)
  if (
    (text.startsWith('"') && text.endsWith('"') && text.length >= 2)
    || (text.startsWith("'") && text.endsWith("'") && text.length >= 2)
  ) {
    return text.slice(1, -1)
  }
  return text
}

function parseIni(text) {
  const result = {}
  let section = ''
  const source = String(text || '').replace(/^\uFEFF/, '')
  const lines = source.split(/\r?\n/)

  for (const rawLine of lines) {
    const line = rawLine.trim()
    if (!line || line.startsWith('#') || line.startsWith(';')) {
      continue
    }

    const sectionMatch = line.match(/^\[([^\]]+)]$/)
    if (sectionMatch) {
      section = sectionMatch[1].trim().toUpperCase()
      if (!result[section]) {
        result[section] = {}
      }
      continue
    }

    const separator = line.indexOf('=')
    if (separator <= 0) {
      continue
    }

    const key = line.slice(0, separator).trim().toUpperCase()
    if (!key) {
      continue
    }
    const value = stripQuotes(line.slice(separator + 1).trim())
    const targetSection = section || '_ROOT'
    if (!result[targetSection]) {
      result[targetSection] = {}
    }
    result[targetSection][key] = value
  }

  return result
}

function serializeIni(sections, schema) {
  const lines = [
    '; CLEVER Player configuration',
    '; Edit this file with a text editor, save, then restart CLEVER Player.',
    '; Use KEY=VALUE. True/false, numbers, file paths, and http(s) URLs are supported.',
    '; Invalid values are replaced with defaults. Check logs/application.log for details.',
    ''
  ]

  const seen = new Set()
  const grouped = new Map()
  for (const field of schema) {
    if (!grouped.has(field.section)) {
      grouped.set(field.section, [])
    }
    grouped.get(field.section).push(field)
  }

  for (const [section, fields] of grouped) {
    lines.push(`[${section}]`)
    for (const field of fields) {
      if (field.comment) {
        lines.push(`; ${field.comment}`)
      }
      const value = sections[section] && Object.prototype.hasOwnProperty.call(sections[section], field.key)
        ? sections[section][field.key]
        : field.default
      lines.push(`${field.key}=${formatIniValue(value, field)}`)
      seen.add(`${section}.${field.key}`)
    }
    const extraInSection = Object.entries(sections[section] || {}).filter(([key]) => !seen.has(`${section}.${key}`))
    for (const [key, value] of extraInSection) {
      lines.push(`${key}=${formatIniValue(value, { type: 'string' })}`)
      seen.add(`${section}.${key}`)
    }
    lines.push('')
  }

  for (const [section, values] of Object.entries(sections)) {
    const extras = Object.entries(values || {}).filter(([key]) => !seen.has(`${section}.${key}`))
    if (extras.length === 0) {
      continue
    }
    lines.push(`; Additional ${section} settings`)
    lines.push(`[${section}]`)
    for (const [key, value] of extras) {
      lines.push(`${key}=${formatIniValue(value, { type: 'string' })}`)
    }
    lines.push('')
  }

  return `${lines.join('\n').trim()}\n`
}

function formatIniValue(value, field) {
  const type = typeof field === 'string' ? field : field && field.type
  if (type === 'boolean') {
    return value === true || value === 'true' ? 'true' : 'false'
  }
  if (value === undefined || value === null) {
    return ''
  }
  if (field && field.key === 'LOG_LEVEL') {
    return String(value).toUpperCase()
  }
  return String(value)
}

function flattenIni(parsed) {
  const flat = {}
  for (const [section, values] of Object.entries(parsed || {})) {
    for (const [key, value] of Object.entries(values || {})) {
      flat[key] = value
      flat[`${section}.${key}`] = value
    }
  }
  return flat
}

module.exports = {
  parseIni,
  serializeIni,
  flattenIni,
  formatIniValue
}
