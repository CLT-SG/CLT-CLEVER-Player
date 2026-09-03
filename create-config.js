'use strict'

const fs = require('fs').promises
const fsSync = require('fs')
const path = require('path')
const crypto = require('crypto')
const { app, dialog, screen } = require('electron')
const date = require('date-and-time')
const macaddress = require('macaddress')
const { isReachable } = require('./src/main/reachable')
const { getLocalFileUrl } = require('./src/main/security')
const { getLoggers } = require('./src/main/logger')
const { getConfigPath } = require('./src/main/paths')
const { generateConfigContent, variableOrder } = require('./src/main/config-template')

class CreateConfig {
  static async createConfigFile(ipAddress, appDir, ex) {
    const { log } = getLoggers()
    if (ex) {
      log.warn(ex)
    }
    const configFilePath = getConfigPath()
    const configFileContent = generateConfigContent(ipAddress)

    try {
      await fs.mkdir(appDir, { recursive: true })
      await fs.writeFile(configFilePath, configFileContent, 'utf-8')
      CreateConfig.showSuccessDialog(configFilePath, 'created')
    } catch (error) {
      log.warn(`Error writing file: ${error}`)
    }
  }

  static async checkVarExistingConfigFile(appDir) {
    const { log } = getLoggers()
    const configFilePath = path.join(appDir, 'config.js')

    try {
      const configFileContent = await fs.readFile(configFilePath, 'utf-8')
      const missingVariables = variableOrder().filter((variable) => !configFileContent.includes(variable))

      if (missingVariables.length > 0) {
        log.warn('Missing variables:', missingVariables)
        return false
      }
      log.info('All variables are present in the file.')
      return true
    } catch (error) {
      log.warn(`Error reading file: ${error}`)
      return false
    }
  }

  static async updateSpecificVarOnlyConfigFile(appDir, varArgs) {
    const { log } = getLoggers()
    const configFilePath = path.join(appDir, 'config.js')

    try {
      let configFileContent = await fs.readFile(configFilePath, 'utf-8')
      const host = String(varArgs.hostaddress || '').replace(/'/g, '')
      const tempid = String(varArgs.tempid || '').replace(/'/g, '')
      const ctrltype = String(varArgs.ctrltype || '').replace(/'/g, '')
      const serialkey = String(varArgs.serialkey || '').replace(/'/g, '')

      configFileContent = configFileContent.replace(/var hostserver = '.*?';/, `var hostserver = '${host}';`)
      configFileContent = configFileContent.replace(/var tempid = '.*?';/, `var tempid = '${tempid}';`)
      configFileContent = configFileContent.replace(/var ctrltype = '.*?';/, `var ctrltype = '${ctrltype}';`)
      configFileContent = configFileContent.replace(/var serialkey = '.*?';/, `var serialkey = '${serialkey}';`)

      await fs.writeFile(configFilePath, configFileContent, 'utf-8')
      CreateConfig.showSuccessDialog(configFilePath, 'modify')
    } catch (error) {
      log.warn(`Error reading/writing file: ${error}`)
    }
  }

  static async updateExistingConfigFile(ipAddress, appDir) {
    const { log } = getLoggers()
    const configFilePath = path.join(appDir, 'config.js')

    try {
      let configFileContent = await fs.readFile(configFilePath, 'utf-8')
      const configFileContent1 = generateConfigContent(ipAddress)
      const missing = variableOrder()
      let updatedContent = configFileContent
      const areAllVariablesPresent = missing.every((variable) => configFileContent.includes(variable))

      if (!areAllVariablesPresent) {
        missing.forEach((variable) => {
          if (!configFileContent.includes(variable)) {
            const insertIndex = configFileContent1.indexOf(variable)
            const endIndex = configFileContent1.indexOf('; // Controller type', insertIndex)
            updatedContent =
              `${updatedContent.slice(0, insertIndex)}${configFileContent1.slice(insertIndex, endIndex + 1)}${updatedContent.slice(insertIndex)}`
          }
        })
      }

      await fs.writeFile(configFilePath, updatedContent, 'utf-8')
      CreateConfig.showSuccessDialog(configFilePath, 'updated')
    } catch (error) {
      log.warn(`Error reading/writing file: ${error}`)
    }
  }

  static variableOrder() {
    return variableOrder()
  }

  static generateConfigContent(ipAddress) {
    return generateConfigContent(ipAddress)
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
      detail: `Please change hostserver at this location ${configFilePath}\r\n\r\n\r\nCopyright © 2000-${date.format(new Date(), 'YYYY')} by Closed-loop Technology Pte Ltd. All rights reserved\r\nwww.closed-loop.biz`
    }

    dialog.showMessageBox(null, options).then((data) => {
      if (data.response === 0 && msg === 'created') {
        app.relaunch()
        app.exit(0)
      }
    })
  }

  static getConfigPath(appdir) {
    return path.join(appdir, 'config.js')
  }

  static readConfig(appdir) {
    const configPath = this.getConfigPath(appdir)
    try {
      if (!fsSync.existsSync(configPath)) {
        return null
      }
      delete require.cache[require.resolve(configPath)]
      return require(configPath)
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

    let status = false
    try {
      status = await isReachable('http://' + config.controller, { timeout: 10000 })
    } catch (error) {
      errorLog.warn('Network error while checking controller', error)
      status = false
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
          serverWin.setBounds({
            x: 0,
            y: 0,
            width: screen.getPrimaryDisplay().workArea.width,
            height: screen.getPrimaryDisplay().workArea.height
          })
          await serverWin.loadURL('http://' + config.controller)
          serverWin.blur()
        }
        log.info('Server http://' + config.controller + '/preview/' + config.tempid + ' is online')
      } else {
        playerLog.info('Device connection status offline')
        await mainWin.loadURL(getLocalFileUrl('src/offline.html'))
        log.warn('Server http://' + config.cleverweb + ' is offline')
      }
      mainWin.setBounds({
        x: 0,
        y: 0,
        width: screen.getPrimaryDisplay().workArea.width,
        height: screen.getPrimaryDisplay().workArea.height
      })
      mainWin.focus()
    } else {
      await mainWin.loadURL(getLocalFileUrl('src/activate.html'))
    }
  }
}

module.exports = CreateConfig
