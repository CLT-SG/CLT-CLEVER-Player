const {
  app,
  dialog,
  BrowserWindow,
  globalShortcut,
  ipcMain,
} = require('electron')
require('@electron/remote/main').initialize()

const path = require('path')
const fs = require('fs')
const os = require('os')
const homedir = os.homedir()
const isReachable = require('is-reachable')
const macaddress = require('macaddress')
const Crypto = require('crypto')
const si = require('systeminformation')
const date = require('date-and-time')
var log = require('electron-log')

const appdir = path.normalize(homedir + '/clever-app')
const logdir = path.normalize(homedir + '/clever-app/logs')
const now = new Date()
const datelog = date.format(now, 'YYYY-MM-DD')
log.transports.file.file = logdir + '/' + datelog + '.log'
var pingstat


//One instance process check
let win = null
let winpreview = null

//disable security warning
delete process.env.ELECTRON_ENABLE_SECURITY_WARNINGS
process.env.ELECTRON_DISABLE_SECURITY_WARNINGS = true

const gotTheLock = app.requestSingleInstanceLock()

try {
  //update config-app.js to current update
  fs.stat(appdir + '/clever-config.js', function (err, stats) {
    if (err) {
      log.warn(err)
    } else {
      var mtime = stats.mtime
      mtime = date.format(mtime, 'YYYY-MM-DD')
      var updateDate = date.parse('2022-12-28', 'YYYY-MM-DD')
      updateDate = date.format(updateDate, 'YYYY-MM-DD')
      if (mtime < updateDate) {
        si.networkInterfaces().then(data => {
          data.forEach((net) => {
            if (net.operstate == 'up' && net.virtual == false) {
              fs.writeFile(appdir + '/clever-config.js',
                "var hostserver = '" + net.ip4 + "'; // IP or Hostname Hosted\r\n\r\n\r\n" +
                "var controllerport = '9600'; // Clever Controller Port Number\r\n\r\n\r\n" +
                "var cleverwebport = '9100'; // Clever Web Hosting Port Number\r\n\r\n\r\n" +
                "var mediaserverport = '9200'; // Media Server Services Port Number\r\n\r\n\r\n" +
                "var screenserverport = '9300'; // Screen Cast Web Hosting Services Port Number\r\n\r\n\r\n" +
                "var screenapiport = '9301'; // Screen Cast Socket API Services Port Number\r\n\r\n\r\n" +
                "var tempid = '1'; // insert template id\r\n\r\n\r\n" +
                "var serialkey = '1d74f3eda4dd9d1065a6216c84c27d67301779b76996dc867f4403d48f9ad91e'; // insert serial key\r\n\r\n\r\n" +
                "/*=======================================================================================================\r\n" +
                "DO NOT MODIFY ANYTHING BELOW THIS SECTION. IT MAY CORRUPTED THIS APPLICATION \r\n" +
                "========================================================================================================*/\r\n" +
                "module.exports.hostserver = hostserver; // localhost for office\r\n" +
                "module.exports.controller = hostserver + ':' + controllerport; // Clever Web Hosting Services\r\n" +
                "module.exports.cleverweb = hostserver + ':' + cleverwebport; // Clever Web Hosting Services\r\n" +
                "module.exports.mediaserver = hostserver + ':' + mediaserverport; // Media Server Services\r\n" +
                "module.exports.screenserver = hostserver + ':' + screenserverport; // Screen Cast Web Hosting Services\r\n" +
                "module.exports.screenapi = hostserver + ':' + screenapiport; // Screen Cast Socket API Services\r\n" +
                "module.exports.remotedesktop = hostserver + ':9400'; // Remote Desktop Services\r\n" +
                "module.exports.controllerport1 = controllerport;\r\n" +
                "module.exports.cleverwebport1 = cleverwebport;\r\n" +
                "module.exports.mediaserverport1 = mediaserverport;\r\n" +
                "module.exports.screenserverport1 = screenserverport;\r\n" +
                "module.exports.screenapiport1 = screenapiport;\r\n" +
                "module.exports.timeout = 10000;\r\n" +
                "module.exports.tempid = tempid;\r\n" +
                "module.exports.serialkey = serialkey;\r\n",
                function (err, data) {
                  if (err) {
                    log.warn(err)
                  }
                  log.info('Config file created.')
                  const options = {
                    type: 'info',
                    buttons: ['Ok'],
                    defaultId: 2,
                    title: 'Setup and configuration',
                    message: 'Config file has been updated.',
                    detail: 'Please change hostserver at this location ' + appdir + '/clever-config.js \r\n' +
                      '\r\n\r\n' +
                      'Copyright © 2000-' + date.format(now, 'YYYY') + ' by Closed-loop Technology Pte Ltd. All rights reserved \r\n' +
                      ' www.closed-loop.biz'
                  }
                  dialog.showMessageBox(null, options).then((data) => {
                    if (data.response == 0) {
                      app.exit()
                      app.relaunch()
                    }
                  })
                })
            }
          })
        })
      }
    }
  })
} catch (err) {
  console.log(err)
  log.warn(err)
}

try {
  const config = require(appdir + '/clever-config')
  if (!gotTheLock) {
    app.exit()
  } else {
    app.on('second-instance', (event, commandLine, workingDirectory) => {
      // Someone tried to run a second instance, we should focus our window.
      if (win) {
        if (win.isMinimized()) {
          log.info("Restore process.")
          win.show()
        }
        win.focus()
      }
    })

    //PREVENT HTTPS TO CHCEK CERTIFICED
    //app.disableHardwareAcceleration()

    //Ignore SSL check
    app.commandLine.appendSwitch('ignore-certificate-errors', true)
    app.on('certificate-error', (event, webContents, url, error, certificate, callback) => {
      event.preventDefault()
      callback(true)
    })

    //APP CRASH REPORT TO LOG
    app.on('uncaughtException', (err) => {
      log.warn('uncaughtException', err)
    })

    //Plugin enabled
    //Pepper Flash
    // Specify flash path, supposing it is placed in the same directory with main.js.
    let pluginName
    switch (process.platform) {
      case 'win32':
        pluginName = 'pepflashplayer32_32_0_0_238.dll'
        break
      case 'darwin':
        pluginName = 'PepperFlashPlayer.plugin'
        break
      case 'linux':
        pluginName = 'libpepflashplayer.so'
        break
    }
    app.commandLine.appendSwitch('ppapi-flash-path', path.join(__dirname, pluginName))
    // Optional: Specify flash version, for example, v17.0.0.169
    app.commandLine.appendSwitch('ppapi-flash-version', '32.0.0.238')

    //Cache disabled
    app.commandLine.appendSwitch("disable-http-cache")

    //APP START UP CONFIG
    app.on('ready', () => {
      win = new BrowserWindow({
        kiosk: true,
        frame: false,
        zoomFactor: 1,
        backgroundColor: "#242322",
        show: false,
        webPreferences: {
          webviewTag: true,
          plugins: true,
          webSecurity: false,
          enableRemoteModule: true,
          devTools: true, //enable or disable dev tools
          nodeIntegration: true,
          webSecurity: false,
          contextIsolation: false
        }
      })

      //enable remote webContents
      require('@electron/remote/main').enable(win.webContents)


      win.on('closed', () => {
        win = null
      })

      if (winpreview) {
        winpreview.on('closed', () => {
          winpreview = null
        })
      }

      //open debugs mode 
      win.openDevTools()
      if (winpreview) {
        winpreview.openDevTools()
      }

      //APPS FAIL TO LOAD (WHITE SCREEN)
      win.webContents.on("did-fail-load", function (evt, errcode, errname) {
        log.warn("did-fail-load : " + errcode + "/ ", errname)
        console.log("did-fail-load : " + errcode + "/ ", errname)
        if (errcode != -3 || errcode != -27) {
          app.relaunch()
          app.quit()
        }
      })

      //APPS READY 
      win.on('ready-to-show', function () {
        win.setBackgroundColor('#242322')
        win.show()
        win.focus()
      })

      //APPS CRASH
      win.webContents.on('crashed', (e, killed) => {
        log.warn("apps-crashed : " + e + " / Killed : " + killed)
        app.relaunch()
        app.quit()
      })

      //APPS FAIL TO LOAD (WHITE SCREEN)
      win.webContents.on("did-fail-load", function (evt, errcode, errname) {
        log.warn("did-fail-load : " + errcode + "/ ", errname)
        if (errcode != -3 || errcode != -27) {
          app.exit()
          app.relaunch()
        }
      })

      //CLEAR CACHE AND COOKIE EVERY STARTUP
      var ses = win.webContents.session
      if (winpreview) {
        var sespre = winpreview.webContents.session
      }

      //ses.clearCache(() => {
      //  log.info("Cache cleared!")
      //})

      win.webContents.on('did-finish-load', () => {
        win.webContents.setVisualZoomLevelLimits(1, 1)
      })

      //SHORTCUT KEY
      globalShortcut.register('CommandOrControl+X', () => {
        app.exit()
        log.warn('Application exit')
      })

      globalShortcut.register('F5', () => {
        ses.clearCache(() => {
          log.info("Cache cleared!")
        })
        win.reload()
        if (winpreview) {
          winpreview.reload()
        }
      })

      globalShortcut.register('Esc', () => {
        //send message to clever
        win.webContents.send('slot-orisize', 'ESC');
      })

      //open configure page
      globalShortcut.register('CommandOrControl+F1', () => {
        win.setSkipTaskbar(false)
        win.setAlwaysOnTop(false)
        win.setMenuBarVisibility(true)
        win.loadURL("file://" + __dirname + "/src/configure.html")
      })

      //restart app every 6days
      setTimeout(function () {
        app.exit()
        app.relaunch()
      }, 432000000) // 5 days in milliseconds

      var status
      //check url status and open
      (async () => {
        //await isReachable(config.cleverweb, {
        await isReachable('http://' + config.controller, {
          timeout: 10000
        }).then((status) => {
          macaddress.one(function (err, mac) {
            //console.log("Mac address for this host: %s", mac)
            const secret = 'Clt@2022'
            const hash = Crypto.createHash('sha256', secret).update(mac).digest('hex')
            if (config.serialkey == hash) {
              if (status == true) {
                //if (win) win.loadURL('https://' + config.cleverweb + '/single.html')
                if (win) win.loadURL('http://' + config.controller + '/preview/' + config.tempid)
                log.info('Server https://' + config.controller + '/preview/' + config.tempid + ' is online')
                pingstat = false
              } else {
                win.loadURL("file://" + __dirname + "/src/offline.html")
                log.warn('Server https://' + config.cleverweb + ' is offline')
                pingstat = true
              }
            } else {
              win.setKiosk(false)
              win.loadURL("file://" + __dirname + "/src/activate.html")
              if (winpreview) {
                winpreview.close()
              }
            }
          })
        })
      })()

      //From Screen slot (webview)
      ipcMain.on('appname-check', (event, args) => {
        var appName = app.getName()
        event.returnValue = appName
      })

      //Exit app button (clever web)
      ipcMain.on('app-exit', (event, args) => {
        app.quit()
      })

      //Exit app button (clever web)
      ipcMain.on('app-savelog', (event, logs) => {
        var logtype = logs[0]
        var logtext = logs[1]
        console.log(`${logtype} :  ${logtext}`)
        if (logtype == 'warn') {
          log.warn(logtext)
        } else {
          log.info(logtext)
        }
      })

      //reload app
      ipcMain.on('app-reload', (event, logs) => {
        app.exit()
        app.relaunch()
      })

      //reload main
      ipcMain.on('app-mainreload', (event, logs) => {
        win.reload()
      })

      //reload preview
      ipcMain.on('app-previewreload', (event, logs) => {
        if (winpreview) {
          winpreview.reload()
        }
      })

      //reset main and preview
      ipcMain.on('app-resetdefault', (event, logs) => {
        ses.clearStorageData()
        if (winpreview) {
          sespre.clearStorageData()
        }
      })

      //Save configuration app button (clever web)
      ipcMain.on('app-configsave', (event, args) => {
        console.log(args['hostaddress'])
        fs.writeFile(appdir + '/clever-config.js',
          "var hostserver = '" + args['hostaddress'] + "'; // IP or Hostname Hosted\r\n\r\n\r\n" +
          "var controllerport = '9600'; // Clever Controller Port Number\r\n\r\n\r\n" +
          "var cleverwebport = '9100'; // Clever Web Hosting Port Number\r\n\r\n\r\n" +
          "var mediaserverport = '9200'; // Media Server Services Port Number\r\n\r\n\r\n" +
          "var screenserverport = '9300'; // Screen Cast Web Hosting Services Port Number\r\n\r\n\r\n" +
          "var screenapiport = '9301'; // Screen Cast Socket API Services Port Number\r\n\r\n\r\n" +
          "var tempid = '" + args['tempid'] + "'; // insert template id\r\n\r\n\r\n" +
          "var serialkey = '" + args['serialkey'] + "'; // insert serial key\r\n\r\n\r\n" +
          "/*=======================================================================================================\r\n" +
          "DO NOT MODIFY ANYTHING BELOW THIS SECTION. THERE'S A RISK OR IT MAY CAUSE OF APPLICATION ERROR. \r\n" +
          "========================================================================================================*/\r\n" +
          "module.exports.hostserver = hostserver; // localhost for office\r\n" +
          "module.exports.controller = hostserver + ':' + controllerport; // Clever Web Hosting Services\r\n" +
          "module.exports.cleverweb = hostserver + ':' + cleverwebport; // Clever Web Hosting Services\r\n" +
          "module.exports.mediaserver = hostserver + ':' + mediaserverport; // Media Server Services\r\n" +
          "module.exports.screenserver = hostserver + ':' + screenserverport; // Screen Cast Web Hosting Services\r\n" +
          "module.exports.screenapi = hostserver + ':' + screenapiport; // Screen Cast Socket API Services\r\n" +
          "module.exports.remotedesktop = hostserver + ':9400'; // Remote Desktop Services\r\n" +
          "module.exports.controllerport1 = controllerport;\r\n" +
          "module.exports.cleverwebport1 = cleverwebport;\r\n" +
          "module.exports.mediaserverport1 = mediaserverport;\r\n" +
          "module.exports.screenserverport1 = screenserverport;\r\n" +
          "module.exports.screenapiport1 = screenapiport;\r\n" +
          "module.exports.timeout = 10000;\r\n" +
          "module.exports.tempid = tempid;\r\n" +
          "module.exports.serialkey = serialkey;\r\n",
          function (err, data) {
            if (err) {
              log.warn(err)
            }
            log.info('Config file created.')
            const options = {
              type: 'info',
              buttons: ['Ok'],
              defaultId: 2,
              title: 'Setup and configuration',
              message: 'Config file has been updated.',
              detail: 'Please change hostserver at this location ' + appdir + '/clever-config.js \r\n' +
                '\r\n\r\n' +
                'Copyright © 2000-' + date.format(now, 'YYYY') + ' by Closed-loop Technology Pte Ltd. All rights reserved \r\n' +
                ' www.closed-loop.biz'
            }
            dialog.showMessageBox(null, options).then((data) => {
              if (data.response == 0) {
                app.exit()
                app.relaunch()
              }
            })
          })
      })
    })
  }
} catch (ex) {
  log.warn(ex)
  if (!fs.existsSync(appdir)) {
    log.info(appdir + ' not exist')
    fs.mkdir(appdir, 0o755, (err) => {
      if (err) {
        log.warn(err)
      }
    })
  }
  if (!fs.existsSync(logdir)) {
    log.info(logdir + ' not exist')
    fs.mkdir(logdir, 0o755, (err) => {
      if (err) {
        log.warn(err)
      }
    })
  }

  si.networkInterfaces().then(data => {
    data.forEach((net) => {
      if (net.operstate == 'up' && net.virtual == false) {
        fs.writeFile(appdir + '/clever-config.js',
          "var hostserver = '" + net.ip4 + "'; // IP or Hostname Hosted\r\n\r\n\r\n" +
          "var controllerport = '9600'; // Clever Controller Port Number\r\n\r\n\r\n" +
          "var cleverwebport = '9100'; // Clever Web Hosting Port Number\r\n\r\n\r\n" +
          "var mediaserverport = '9200'; // Media Server Services Port Number\r\n\r\n\r\n" +
          "var screenserverport = '9300'; // Screen Cast Web Hosting Services Port Number\r\n\r\n\r\n" +
          "var screenapiport = '9301'; // Screen Cast Socket API Services Port Number\r\n\r\n\r\n" +
          "var tempid = '1'; // insert template id\r\n\r\n\r\n" +
          "var serialkey = '1d74f3eda4dd9d1065a6216c84c27d67301779b76996dc867f4403d48f9ad91e'; // insert serial key\r\n\r\n\r\n" +
          "/*=======================================================================================================\r\n" +
          "DO NOT MODIFY ANYTHING BELOW THIS SECTION. IT MAY CORRUPTED THIS APPLICATION \r\n" +
          "========================================================================================================*/\r\n" +
          "module.exports.hostserver = hostserver; // localhost for office\r\n" +
          "module.exports.controller = hostserver + ':' + controllerport; // Clever Web Hosting Services\r\n" +
          "module.exports.cleverweb = hostserver + ':' + cleverwebport; // Clever Web Hosting Services\r\n" +
          "module.exports.mediaserver = hostserver + ':' + mediaserverport; // Media Server Services\r\n" +
          "module.exports.screenserver = hostserver + ':' + screenserverport; // Screen Cast Web Hosting Services\r\n" +
          "module.exports.screenapi = hostserver + ':' + screenapiport; // Screen Cast Socket API Services\r\n" +
          "module.exports.remotedesktop = hostserver + ':9400'; // Remote Desktop Services\r\n" +
          "module.exports.controllerport1 = controllerport;\r\n" +
          "module.exports.cleverwebport1 = cleverwebport;\r\n" +
          "module.exports.mediaserverport1 = mediaserverport;\r\n" +
          "module.exports.screenserverport1 = screenserverport;\r\n" +
          "module.exports.screenapiport1 = screenapiport;\r\n" +
          "module.exports.timeout = 10000;\r\n" +
          "module.exports.tempid = tempid;\r\n" +
          "module.exports.serialkey = serialkey;\r\n",
          function (err, data) {
            if (err) {
              log.warn(err)
            }
            log.info('Config file created.')
            const options = {
              type: 'info',
              buttons: ['Ok'],
              defaultId: 1,
              title: 'Setup and configuration',
              message: 'Config file has been created.',
              detail: 'Please change hostserver at this location ' + appdir + '\ /clever-config.js \r\n' +
                '\r\n\r\n' +
                'Copyright © 2000-' + date.format(now, 'YYYY') + ' by Closed-loop Technology Pte Ltd. All rights reserved \r\n' +
                ' www.closed-loop.biz'
            }
            dialog.showMessageBox(null, options).then((data) => {
              if (data.response == 0) {
                app.exit()
                app.relaunch()
              }
            })
          })
        return
      }
    })
  })
}