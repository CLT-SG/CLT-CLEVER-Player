'use strict'

const crypto = require('crypto')
const { app, dialog, screen } = require('electron')
const date = require('date-and-time')
const macaddress = require('macaddress')
const { isReachable } = require('./src/main/reachable')
const { getLocalFileUrl } = require('./src/main/security')
const { getLoggers } = require('./src/main/logger')
const { getAppDir } = require('./src/main/paths')
const configService = require('./src/main/config-service')
const { getLegacyWorkAreaBounds, resolveWindowChrome } = require('./src/main/window-bounds')

class CreateConfig {
  static async createConfigFile(ipAddress, appDir, ex) {
    const { log } = getLoggers()
    if (ex) {
      log.warn(ex)
    }
    const snapshot = configService.createDefault(ipAddress, appDir || getAppDir())
    CreateConfig.showSuccessDialog(snapshot.iniPath, 'created')
  }

  static async checkVarExistingConfigFile(appDir) {
    return configService.hasIni(appDir) || configService.hasLegacyJs(appDir)
  }

  static async updateSpecificVarOnlyConfigFile(appDir, varArgs) {
    const { log } = getLoggers()
    try {
      if (appDir) {
        configService.initialize({ appDir })
      }
      const snapshot = configService.updateFromConfigureUi(varArgs)
      CreateConfig.showSuccessDialog(snapshot.iniPath, 'modify')
    } catch (error) {
      log.warn(`Error reading/writing file: ${error}`)
    }
  }

  static async updateExistingConfigFile(ipAddress, appDir) {
    const { log } = getLoggers()
    try {
      if (!configService.hasIni(appDir) && !configService.hasLegacyJs(appDir)) {
        configService.createDefault(ipAddress, appDir)
      } else {
        configService.initialize({ appDir, host: ipAddress })
      }
      CreateConfig.showSuccessDialog(configService.getIniPath(appDir), 'updated')
    } catch (error) {
      log.warn(`Error reading/writing file: ${error}`)
    }
  }

  static generateConfigContent(ipAddress) {
    return configService.generateDefaultIni(ipAddress)
  }

  static showSuccessDialog(configFilePath, msg) {
    const { log } = getLoggers()
    log.info('Config file updated.')

    const options = {
      type: 'info',
      buttons: ['Ok'],
      defaultId: 0,
      title: 'Setup and configuration',
      message: `Config file has been ${msg}.`,
      detail: `Please edit config.ini at this location:\r\n${configFilePath}\r\n\r\nNo JavaScript knowledge is required. Use KEY=VALUE settings, then restart CLEVER Player.\r\n\r\nCopyright © 2000-${date.format(new Date(), 'YYYY')} by Closed-loop Technology Pte Ltd. All rights reserved\r\nwww.closed-loop.biz`
    }

    dialog.showMessageBox(null, options).then((data) => {
      if (data.response === 0 && msg === 'created') {
        app.relaunch()
        app.exit(0)
      }
    })
  }

  static getConfigPath(appdir) {
    return configService.getIniPath(appdir)
  }

  static readConfig(appdir) {
    try {
      if (appdir) {
        if (configService.hasIni(appdir) || configService.hasLegacyJs(appdir)) {
          configService.initialize({ appDir: appdir })
        }
      }
      return configService.getLegacyConfig()
    } catch (error) {
      const { log } = getLoggers()
      log.error('Error reading config file:', error)
      return null
    }
  }

  static async checkSerial(appdir, { mainWin, serverWin }) {
    const { log, playerLog, errorLog } = getLoggers()
    const config = this.readConfig(appdir)
    if (!config) {
      errorLog.error('Failed to load configuration. Check the config file.')
      if (mainWin && !mainWin.isDestroyed()) {
        mainWin.loadURL(getLocalFileUrl('src/activate.html'))
      }
      return
    }

    const values = config.values || {}
    const timeoutMs = Number(config.timeout) || 10000
    let status = false
    if (values.OFFLINE_MODE) {
      playerLog.info('Offline mode enabled')
      status = false
    } else {
      try {
        status = await isReachable('http://' + config.controller, { timeout: timeoutMs })
      } catch (error) {
        errorLog.warn('Network error while checking controller', error)
        status = false
      }
    }

    let mac
    try {
      mac = await macaddress.one()
    } catch (error) {
      errorLog.warn('Failed to read MAC address', error)
      mac = ''
    }

    const secret = 'Clt@2022'
    let hash
    try {
      hash = crypto.createHash('sha256', secret).update(mac).digest('hex')
    } catch {
      hash = crypto.createHash('sha256').update(mac).digest('hex')
    }
    if (!mainWin || mainWin.isDestroyed()) {
      return
    }

    if (config.serialkey === hash) {
      if (status) {
        playerLog.info('Device connection status online')
        if (config.ctrltype === 'videowall') {
          await mainWin.loadURL('http://' + config.controller + '/preview/' + config.tempid + '/videowall/false')
        }
        if (config.ctrltype === 'console' && serverWin && !serverWin.isDestroyed()) {
          await mainWin.loadURL('http://' + config.controller + '/preview/login')
          serverWin.show()
          applyWindowMode(serverWin, values)
          await serverWin.loadURL('http://' + config.controller)
          serverWin.blur()
        }
        log.info('Server http://' + config.controller + '/preview/' + config.tempid + ' is online')
      } else {
        playerLog.info('Device connection status offline')
        await mainWin.loadURL(getLocalFileUrl('src/offline.html'))
        log.warn('Server http://' + config.cleverweb + ' is offline')
      }
      applyWindowMode(mainWin, values)
      mainWin.focus()
    } else {
      await mainWin.loadURL(getLocalFileUrl('src/activate.html'))
    }
  }
}

function applyWindowMode(win, values) {
  if (!win || win.isDestroyed()) {
    return
  }
  const chrome = resolveWindowChrome(values)
  const bounds = getLegacyWorkAreaBounds(screen.getPrimaryDisplay())
  try {
    if (chrome.kiosk) {
      win.setKiosk(true)
      return
    }
    win.setKiosk(false)
    if (chrome.fullscreen) {
      win.setFullScreen(true)
      return
    }
    win.setFullScreen(false)
  } catch {
    // Some platforms reject kiosk/fullscreen changes while the window is hidden.
  }
  win.setBounds(bounds)
}

module.exports = CreateConfig
