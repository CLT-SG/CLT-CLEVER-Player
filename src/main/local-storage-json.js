'use strict'

/**
 * Encode a value for embedding in executeJavaScript localStorage.setItem(...).
 * The evaluated argument must be a JS string whose contents JSON.parse to the
 * layout object (same convention as Console save / shortkey apply).
 *
 * - objects/arrays → JSON.stringify twice (once for storage text, once for JS literal)
 * - strings → JSON.stringify once (already storage text, possibly JSON document)
 * - null/undefined → empty string literal
 */
function encodeLocalStorageJson(value) {
  if (value == null) {
    return JSON.stringify('')
  }
  if (typeof value === 'string') {
    return JSON.stringify(value)
  }
  return JSON.stringify(JSON.stringify(value))
}

module.exports = {
  encodeLocalStorageJson
}
