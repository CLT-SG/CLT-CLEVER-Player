
window.ipcRenderer = require("electron").ipcRenderer
window.remote = require('@electron/remote')
window.win = remote.getCurrentWebContents()
window.path = require('path')
window.os = require('os')
var homedir = window.os.homedir()
window.config = require(homedir + '/clever-console/config')
window.logdir = window.path.normalize(homedir + '/clever-console/logs/')
const logdir = path.normalize(homedir + '/clever-console/logs/')

window.log = require('electron-log')
window.xmljs = require('xml-js')
window.datetime = require('date-and-time')
window.meridiem = require('date-and-time/plugin/meridiem')
window.ordinal = require('date-and-time/plugin/ordinal')
window.path = require('path')
window.fs = require('fs')
window.si = require('systeminformation')
window.isReachable = require('is-reachable')

window.macaddress = require('macaddress')
window.QRCode = require('qrcode')

const datelog = date.format(now, 'YYYY-MM-DD')
log.transports.file.file = logdir + '/' + datelog + '.log'