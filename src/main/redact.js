'use strict'

const SENSITIVE_KEYS = [
  'password',
  'passwd',
  'token',
  'secret',
  'authorization',
  'api[-_]?key',
  'private[-_]?key',
  'serialkey',
  'credential',
  'cookie'
]

const KEY_VALUE_PATTERN = new RegExp(
  `\\b(${SENSITIVE_KEYS.join('|')})(["']?\\s*[:=]\\s*)(["']?)([^\\s,;&"']+)`,
  'gi'
)

const BEARER_PATTERN = /Bearer\s+[A-Za-z0-9._\-+/=]+/gi
const PEM_PATTERN = /-----BEGIN [A-Z ]*PRIVATE KEY-----[\s\S]*?-----END [A-Z ]*PRIVATE KEY-----/gi
const COOKIE_PATTERN = /set-cookie["']?\s*:\s*\[[\s\S]*?\]/gi
const HEADER_BLOCK_PATTERN = /Headers:\s*\{[\s\S]*?\n\}/gi

function redact(value) {
  if (value == null) {
    return value
  }

  if (value instanceof Error) {
    return redact(value.stack || value.message)
  }

  if (typeof value === 'object') {
    try {
      return redact(JSON.stringify(value))
    } catch {
      return '[unserializable]'
    }
  }

  return String(value)
    .replace(BEARER_PATTERN, 'Bearer [REDACTED]')
    .replace(PEM_PATTERN, '[REDACTED PRIVATE KEY]')
    .replace(COOKIE_PATTERN, 'set-cookie: [REDACTED]')
    .replace(HEADER_BLOCK_PATTERN, 'Headers: [REDACTED]')
    .replace(KEY_VALUE_PATTERN, '$1$2$3[REDACTED]')
}

function redactArgs(args) {
  return args.map((arg) => redact(arg))
}

module.exports = {
  redact,
  redactArgs
}
