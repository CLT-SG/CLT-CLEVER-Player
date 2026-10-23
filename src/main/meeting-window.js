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

function chromeLikeUserAgent() {
  const raw = typeof process !== 'undefined' && process.versions
    ? String(process.versions.chrome || '')
    : ''
  const chrome = raw || '134.0.0.0'
  // Intentionally omit Electron/ token — Meet treats Electron UA as unsupported.
  if (process.platform === 'darwin') {
    return `Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/${chrome} Safari/537.36`
  }
  if (process.platform === 'win32') {
    return `Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/${chrome} Safari/537.36`
  }
  return `Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/${chrome} Safari/537.36`
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

function buildPrejoinScript(displayName) {
  const name = JSON.stringify(String(displayName || 'CLEVER Display').slice(0, 60))
  return `(function(){
    try {
      var name = ${name};
      var inputs = Array.prototype.slice.call(document.querySelectorAll('input'));
      for (var i = 0; i < inputs.length; i++) {
        var input = inputs[i];
        var typ = (input.getAttribute('type') || 'text').toLowerCase();
        if (typ !== 'text' && typ !== 'search' && typ !== '') continue;
        var al = ((input.getAttribute('aria-label') || '') + ' ' + (input.placeholder || '') + ' ' + (input.getAttribute('name') || '')).toLowerCase();
        if (al.indexOf('name') === -1) continue;
        var setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value');
        if (setter && setter.set) setter.set.call(input, name); else input.value = name;
        input.dispatchEvent(new Event('input', { bubbles: true }));
        input.dispatchEvent(new Event('change', { bubbles: true }));
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
  const { BrowserWindow, session } = electronApi()
  const partition = 'persist:clever-meeting-' + String(options.platform || 'generic')
  const sess = session.fromPartition(partition)

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
    if (win.webContents.getURL() !== url) {
      win.loadURL(url, { userAgent: chromeLikeUserAgent() }).catch((err) => {
        errorLog.warn('meeting window reload failed', err && err.message)
      })
    }
    win.show()
    return { ok: true, reused: true, mode: 'browser_window' }
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

  win.webContents.setUserAgent(chromeLikeUserAgent())

  win.webContents.on('did-finish-load', () => {
    const script = buildPrejoinScript(options.displayName)
    setTimeout(() => {
      if (win.isDestroyed()) return
      win.webContents.executeJavaScript(script, true).catch(() => {})
    }, 1600)
  })

  win.loadURL(url, { userAgent: chromeLikeUserAgent() }).then(() => {
    log.info('Opened meeting browser window', { slotId: key, platform: options.platform || null })
  }).catch((err) => {
    errorLog.warn('meeting window load failed', err && err.message)
  })

  return { ok: true, reused: false, mode: 'browser_window' }
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
  normalizeBounds,
  isHttpUrl,
  windows
}
