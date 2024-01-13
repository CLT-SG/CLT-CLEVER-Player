const {
  app,
  dialog,
  BrowserWindow,
  globalShortcut,
  ipcMain,
  desktopCapturer,
  screen,
  Menu
} = require('electron')
require('@electron/remote/main').initialize()

const CreateConfig = require('./create-config') // create config class
const PortScanner = require('./port-scanner.js'); // prot scanner to find clever server

const path = require('path')
const fs = require('fs')
const os = require('os')
const homedir = os.homedir()
const si = require('systeminformation')
const date = require('date-and-time')
var log = require('electron-log')
var status

const appdir = path.normalize(homedir + '/clever-console')
const logdir = path.normalize(homedir + '/clever-console/logs')
const now = new Date()
const datelog = date.format(now, 'YYYY-MM-DD')
log.transports.file.file = logdir + '/' + datelog + '.log'


if (!fs.existsSync(appdir)) {
  log.info(appdir + ' not exist')
  fs.mkdir(appdir, 0x755, (err) => {
    if (err) {
      log.warn(err)
    }
  })
}
if (!fs.existsSync(logdir)) {
  log.info(logdir + ' not exist')
  fs.mkdir(logdir, 0x755, (err) => {
    if (err) {
      log.warn(err)
    }
  })
}

//One instance process check
let win = null

//disable security warning
delete process.env.ELECTRON_ENABLE_SECURITY_WARNINGS
process.env.ELECTRON_DISABLE_SECURITY_WARNINGS = true

const gotTheLock = app.requestSingleInstanceLock()

try {
  const config = require(appdir + '/config')

  CreateConfig.checkVarExistingConfigFile(appdir)
    .then(checkExist => {
      if (!checkExist) {
        CreateConfig.updateExistingConfigFile(ipaddress, appdir)
        return
      }
    }).catch(e => {
      log.warn(e)
    })


  // check if existing application is running then focus to application window
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
        backgroundColor: '#302d2d',
        //alwaysOnTop: true,
        //autoHideMenuBar: true,
        fullscreenable: false,
        //resizable: false,
        //moveable: false,
        closable: true,
        transparent: true,
        frame: false,
        zoomFactor: 1,
        center: true,
        show: false,
        webPreferences: {
          webviewTag: true,
          plugins: true,
          webSecurity: false,
          enableRemoteModule: true,
          devTools: true, //enable or disable dev tools
          nodeIntegration: true,
          contextIsolation: false,
          preload: path.join(__dirname, 'preload.js')
        }
      })

      //enable remote webContents
      require('@electron/remote/main').enable(win.webContents)

      const {
        setMainWindow
      } = require('./route')

      setMainWindow(win, desktopCapturer, screen)

      win.on('closed', () => {
        win = null
      })

      //APPS FAIL TO LOAD (WHITE SCREEN)
      win.webContents.on("did-fail-load", function (evt, errcode, errname) {
        log.warn("did-fail-load : " + errcode + "/ ", errname)
        console.log("did-fail-load : " + errcode + "/ ", errname)
        if (errcode != -3 || errcode != -27) {
          app.relaunch()
          app.quit()
        }
      })

      //hide menu bar
      //win.setSkipTaskbar(true)
      //win.setAlwaysOnTop(true)
      win.setMenuBarVisibility(false)
      Menu.setApplicationMenu(null)
      win.setMenu(null)

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

      //ses.clearCache(() => {
      //  log.info("Cache cleared!")
      //})

      win.webContents.on('did-finish-load', () => {
        win.webContents.setVisualZoomLevelLimits(1, 1)
      })

      //SHORTCUT KEY
      globalShortcut.register('CommandOrControl+4', () => {
        app.exit()
        log.warn('Application exit')
      })

      //open dev tools

      globalShortcut.register('CommandOrControl+D', () => {
        //d3bug mode
        win.openDevTools()
      })

      globalShortcut.register('F5', () => {
        ses.clearCache(() => {
          log.info("Cache cleared!")
        })
        win.reload()
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

      //check url status and open
      CreateConfig.checkSerial(appdir, win)

      //From Screen slot (webview)
      ipcMain.on('appname-check', (event, args) => {
        var appName = app.getName()
        event.returnValue = appName
      })

      //Exit app button (clever web)
      ipcMain.on('app-exit', (event, args) => {
        app.quit()
      })

      //Update template id
      ipcMain.on('app-update-id', (event, args) => {
        win.reload()
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
        CreateConfig.checkSerial(appdir, win)
      })

      //reload main
      ipcMain.on('app-mainreload', (event, logs) => {
        win.reload()
      })

      //reset main and preview
      ipcMain.on('app-resetdefault', (event, logs) => {
        ses.clearStorageData()
      })

      //Save configuration app button (clever web)
      ipcMain.on('app-configsave', async (event, args) => {
        await CreateConfig.updateSpecificVarOnlyConfigFile(appdir, args)
        CreateConfig.checkSerial(appdir, win)
      })
    })
  }
} catch (ex) {
  console.log(ex)
  //get local ip address
  var ipaddress

  // Example usage
  const portScanner = new PortScanner();
  portScanner.scanIPRange().then((openPorts) => {
    ipaddress = openPorts[0] || 'localhost'
    if (!fs.existsSync(path.join(appdir, 'config.js'))) {
      CreateConfig.createConfigFile(ipaddress, appdir, ex)
      return
    }
  });
}