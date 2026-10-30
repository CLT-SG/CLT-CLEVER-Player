'use strict'

const express = require('express')
const cors = require('cors')
if (process.platform === 'linux') {
  // Screenshot composition does not need fonts; this avoids a Skia/Electron symbol collision.
  process.env.DISABLE_SYSTEM_FONTS_LOAD = '1'
}
const { createCanvas, loadImage } = require('@napi-rs/canvas')
const shutdown = require('electron-shutdown-command')
const si = require('systeminformation')
const { getLoggers } = require('./src/main/logger')
const configService = require('./src/main/config-service')
const {
  ACTIONS,
  normalizePayload,
  isFullReload,
  isIncremental,
  buildRuntimeScript,
  describeUpdate,
  shouldFallbackToReload
} = require('./src/main/slot-sync')
const { applyWindowMode, isVideoWallCtrl } = require('./src/main/window-bounds')
const {
  tryParseLayoutResolution,
  sameLayoutResolution,
  formatLayoutResolution,
  resolutionFromTemplateData
} = require('./src/main/layout-resolution')

const port = 9000
let mainWindow
let desktopCapturer
let screen
let server

function loadConfig() {
  try {
    return configService.getLegacyConfig()
  } catch (error) {
    const { errorLog } = getLoggers()
    errorLog.warn('Local API could not load config', error)
    return null
  }
}

function getSettings() {
  try {
    return configService.getValues()
  } catch {
    return {}
  }
}

function previewUrl(config, templateId, pushed) {
  const id = String(templateId ?? config.tempid ?? '').replace(/['"\r\n]/g, '')
  let url = 'http://' + config.controller + '/preview/' + id + '/videowall/' + (pushed ? 'true' : 'false')
  const wallId = String(config.videowall_id ?? config.videowallId ?? '').replace(/['"\r\n]/g, '')
  if (wallId) {
    url += '?videowall_id=' + encodeURIComponent(wallId)
  }
  return url
}

function refitMainWindow() {
  if (!mainWindow || mainWindow.isDestroyed()) {
    return
  }
  if (!screen || typeof screen.getPrimaryDisplay !== 'function') {
    return
  }
  const settings = getSettings()
  if (isVideoWallCtrl(settings)) {
    return
  }
  applyWindowMode(mainWindow, settings, screen.getPrimaryDisplay())
}

async function reloadLayout(payload) {
  const { playerLog } = getLoggers()
  const config = loadConfig()
  if (!config) {
    throw new Error('Config missing')
  }
  if (!mainWindow || mainWindow.isDestroyed()) {
    throw new Error('Main window unavailable')
  }

  const templateId = payload && payload.template_id ? payload.template_id : config.tempid
  const safeId = String(templateId ?? '').replace(/['"\r\n]/g, '')
  if (safeId) {
    configService.updateValues({ TEMPLATE_ID: safeId })
  }

  if (config.ctrltype === 'videowall') {
    await mainWindow.loadURL(previewUrl(config, safeId || config.tempid, Boolean(payload && payload.pushed)))
    refitMainWindow()
    playerLog.info('[INFO] Layout reload')
  }

  return { applied: true, action: ACTIONS.RELOAD_LAYOUT }
}

async function applyRuntimeUpdate(payload) {
  const { playerLog, errorLog } = getLoggers()
  const normalized = normalizePayload(payload)
  describeUpdate(normalized).forEach((line) => playerLog.info(line))

  if (!mainWindow || mainWindow.isDestroyed()) {
    throw new Error('Main window unavailable')
  }

  if (isFullReload(normalized) || !isIncremental(normalized)) {
    return reloadLayout(normalized)
  }

  try {
    const result = await mainWindow.webContents.executeJavaScript(buildRuntimeScript(normalized), true)
    if (shouldFallbackToReload(result, normalized)) {
      playerLog.warn('Incremental update was not applied, falling back to layout reload')
      return reloadLayout(normalized)
    }
    return result || { applied: true, action: normalized.action }
  } catch (error) {
    // Mute failures must never remount VNC / CLEVER-node connections.
    if (normalized.action === ACTIONS.MUTE_UPDATE) {
      errorLog.warn('Mute update failed; preserving existing CLEVER-node / VNC connection', error)
      return { applied: false, action: ACTIONS.MUTE_UPDATE, preserved: true }
    }
    errorLog.warn('Incremental slot update failed, falling back to layout reload', error)
    return reloadLayout(normalized)
  }
}

function setMainWindow(mainWin, desktopCapturerInstance, screenInstance) {
  mainWindow = mainWin
  desktopCapturer = desktopCapturerInstance
  screen = screenInstance
}

const takeScreenshot = () => {
  return new Promise(async (resolve, reject) => {
    try {
      if (!screen || !desktopCapturer) {
        throw new Error('Screen capture is not ready')
      }
      const displays = screen.getAllDisplays()
      const width = displays.reduce((acc, display) => acc + display.workAreaSize.width, 0)
      const height = Math.max(...displays.map((display) => display.workAreaSize.height))
      const sources = await desktopCapturer.getSources({
        types: ['screen'],
        thumbnailSize: { width, height }
      })
      if (sources.length === 0) {
        throw new Error('No screen sources found')
      }
      resolve(sources.map((source) => source.thumbnail.toDataURL()))
    } catch (err) {
      reject(err)
    }
  })
}

const mergeScreenshots = async (screenshots) => {
  const displays = screen.getAllDisplays()
  const width = displays.reduce((acc, display) => acc + display.workAreaSize.width, 0)
  const height = Math.max(...displays.map((display) => display.workAreaSize.height))
  const canvas = createCanvas(width, height)
  const ctx = canvas.getContext('2d')
  let xOffset = 0
  for (const screenshot of screenshots) {
    const image = await loadImage(screenshot)
    ctx.drawImage(image, xOffset, 0)
    xOffset += image.width
  }
  return canvas.toDataURL()
}

function createApp() {
  const api = express()
  api.use(express.urlencoded({ extended: false }))
  api.use(express.json({ limit: '2mb' }))
  api.use(cors({
    credentials: true,
    origin: true
  }))

  api.get('/api/restartapp', (req, res) => {
    res.end('restarted')
  })

  api.get('/api/reboot', (req, res) => {
    res.end('rebooted')
    shutdown.reboot({
      force: true,
      timerseconds: 0,
      quitapp: true
    })
  })

  api.get('/api/shutdown', (req, res) => {
    res.end('shutdown')
    shutdown.shutdown({
      force: true,
      timerseconds: 0,
      quitapp: true
    })
  })

  api.get('/api/deviceinfo', async (req, res) => {
    const { log, errorLog } = getLoggers()
    try {
      const { buildDeviceInfo } = require('./src/main/device-info')
      const { getStoredDeviceToken } = require('./src/main/device-id')
      const info = buildDeviceInfo({
        registered: Boolean(getStoredDeviceToken())
      })
      // Optional CPU block when monitoring enabled
      const settings = getSettings()
      if (settings.CPU_MONITORING !== false) {
        try {
          info.cpu = await si.cpu()
        } catch {
          // non-fatal
        }
      }
      log.info('Device info requested')
      res.json(info)
    } catch (error) {
      errorLog.warn('Device Info Error:', error)
      res.status(500).end('Internal Server Error')
    }
  })

  api.post('/api/pushFromConsole', async (req, res) => {
    const { log, errorLog, playerLog } = getLoggers()
    const config = loadConfig()
    const body = req.body && typeof req.body === 'object' ? req.body : {}
    const templateData = body.templateData
    const sourceResolution = body.source_resolution || body.sourceResolution || null
    try {
      if (!config) {
        return res.status(500).json({ message: 'Config missing' })
      }
      if (config.ctrltype === 'console') {
        return res.status(200).end('Not allowed')
      }
      if (config.ctrltype === 'videowall' && mainWindow && !mainWindow.isDestroyed()) {
        // Full-layout push: reject when Console resolution does not match this wall.
        const source = tryParseLayoutResolution(sourceResolution)
          || resolutionFromTemplateData(templateData)
        if (source) {
          let destination = null
          try {
            const existing = await mainWindow.webContents.executeJavaScript(
              'window.localStorage.getItem("templateData")'
            )
            destination = resolutionFromTemplateData(existing)
          } catch {
            destination = null
          }
          if (destination && !sameLayoutResolution(source, destination)) {
            const message = `Layout resolution ${formatLayoutResolution(source)} does not match this Video Wall (${formatLayoutResolution(destination)}).`
            errorLog.warn('pushFromConsole rejected: resolution mismatch', {
              source: formatLayoutResolution(source),
              destination: formatLayoutResolution(destination)
            })
            return res.status(422).json({
              compatible: false,
              message,
              source_resolution: formatLayoutResolution(source),
              destination_resolution: formatLayoutResolution(destination)
            })
          }
        }

        const encodedTemplate = JSON.stringify(String(templateData ?? ''))
        const slotsRaw = body.slotsList != null ? body.slotsList : body.slots
        const contentsRaw = body.contents
        const storeScript = [
          `window.localStorage.setItem("templateData", ${encodedTemplate});`,
          slotsRaw != null
            ? `window.localStorage.setItem("slotsList", ${JSON.stringify(String(slotsRaw))});`
            : '',
          contentsRaw != null
            ? `window.localStorage.setItem("contents", ${JSON.stringify(String(contentsRaw))});`
            : '',
          'true'
        ].filter(Boolean).join('\n')
        await mainWindow.webContents.executeJavaScript(storeScript)

        const incoming = normalizePayload(Object.assign({}, body, {
          action: (body.action) || ACTIONS.RELOAD_LAYOUT,
          pushed: true
        }))
        if (isIncremental(incoming)) {
          await applyRuntimeUpdate(incoming)
        } else {
          await mainWindow.loadURL(previewUrl(config, config.tempid, true))
          refitMainWindow()
          playerLog.info('[INFO] Layout reload from Console push')
        }
      }
      log.info('PUSH CONSOLE : Pushed from console preset updated successfully.')
      return res.status(200).end('Push to console ok')
    } catch (error) {
      errorLog.error('Error:', error)
      res.status(500).send('Internal Server Error')
    }
  })

  api.post('/api/push', async (req, res) => {
    const { log, errorLog, playerLog } = getLoggers()
    const config = loadConfig()
    const templateId = req.body && req.body.id
    try {
      if (!config) {
        return res.status(500).end('Config missing')
      }
      const safeId = String(templateId ?? '').replace(/['"\r\n]/g, '')
      const wallId = req.body && req.body.videowall_id != null
        ? String(req.body.videowall_id).replace(/['"\r\n]/g, '')
        : ''
      const updates = {}
      if (safeId) {
        updates.TEMPLATE_ID = safeId
      }
      if (wallId) {
        updates.VIDEOWALL_ID = wallId
      }
      if (Object.keys(updates).length) {
        configService.updateValues(updates)
      }
      const refreshed = loadConfig() || config
      if (wallId) {
        refreshed.videowall_id = wallId
      }
      const payload = normalizePayload(Object.assign({}, req.body, {
        template_id: req.body && (req.body.template_id || req.body.id),
        videowall_id: wallId || refreshed.videowall_id,
        action: (req.body && req.body.action) || ACTIONS.RELOAD_LAYOUT
      }))
      if (config.ctrltype === 'videowall' && mainWindow && !mainWindow.isDestroyed()) {
        if (isIncremental(payload)) {
          await applyRuntimeUpdate(payload)
        } else {
          await mainWindow.loadURL(previewUrl(refreshed, safeId, false))
          refitMainWindow()
          playerLog.info('Playlist changed', safeId)
          playerLog.info('[INFO] Layout reload')
        }
      }
      if (config.ctrltype === 'console') {
        return res.status(200).end('Not allowed')
      }
      log.info('PUSH CONSOLE : Template id updated successfully.')
      return res.status(200).end('Push to console ok')
    } catch (error) {
      errorLog.error('Error:', error)
      res.status(500).send('Internal Server Error')
    }
  })

  async function handleIncrementalRoute(req, res, defaultAction) {
    const { errorLog } = getLoggers()
    try {
      const payload = normalizePayload(Object.assign({}, req.body, {
        action: (req.body && req.body.action) || defaultAction
      }))
      const result = await applyRuntimeUpdate(payload)
      return res.status(200).json(result)
    } catch (error) {
      errorLog.error('Error:', error)
      return res.status(500).send('Internal Server Error')
    }
  }

  api.post('/api/sync', (req, res) => handleIncrementalRoute(req, res, ACTIONS.SLOT_UPDATE))
  api.post('/api/slot_update', (req, res) => handleIncrementalRoute(req, res, ACTIONS.SLOT_UPDATE))
  api.post('/api/playlist_update', (req, res) => handleIncrementalRoute(req, res, ACTIONS.PLAYLIST_UPDATE))
  api.post('/api/content_update', (req, res) => handleIncrementalRoute(req, res, ACTIONS.CONTENT_UPDATE))
  api.post('/api/mute_update', (req, res) => handleIncrementalRoute(req, res, ACTIONS.MUTE_UPDATE))
  api.post('/api/overlay_update', (req, res) => handleIncrementalRoute(req, res, ACTIONS.OVERLAY_UPDATE))

  api.get('/api/getScreenshot', async (req, res) => {
    const { errorLog } = getLoggers()
    if (getSettings().SCREENSHOT_ENABLED === false) {
      return res.status(403).send('Screenshots disabled')
    }
    try {
      const image = await takeScreenshot()
      return res.status(200).json(image)
    } catch (error) {
      errorLog.error('Error:', error)
      return res.status(500).send('Internal Server Error')
    }
  })

  api.get('/img/screenshot.png', async (req, res) => {
    const { errorLog } = getLoggers()
    if (getSettings().SCREENSHOT_ENABLED === false) {
      return res.status(403).send('Screenshots disabled')
    }
    try {
      const screenshots = await takeScreenshot()
      const mergedImageData = await mergeScreenshots(screenshots)
      const base64WithoutPrefix = mergedImageData.replace(/^data:image\/png;base64,/, '')
      res.setHeader('Content-Type', 'image/png')
      res.status(200).send(Buffer.from(base64WithoutPrefix, 'base64'))
    } catch (error) {
      errorLog.error('Error generating dynamic image:', error)
      res.status(500).send('Internal Server Error')
    }
  })

  api.get('/api/health', (req, res) => {
    let deviceId = null
    let version = null
    let hostname = null
    let ctrlType = null
    let configAppliedRevision = 0
    try {
      const { getOrCreateDeviceId, getAppliedConfigRevision } = require('./src/main/device-id')
      const registration = require('./src/main/registration')
      deviceId = getOrCreateDeviceId()
      hostname = require('os').hostname()
      version = require('./package.json').version
      ctrlType = registration.currentAppliedRole()
      configAppliedRevision = getAppliedConfigRevision()
    } catch {
      // ignore
    }
    res.json({
      ok: true,
      player: true,
      port,
      deviceId,
      hostname,
      version,
      ctrlType,
      configAppliedRevision
    })
  })

  // CLEVER-Service NotifyPlayerConfigSyncJob → immediate config pull.
  api.post('/api/config_sync', async (req, res) => {
    const { playerLog, errorLog } = getLoggers()
    try {
      const registration = require('./src/main/registration')
      playerLog.info('Config sync requested by CLEVER-Service', {
        revision: req.body && req.body.configRevision,
        deviceRole: req.body && req.body.deviceRole
      })
      const result = await registration.pullAndApplyConfig()
      return res.status(200).json({
        ok: true,
        appliedRole: registration.currentAppliedRole(),
        configAppliedRevision: registration.getLastAppliedRevision(),
        configRevision: result && result.configRevision
      })
    } catch (error) {
      errorLog.warn('Config sync failed', error && error.message)
      return res.status(500).json({ ok: false, message: 'Config sync failed' })
    }
  })

  return api
}

const apiApp = createApp()

function startServer() {
  const { log, errorLog } = getLoggers()
  if (server) {
    return server
  }
  server = apiApp.listen(port, () => {
    log.info(`Express server listening on port ${port}`)
  })
  server.on('error', (error) => {
    if (error.code === 'EADDRINUSE') {
      errorLog.warn(`Port ${port} already in use, local API not started`)
      return
    }
    errorLog.error('Local API server error', error)
  })
  return server
}

startServer()

module.exports = {
  app: apiApp,
  setMainWindow,
  startServer
}
