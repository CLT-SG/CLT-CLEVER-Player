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

/**
 * Retry controller reachability on boot. A single early failure (NIC/DHCP
 * not ready yet) previously flashed offline.html then recovered — avoid that.
 */
async function waitUntilReachable(target, {
  timeout = 2500,
  attempts = 6,
  delayMs = 400
} = {}) {
  for (let i = 0; i < attempts; i++) {
    try {
      if (await isReachable(target, { timeout })) {
        return true
      }
    } catch {
      // continue
    }
    if (i < attempts - 1) {
      await new Promise((resolve) => setTimeout(resolve, delayMs + i * 250))
    }
  }
  return false
}

module.exports = {
  normalizeUrl,
  isReachable,
  waitUntilReachable
}
