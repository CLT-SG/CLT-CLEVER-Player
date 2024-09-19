const {
  app,
  BrowserWindow,
  globalShortcut,
  ipcMain,
  desktopCapturer,
  screen,
  Menu
} = require('electron')
require('@electron/remote/main').initialize()

const CreateConfig = require('./create-config.js') // create config class
const PortScanner = require('./port-scanner.js'); // prot scanner to find clever server

const path = require('path')
const fs = require('fs')
const os = require('os')
const homedir = os.homedir()
const date = require('date-and-time')
var log = require('electron-log')

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
let mainWin = null
let serverWin = null

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
      if (serverWin) {
        if (serverWin.isMinimized()) {
          log.info("Server window restore process.")
          serverWin.show()
        }
        serverWin.focus()
      }
      if (mainWin) {
        if (mainWin.isMinimized()) {
          log.info("Main window restore process.")
          mainWin.show()
        }
        mainWin.focus()
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

    //APP DISABLE PROXY

    // Disable CORS and other web security settings
    app.commandLine.appendSwitch('disable-site-isolation-trials');
    app.commandLine.appendSwitch('disable-web-security');
    app.commandLine.appendSwitch('allow-running-insecure-content');

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
      
      const setMainWindow = require('./route').setMainWindow

      mainWin = new BrowserWindow({
        backgroundColor: '#302d2d',
        alwaysOnTop: true,
        autoHideMenuBar: true,
        fullscreenable: false,
        resizable: false,
        moveable: false,
        closable: false,
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

      serverWin = new BrowserWindow({
        x: 0,
        y: 0,
        width: 0,
        height: 0,
        backgroundColor: '#302d2d',
        alwaysOnTop: true,
        autoHideMenuBar: true,
        fullscreenable: false,
        resizable: false,
        moveable: false,
        closable: false,
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
          contextIsolation: false
        }
      })

      //enable remote webContents
      require('@electron/remote/main').enable(mainWin.webContents)

      setMainWindow(mainWin, desktopCapturer, screen)

      mainWin.on('closed', () => {
        mainWin = null
      })

      serverWin.on('closed', () => {
        serverWin = null
      })

      //APPS FAIL TO LOAD (WHITE SCREEN)
      mainWin.webContents.on("did-fail-load", function (evt, errcode, errname) {
        log.warn("Main window did-fail-load : " + errcode + "/ ", errname)
        console.log("Main window did-fail-load : " + errcode + "/ ", errname)
        if (errcode != -3 || errcode != -27) {
          app.relaunch()
          app.quit()
        }
      })
      serverWin.webContents.on("did-fail-load", function (evt, errcode, errname) {
        log.warn("Server window did-fail-load : " + errcode + "/ ", errname)
        console.log("Server window did-fail-load : " + errcode + "/ ", errname)
        if (errcode != -3 || errcode != -27) {
          app.relaunch()
          app.quit()
        }
      })

      //hide menu bar
      mainWin.setSkipTaskbar(true)
      mainWin.setAlwaysOnTop(true)
      mainWin.setMenuBarVisibility(false)
      Menu.setApplicationMenu(null)
      mainWin.setMenu(null)
      serverWin.setSkipTaskbar(true)
      serverWin.setAlwaysOnTop(true)
      serverWin.setMenuBarVisibility(false)
      serverWin.setMenu(null)

      //APPS READY 
      mainWin.on('ready-to-show', function () {
        mainWin.setBackgroundColor('#242322')
        mainWin.show()
      })

      //APPS CRASH
      mainWin.webContents.on('crashed', (e, killed) => {
        log.warn("Main window crashed : " + e + " / Killed : " + killed)
        app.relaunch()
        app.quit()
      })
      serverWin.webContents.on('crashed', (e, killed) => {
        log.warn("Server window crashed : " + e + " / Killed : " + killed)
        app.relaunch()
        app.quit()
      })

      //APPS FAIL TO LOAD (WHITE SCREEN)
      mainWin.webContents.on("did-fail-load", function (evt, errcode, errname) {
        log.warn("Main window did-fail-load : " + errcode + "/ ", errname)
        if (errcode != -3 || errcode != -27) {
          app.exit()
          app.relaunch()
        }
      })
      serverWin.webContents.on("did-fail-load", function (evt, errcode, errname) {
        log.warn("Server window did-fail-load : " + errcode + "/ ", errname)
        if (errcode != -3 || errcode != -27) {
          app.exit()
          app.relaunch()
        }
      })

      //CLEAR CACHE AND COOKIE EVERY STARTUP
      var mainSes = mainWin.webContents.session
      //ses.clearCache(() => {
      //  log.info("Cache cleared!")
      //})

      //Set visual zoom level to window
      mainWin.webContents.on('did-finish-load', () => {
        mainWin.webContents.setVisualZoomLevelLimits(1, 1)
      })
      serverWin.webContents.on('did-finish-load', () => {
        serverWin.webContents.setVisualZoomLevelLimits(1, 1)
      })

      //open d3bug mode with Alt+Insert key
      globalShortcut.register('Alt+Insert', () => {
        mainWin.openDevTools()
      })

      //open configure page with Alt+Home key
      globalShortcut.register('Alt+Home', () => {
        mainWin.loadURL("file://" + __dirname + "/src/configure.html")
      })

      //Focus main or server window. This is quick link with Alt+PageUp key
      globalShortcut.register('Alt+PageUp', () => {
        if (mainWin.isFocused()) {
          mainWin.blur()
          serverWin.focus()
        } else {
          serverWin.blur()
          mainWin.focus()
        }
      })

      //Disable Alt+Tab
      globalShortcut.register('Alt+Tab', () => {
        return
      })

      //Exit application with Alt+Delete key
      globalShortcut.register('Alt+Delete', () => {
        app.exit()
        log.warn('Application exit')
      })

      //refresh main window with Alt+F5
      globalShortcut.register('Alt+F5', () => {
        mainSes.clearCache(() => {
          log.info("Cache cleared!")
        })
        mainWin.reload()
      })

      //restart app every 6days
      setTimeout(function () {
        app.exit()
        app.relaunch()
      }, 432000000) // 5 days in milliseconds

      //check url status and open
      CreateConfig.checkSerial(appdir, {
        mainWin: mainWin,
        serverWin: serverWin
      })

      //Exit app button (clever web)
      ipcMain.on('app-exit', (event, args) => {
        app.quit()
      })

      //Update template id
      ipcMain.on('app-update-id', (event, args) => {
        mainWin.reload()
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
      ipcMain.on('app-reload', (event, args) => {
        CreateConfig.checkSerial(appdir, {
          mainWin: mainWin,
          serverWin: serverWin
        })
      })

      //reload main window
      ipcMain.on('app-mainreload', (event, args) => {
        mainWin.reload()
      })

      //reset main window and preview
      ipcMain.on('app-resetdefault', (event, args) => {
        mainSes.clearStorageData()
      })

      //Save configuration app button (clever web)
      ipcMain.on('app-configsave', async (event, args) => {
        await CreateConfig.updateSpecificVarOnlyConfigFile(appdir, args)
        CreateConfig.checkSerial(appdir, {
          mainWin: mainWin,
          serverWin: serverWin
        })
      })

      //Switch server window or console window
      //Update template id
      ipcMain.on('app-switchwindow', (event, args) => {
        if (mainWin.isFocused()) {
          mainWin.blur()
          serverWin.focus()
        } else {
          serverWin.blur()
          mainWin.focus()
        }
      })

      //register shortkey events in ipc module
      ipcMain.on('app-registerShortkey', (event, args) => {
        globalShortcut.unregister(args.shortkey)
        globalShortcut.register(args.shortkey, async () => {
          await mainWin.webContents
            .executeJavaScript(`
                    window.localStorage.setItem("templateData", '${args.templateData}');
                    `)
            .then(result => {
              mainWin.webContents.send('app-shortkeyRefresh', args.shortkey)
            })
        })
      })

      //unregister shortkey events in ipc module
      ipcMain.on('app-unregisterShortkey', (event, args) => {
        globalShortcut.unregister(args.shortkey)
        globalShortcut.register(args.shortkey, () => {})
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