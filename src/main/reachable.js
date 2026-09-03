'use strict'

function normalizeUrl(target) {
  if (!target) {
    return ''
  }
  const value = String(target).trim()
  if (/^https?:\/\//i.test(value)) {
    return value
  }
  return `http://${value}`
}

async function isReachable(target, { timeout = 10000 } = {}) {
  const url = normalizeUrl(target)
  if (!url) {
    return false
  }

  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), timeout)

  try {
    const response = await fetch(url, {
      method: 'GET',
      signal: controller.signal,
      redirect: 'follow'
    })
    return response.status >= 100 && response.status < 500
  } catch {
    return false
  } finally {
    clearTimeout(timer)
  }
}

module.exports = {
  normalizeUrl,
  isReachable
}
