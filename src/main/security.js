'use strict'

const { app, shell, session } = require('electron')
const path = require('path')
const { pathToFileURL } = require('url')
const { getLoggers } = require('./logger')

function parseUrl(value) {
  try {
    return new URL(value)
  } catch {
    return null
  }
}

function isPrivateHost(hostname) {
  return require('./config-template').isPrivateHost(hostname)
}

function isAppFileUrl(urlValue) {
  const parsed = parseUrl(urlValue)
  if (!parsed || parsed.protocol !== 'file:') {
    return false
  }

  const appPath = path.resolve(app.getAppPath())
  const decodedPath = decodeURIComponent(parsed.pathname)
  const filePath = process.platform === 'win32' && decodedPath.startsWith('/')
    ? decodedPath.slice(1)
    : decodedPath
  const resolved = path.resolve(filePath)
  return resolved === appPath || resolved.startsWith(appPath + path.sep)
}

function isAllowedMainNavigation(urlValue, config) {
  if (!urlValue) {
    return false
  }
  if (urlValue === 'about:blank') {
    return true
  }
  if (isAppFileUrl(urlValue)) {
    return true
  }

  const parsed = parseUrl(urlValue)
  if (!parsed) {
    return false
  }
  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
    return false
  }

  const allowedHosts = new Set()
  if (config) {
    for (const value of [config.hostserver, config.controller, config.cleverweb, config.mediaserver, config.screenserver]) {
      if (!value) {
        continue
      }
      try {
        const host = String(value).split(':')[0]
        if (host) {
          allowedHosts.add(host.toLowerCase())
        }
        const asUrl = parseUrl(normalizeMaybeUrl(value))
        if (asUrl) {
          allowedHosts.add(asUrl.hostname.toLowerCase())
        }
      } catch {
        // Ignore malformed config hosts.
      }
    }
  }

  if (allowedHosts.has(parsed.hostname.toLowerCase())) {
    return true
  }

  return isPrivateHost(parsed.hostname)
}

function normalizeMaybeUrl(value) {
  const text = String(value)
  if (/^https?:\/\//i.test(text)) {
    return text
  }
  return `http://${text}`
}

function isAllowedWebviewNavigation(urlValue) {
  const parsed = parseUrl(urlValue)
  if (!parsed) {
    return false
  }
  return parsed.protocol === 'http:' || parsed.protocol === 'https:' || parsed.protocol === 'about:'
}

function loadConfigSafe() {
  try {
    const CreateConfig = require('../../create-config')
    const { getAppDir } = require('./paths')
    return CreateConfig.readConfig(getAppDir())
  } catch {
    return null
  }
}

function setupSecurity() {
  const { log, errorLog } = getLoggers()

  app.on('web-contents-created', (_event, contents) => {
    contents.setWindowOpenHandler(({ url }) => {
      if (contents.getType() === 'webview' && isAllowedWebviewNavigation(url)) {
        return { action: 'allow' }
      }

      const config = loadConfigSafe()
      if (isAllowedMainNavigation(url, config)) {
        return { action: 'allow' }
      }

      log.warn('Blocked window.open for external URL', url)
      if (url.startsWith('https://') || url.startsWith('http://')) {
        shell.openExternal(url).catch((error) => {
          errorLog.warn('Failed to open external URL', error)
        })
      }
      return { action: 'deny' }
    })

    contents.on('will-navigate', (event, url) => {
      const config = loadConfigSafe()
      const allowed = contents.getType() === 'webview'
        ? isAllowedWebviewNavigation(url)
        : isAllowedMainNavigation(url, config)
      if (!allowed) {
        event.preventDefault()
        log.warn('Blocked navigation', url)
      }
    })

    contents.on('will-attach-webview', (event, webPreferences, params) => {
      webPreferences.nodeIntegration = false
      webPreferences.nodeIntegrationInSubFrames = false
      webPreferences.contextIsolation = true
      webPreferences.webSecurity = true
      webPreferences.allowRunningInsecureContent = false
      webPreferences.enableBlinkFeatures = undefined
      webPreferences.preload = path.join(app.getAppPath(), 'preload.js')

      if (params && params.src && !isAllowedWebviewNavigation(params.src)) {
        event.preventDefault()
        log.warn('Blocked webview src', params.src)
      }
    })

    contents.on('console-message', (_event, level, message, line, sourceId) => {
      if (level >= 2) {
        log.warn('Renderer console', { level, message, line, sourceId })
      }
    })
  })

  app.on('certificate-error', (event, _webContents, url, error, _certificate, callback) => {
    const parsed = parseUrl(url)
    const allow = parsed && (parsed.protocol === 'https:') && isPrivateHost(parsed.hostname)
    if (allow) {
      log.warn('Accepted certificate error for private host', { url, error })
      event.preventDefault()
      callback(true)
      return
    }
    errorLog.warn('Rejected certificate error', { url, error })
    callback(false)
  })

  const applySessionGuards = (sess) => {
    sess.setPermissionRequestHandler((_webContents, permission, callback) => {
      const allowed = new Set(['media', 'mediaKeySystem', 'fullscreen', 'clipboard-sanitized-write'])
      callback(allowed.has(permission))
    })

    sess.setPermissionCheckHandler((_webContents, permission) => {
      const allowed = new Set(['media', 'mediaKeySystem', 'fullscreen', 'clipboard-sanitized-write'])
      return allowed.has(permission)
    })

    sess.setDevicePermissionHandler(() => false)
  }

  app.whenReady().then(() => {
    applySessionGuards(session.defaultSession)
    log.info('Security handlers registered')
  })
}

function getLocalFileUrl(relativePath) {
  return pathToFileURL(path.join(app.getAppPath(), relativePath)).toString()
}

module.exports = {
  setupSecurity,
  isAllowedMainNavigation,
  isAllowedWebviewNavigation,
  isAppFileUrl,
  isPrivateHost,
  getLocalFileUrl
}
