'use strict'

/**
 * Dedicated top-level BrowserWindows for Meeting Cast.
 *
 * Meeting Cast is intentionally NOT Webcast: live player display uses a real
 * Electron BrowserWindow over the slot. Providers such as Google Meet often
 * work in Chrome but fail inside Electron <webview> guests.
 */

/** @type {Map<string, import('electron').BrowserWindow>} */
const windows = new Map()

function electronApi () {
  // Lazy-require so unit tests can import helpers without a local Electron binary.
  return require('electron')
}

function loggers () {
  return require('./logger').getLoggers()
}

/**
 * Stock Google Chrome user-agent (never Electron).
 * Uses the player's Chromium version so the major matches the real engine.
 */
function chromeLikeUserAgent() {
  const raw = typeof process !== 'undefined' && process.versions
    ? String(process.versions.chrome || '')
    : ''
  const chrome = raw || '134.0.0.0'
  // Intentionally omit Electron/ and app-name tokens — Meet rejects Electron UA.
  if (process.platform === 'darwin') {
    return `Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/${chrome} Safari/537.36`
  }
  if (process.platform === 'win32') {
    return `Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/${chrome} Safari/537.36`
  }
  return `Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/${chrome} Safari/537.36`
}

function chromeClientHintBrands(chromeVersion) {
  const major = String(chromeVersion || '134').split('.')[0] || '134'
  // Mirror Chrome's Sec-CH-UA brand list — never advertise Electron.
  return `"Chromium";v="${major}", "Not:A-Brand";v="24", "Google Chrome";v="${major}"`
}

function chromeClientHintPlatform() {
  if (process.platform === 'darwin') return '"macOS"'
  if (process.platform === 'win32') return '"Windows"'
  return '"Linux"'
}

/**
 * Force Chrome UA + client hints on the meeting session so navigations,
 * XHR, and WebSocket upgrades never send Electron's default identity.
 */
function applyChromeIdentity(sess) {
  const ua = chromeLikeUserAgent()
  const chromeVersion = (typeof process !== 'undefined' && process.versions
    ? String(process.versions.chrome || '')
    : '') || '134.0.0.0'
  const brands = chromeClientHintBrands(chromeVersion)
  const platform = chromeClientHintPlatform()

  try {
    if (typeof sess.setUserAgent === 'function') {
      sess.setUserAgent(ua)
    }
  } catch {
    // ignore
  }

  try {
    if (!sess.__cleverMeetingChromeIdentityHooked && sess.webRequest && sess.webRequest.onBeforeSendHeaders) {
      sess.__cleverMeetingChromeIdentityHooked = true
      sess.webRequest.onBeforeSendHeaders((details, callback) => {
        const headers = { ...(details.requestHeaders || {}) }
        Object.keys(headers).forEach((key) => {
          if (/^user-agent$/i.test(key) || /^sec-ch-ua/i.test(key)) {
            delete headers[key]
          }
        })
        headers['User-Agent'] = ua
        headers['Sec-CH-UA'] = brands
        headers['Sec-CH-UA-Mobile'] = '?0'
        headers['Sec-CH-UA-Platform'] = platform
        callback({ requestHeaders: headers })
      })
    }
  } catch {
    // ignore — older Electron builds may not expose webRequest the same way
  }

  return ua
}

function normalizeBounds(bounds) {
  const x = Math.round(Number(bounds && bounds.x) || 0)
  const y = Math.round(Number(bounds && bounds.y) || 0)
  const width = Math.max(320, Math.round(Number(bounds && bounds.width) || 1280))
  const height = Math.max(240, Math.round(Number(bounds && bounds.height) || 720))
  return { x, y, width, height }
}

function isHttpUrl(url) {
  return typeof url === 'string' && /^https?:\/\//i.test(url.trim())
}

function slotKey(slotId) {
  return String(slotId == null ? '0' : slotId)
}

function closeMeetingWindow(slotId) {
  const key = slotKey(slotId)
  const win = windows.get(key)
  if (!win) return { ok: true, closed: false }
  windows.delete(key)
  try {
    if (!win.isDestroyed()) win.destroy()
  } catch {
    // ignore
  }
  return { ok: true, closed: true }
}

function closeAllMeetingWindows() {
  for (const key of Array.from(windows.keys())) {
    closeMeetingWindow(key)
  }
}

function setNativeInputValueScript() {
  return `function setNativeValue(input, value) {
      var setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value');
      if (setter && setter.set) setter.set.call(input, value); else input.value = value;
      input.dispatchEvent(new Event('input', { bubbles: true }));
      input.dispatchEvent(new Event('change', { bubbles: true }));
    }`
}

/**
 * Best-effort guest name fill + Ask to join, or signed-in email/password autofill.
 * MFA / SSO still require operator interaction.
 */
function buildJoinAssistScript(joinAssist = {}, displayNameFallback) {
  const mode = String((joinAssist && joinAssist.identityMode) || 'guest')
  const guestName = JSON.stringify(String(
    (joinAssist && joinAssist.guestDisplayName) || displayNameFallback || 'CLEVER Display'
  ).slice(0, 60))
  const loginId = JSON.stringify(String((joinAssist && joinAssist.loginIdentifier) || '').slice(0, 191))
  const loginPassword = JSON.stringify(String((joinAssist && joinAssist.loginPassword) || '').slice(0, 256))
  const phone = JSON.stringify(String(
    (joinAssist && joinAssist.loginConfig && joinAssist.loginConfig.phone) || ''
  ).slice(0, 64))

  if (mode === 'signed_in') {
    return `(function(){
      try {
        ${setNativeInputValueScript()}
        var loginId = ${loginId};
        var password = ${loginPassword};
        var phone = ${phone};
        var identifier = loginId || phone;
        if (!identifier && !password) return null;
        var inputs = Array.prototype.slice.call(document.querySelectorAll('input'));
        for (var i = 0; i < inputs.length; i++) {
          var input = inputs[i];
          if (input.disabled || input.readOnly) continue;
          var typ = (input.getAttribute('type') || 'text').toLowerCase();
          var al = ((input.getAttribute('aria-label') || '') + ' ' + (input.placeholder || '') + ' ' +
            (input.getAttribute('name') || '') + ' ' + (input.getAttribute('autocomplete') || '') + ' ' +
            (input.id || '')).toLowerCase();
          if (identifier && (typ === 'email' || typ === 'text' || typ === 'tel' || typ === 'search' || typ === '')) {
            if (/email|username|user name|login|account|phone|identifier/.test(al) || typ === 'email' || typ === 'tel') {
              setNativeValue(input, identifier);
            }
          }
          if (password && typ === 'password') {
            setNativeValue(input, password);
          }
        }
        var labels = ['next', 'continue', 'sign in', 'signin', 'log in', 'login', 'submit'];
        var nodes = Array.prototype.slice.call(document.querySelectorAll('button, [role="button"], input[type="submit"]'));
        for (var j = 0; j < nodes.length; j++) {
          var n = nodes[j];
          if (n.disabled) continue;
          var text = ((n.innerText || n.value || n.getAttribute('aria-label') || '') + '').replace(/\\s+/g, ' ').trim().toLowerCase();
          for (var k = 0; k < labels.length; k++) {
            if (text === labels[k] || text.indexOf(labels[k]) === 0) { n.click(); return 'signed_in:' + labels[k]; }
          }
        }
        return 'signed_in:filled';
      } catch (e) { return null; }
    })()`
  }

  return `(function(){
    try {
      ${setNativeInputValueScript()}
      var name = ${guestName};
      var inputs = Array.prototype.slice.call(document.querySelectorAll('input'));
      for (var i = 0; i < inputs.length; i++) {
        var input = inputs[i];
        var typ = (input.getAttribute('type') || 'text').toLowerCase();
        if (typ !== 'text' && typ !== 'search' && typ !== '') continue;
        var al = ((input.getAttribute('aria-label') || '') + ' ' + (input.placeholder || '') + ' ' + (input.getAttribute('name') || '')).toLowerCase();
        if (al.indexOf('name') === -1) continue;
        setNativeValue(input, name);
      }
      var nodes = Array.prototype.slice.call(document.querySelectorAll('button, [role="button"]'));
      for (var j = 0; j < nodes.length; j++) {
        var n = nodes[j];
        if (n.disabled) continue;
        var text = ((n.innerText || n.getAttribute('aria-label') || '') + '').replace(/\\s+/g, ' ').trim().toLowerCase();
        if (text === 'ask to join') { n.click(); return 'ask to join'; }
      }
      return null;
    } catch (e) { return null; }
  })()`
}

/**
 * Open or reuse a meeting BrowserWindow for a Video Wall / Console slot.
 *
 * @param {object} options
 * @param {string|number} options.slotId
 * @param {string} options.url
 * @param {{x:number,y:number,width:number,height:number}} options.bounds
 * @param {string} [options.displayName]
 * @param {string} [options.platform]
 * @param {object} [options.joinAssist]
 * @param {import('electron').BrowserWindow} [options.parent]
 */
function openMeetingWindow(options = {}) {
  const { log, errorLog } = loggers()
  const url = String(options.url || '').trim()
  if (!isHttpUrl(url)) {
    return { ok: false, error: 'invalid_url' }
  }

  const key = slotKey(options.slotId)
  const bounds = normalizeBounds(options.bounds)
  const joinAssist = options.joinAssist && typeof options.joinAssist === 'object'
    ? options.joinAssist
    : { identityMode: 'guest', guestDisplayName: options.displayName }
  const { BrowserWindow, session } = electronApi()
  // Persist cookies per platform + identity mode so guest/signed-in sessions stay separate.
  const partition = 'persist:clever-meeting-' +
    String(options.platform || 'generic') + '-' +
    String(joinAssist.identityMode || 'guest')
  const sess = session.fromPartition(partition)
  const userAgent = applyChromeIdentity(sess)

  // Ensure media permissions for Meet/Zoom in this session.
  try {
    sess.setPermissionRequestHandler((_wc, permission, callback) => {
      const allowed = new Set(['media', 'mediaKeySystem', 'fullscreen', 'clipboard-sanitized-write', 'display-capture'])
      callback(allowed.has(permission))
    })
    sess.setPermissionCheckHandler((_wc, permission) => {
      const allowed = new Set(['media', 'mediaKeySystem', 'fullscreen', 'clipboard-sanitized-write', 'display-capture'])
      return allowed.has(permission)
    })
  } catch {
    // ignore
  }

  let win = windows.get(key)
  if (win && !win.isDestroyed()) {
    win.setBounds(bounds)
    try {
      win.webContents.setUserAgent(userAgent)
    } catch {
      // ignore
    }
    if (win.webContents.getURL() !== url) {
      win.loadURL(url, { userAgent }).catch((err) => {
        errorLog.warn('meeting window reload failed', err && err.message)
      })
    }
    win.show()
    return { ok: true, reused: true, mode: 'browser_window', userAgent }
  }

  win = new BrowserWindow({
    parent: options.parent && !options.parent.isDestroyed() ? options.parent : undefined,
    x: bounds.x,
    y: bounds.y,
    width: bounds.width,
    height: bounds.height,
    frame: false,
    transparent: false,
    backgroundColor: '#202124',
    show: false,
    autoHideMenuBar: true,
    fullscreenable: false,
    resizable: true,
    movable: false,
    minimizable: false,
    maximizable: false,
    closable: true,
    skipTaskbar: true,
    webPreferences: {
      // No CLEVER preload — Meet must not see Electron bridge APIs.
      preload: undefined,
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      webSecurity: true,
      spellcheck: false,
      partition,
      // Background throttling can stall Meet WebRTC when the wall has many slots.
      backgroundThrottling: false
    }
  })

  windows.set(key, win)

  win.once('ready-to-show', () => {
    if (!win.isDestroyed()) win.show()
  })

  win.on('closed', () => {
    if (windows.get(key) === win) windows.delete(key)
  })

  win.webContents.setUserAgent(userAgent)

  win.webContents.on('did-finish-load', () => {
    const script = buildJoinAssistScript(joinAssist, options.displayName)
    const delay = (joinAssist.identityMode === 'signed_in') ? 2200 : 1600
    setTimeout(() => {
      if (win.isDestroyed()) return
      win.webContents.executeJavaScript(script, true).catch(() => {})
    }, delay)
  })

  win.loadURL(url, { userAgent }).then(() => {
    log.info('Opened meeting browser window', {
      slotId: key,
      platform: options.platform || null,
      identityMode: joinAssist.identityMode || 'guest',
      userAgent
    })
  }).catch((err) => {
    errorLog.warn('meeting window load failed', err && err.message)
  })

  return {
    ok: true,
    reused: false,
    mode: 'browser_window',
    userAgent,
    identityMode: joinAssist.identityMode || 'guest'
  }
}

function updateMeetingBounds(slotId, bounds) {
  const key = slotKey(slotId)
  const win = windows.get(key)
  if (!win || win.isDestroyed()) return { ok: false, error: 'missing' }
  win.setBounds(normalizeBounds(bounds))
  return { ok: true }
}

module.exports = {
  openMeetingWindow,
  closeMeetingWindow,
  closeAllMeetingWindows,
  updateMeetingBounds,
  chromeLikeUserAgent,
  chromeClientHintBrands,
  applyChromeIdentity,
  buildJoinAssistScript,
  normalizeBounds,
  isHttpUrl,
  windows
}
