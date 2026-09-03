'use strict'

const express = require('express')
const cors = require('cors')
const { createCanvas, loadImage } = require('@napi-rs/canvas')
const shutdown = require('electron-shutdown-command')
const si = require('systeminformation')
const { getLoggers } = require('./src/main/logger')
const configService = require('./src/main/config-service')

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
    const settings = getSettings()
    if (settings.CPU_MONITORING === false) {
      return res.status(403).end('CPU monitoring disabled')
    }
    try {
      const data = await si.cpu()
      log.info('CPU Info requested')
      res.json(data)
    } catch (error) {
      errorLog.warn('CPU Info Error:', error)
      res.status(500).end('Internal Server Error')
    }
  })

  api.post('/api/pushFromConsole', async (req, res) => {
    const { log, errorLog, playerLog } = getLoggers()
    const config = loadConfig()
    const templateData = req.body && req.body.templateData
    try {
      if (!config) {
        return res.status(500).end('Config missing')
      }
      if (config.ctrltype === 'console') {
        return res.status(200).end('Not allowed')
      }
      if (config.ctrltype === 'videowall' && mainWindow && !mainWindow.isDestroyed()) {
        const encoded = JSON.stringify(String(templateData ?? ''))
        await mainWindow.webContents.executeJavaScript(
          `window.localStorage.setItem("templateData", ${encoded});`
        )
        await mainWindow.loadURL('http://' + config.controller + '/preview/' + config.tempid + '/videowall/true')
        playerLog.info('Playlist changed')
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
      configService.updateValues({ TEMPLATE_ID: safeId })
      if (config.ctrltype === 'videowall' && mainWindow && !mainWindow.isDestroyed()) {
        await mainWindow.loadURL('http://' + config.controller + '/preview/' + safeId + '/videowall/false')
        playerLog.info('Playlist changed', safeId)
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
    res.json({ ok: true, port })
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
