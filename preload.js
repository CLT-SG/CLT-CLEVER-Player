'use strict'

const { contextBridge, ipcRenderer } = require('electron')
const path = require('path')
const { pathToFileURL } = require('url')
const {
  SEND_CHANNELS,
  INVOKE_CHANNELS,
  RECEIVE_CHANNELS,
  SYNC_CHANNELS,
  isAllowed
} = require('./src/main/ipc-channels')

function send(channel, ...args) {
  if (!isAllowed(SEND_CHANNELS, channel)) {
    return
  }
  ipcRenderer.send(channel, ...args)
}

function invoke(channel, ...args) {
  if (!isAllowed(INVOKE_CHANNELS, channel)) {
    return Promise.reject(new Error(`Blocked IPC channel: ${channel}`))
  }
  return ipcRenderer.invoke(channel, ...args)
}

function on(channel, listener) {
  if (!isAllowed(RECEIVE_CHANNELS, channel) || typeof listener !== 'function') {
    return () => {}
  }
  const wrapped = (_event, ...args) => listener(_event, ...args)
  ipcRenderer.on(channel, wrapped)
  return () => ipcRenderer.removeListener(channel, wrapped)
}

function sendSync(channel, ...args) {
  if (!isAllowed(SYNC_CHANNELS, channel)) {
    return null
  }
  return ipcRenderer.sendSync(channel, ...args)
}

const ipcApi = {
  send,
  invoke,
  on,
  removeAllListeners(channel) {
    if (!isAllowed(RECEIVE_CHANNELS, channel)) {
      return
    }
    ipcRenderer.removeAllListeners(channel)
  }
}

const appPath = sendSync('app-get-path', 'app') || ''
const homeDir = sendSync('app-get-path', 'home') || ''
const config = sendSync('app-get-config') || {}

const remoteApi = {
  getCurrentWindow() {
    return {
      setBounds(bounds) {
        send('window-set-bounds', bounds)
      },
      loadURL(url) {
        send('window-load-url', url)
      },
      center() {
        send('window-center')
      },
      show() {
        send('window-show')
      },
      focus() {
        send('window-focus')
      }
    }
  },
  getCurrentWebContents() {
    return {
      openDevTools() {
        send('window-open-devtools')
      }
    }
  },
  app: {
    getAppPath() {
      return appPath
    }
  }
}

contextBridge.exposeInMainWorld('ipcRenderer', ipcApi)
contextBridge.exposeInMainWorld('remote', remoteApi)
contextBridge.exposeInMainWorld('config', config)
contextBridge.exposeInMainWorld('os', {
  homedir() {
    return homeDir
  },
  platform() {
    return process.platform
  }
})
contextBridge.exposeInMainWorld('path', {
  join: (...parts) => path.join(...parts),
  resolve: (...parts) => {
    if (parts.length === 1 && (parts[0] === './preload.js' || parts[0] === 'preload.js')) {
      return path.join(appPath, 'preload.js')
    }
    return path.resolve(...parts)
  },
  normalize: (value) => path.normalize(value || ''),
  dirname: (value) => path.dirname(value || ''),
  sep: path.sep
})
contextBridge.exposeInMainWorld('datetime', {
  format(date, pattern) {
    const d = date instanceof Date ? date : new Date(date)
    const pad = (n) => String(n).padStart(2, '0')
    const map = {
      YYYY: d.getFullYear(),
      MM: pad(d.getMonth() + 1),
      DD: pad(d.getDate()),
      HH: pad(d.getHours()),
      mm: pad(d.getMinutes()),
      ss: pad(d.getSeconds())
    }
    return String(pattern || 'YYYY/MM/DD HH:mm:ss').replace(/YYYY|MM|DD|HH|mm|ss/g, (token) => map[token])
  }
})
contextBridge.exposeInMainWorld('macaddress', {
  one(callback) {
    invoke('app-get-mac')
      .then((mac) => callback(null, mac))
      .catch((error) => callback(error, null))
  }
})
contextBridge.exposeInMainWorld('cleverPlayer', {
  version: sendSync('app-get-version'),
  getConfig: () => invoke('app-get-config'),
  getMac: () => invoke('app-get-mac'),
  getQrDataUrl: (text) => invoke('app-qrcode', text),
  getUpdateStatus: () => invoke('updater-status'),
  checkForUpdates: () => send('updater-check'),
  installUpdate: () => send('updater-install'),
  onUpdateStatus: (listener) => on('updater-status', (_event, payload) => listener(payload)),
  loadConfigure: () => send('window-load-url', pathToFileURL(path.join(appPath, 'src', 'configure.html')).toString()),
  reload: () => send('app-reload')
})
contextBridge.exposeInMainWorld('log', {
  info: (message) => send('app-savelog', ['info', message]),
  warn: (message) => send('app-savelog', ['warn', message]),
  error: (message) => send('app-savelog', ['error', message])
})
