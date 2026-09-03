'use strict'

const fs = require('fs')
const os = require('os')
const path = require('path')
const log = require('electron-log')
const { getLogDir, ensureAppDirs } = require('./paths')
const { redactArgs } = require('./redact')

const DEFAULT_MAX_LOG_SIZE = 5 * 1024 * 1024
const DEFAULT_RETENTION_MS = 14 * 24 * 60 * 60 * 1000
const LOG_LEVELS = ['error', 'warn', 'info', 'verbose', 'debug', 'silly']

let maxLogSize = DEFAULT_MAX_LOG_SIZE
let retentionMs = DEFAULT_RETENTION_MS
let fileLevel = process.env.NODE_ENV === 'production' ? 'info' : 'debug'
let initialized = false
let errorLog
let updaterLog
let playerLog

function archiveAndPrune(file) {
  try {
    const archived = file.path.replace(/\.log$/, `.${Date.now()}.old.log`)
    fs.renameSync(file.path, archived)
  } catch {
    // Continue even if rotate fails; electron-log will recreate the file.
  }
  pruneOldLogs()
}

function pruneOldLogs() {
  const logDir = getLogDir()
  let entries = []
  try {
    entries = fs.readdirSync(logDir)
  } catch {
    return
  }

  const cutoff = Date.now() - retentionMs
  for (const name of entries) {
    if (!name.endsWith('.log')) {
      continue
    }
    const filePath = path.join(logDir, name)
    try {
      const stat = fs.statSync(filePath)
      const isArchive = name.includes('.old.log') || /^\d{4}-\d{2}-\d{2}\.log$/.test(name)
      if (isArchive && stat.mtimeMs < cutoff) {
        fs.unlinkSync(filePath)
      }
    } catch {
      // Ignore files that disappear during prune.
    }
  }
}

function normalizeLevel(level) {
  const text = String(level || '').trim().toLowerCase()
  return LOG_LEVELS.includes(text) ? text : null
}

function configureFileTransport(logger, fileName, level) {
  logger.transports.file.level = level
  logger.transports.console.level = process.env.NODE_ENV === 'production' ? 'info' : 'debug'
  logger.transports.file.maxSize = maxLogSize
  logger.transports.file.format = '[{y}-{m}-{d} {h}:{i}:{s}.{ms}] [{level}] {text}'
  logger.transports.file.resolvePathFn = () => path.join(getLogDir(), fileName)
  logger.transports.file.archiveLogFn = archiveAndPrune
}

function wrapRedaction(logger) {
  for (const level of ['error', 'warn', 'info', 'verbose', 'debug', 'silly']) {
    const original = logger[level].bind(logger)
    logger[level] = (...args) => original(...redactArgs(args))
  }
  return logger
}

function setupLogging() {
  if (initialized) {
    return getLoggers()
  }

  ensureAppDirs()

  if (typeof log.initialize === 'function') {
    log.initialize({ spyRendererConsole: false })
  }

  configureFileTransport(log, 'application.log', fileLevel)
  wrapRedaction(log)

  const originalError = log.error.bind(log)
  const originalWarn = log.warn.bind(log)
  log.error = (...args) => {
    originalError(...args)
    if (errorLog) {
      errorLog.error(...args)
    }
  }
  log.warn = (...args) => {
    originalWarn(...args)
    if (errorLog) {
      errorLog.warn(...args)
    }
  }

  errorLog = log.create({ logId: 'error' })
  configureFileTransport(errorLog, 'error.log', 'warn')
  wrapRedaction(errorLog)

  updaterLog = log.create({ logId: 'updater' })
  configureFileTransport(updaterLog, 'updater.log', 'info')
  wrapRedaction(updaterLog)

  playerLog = log.create({ logId: 'player' })
  configureFileTransport(playerLog, 'player.log', 'info')
  wrapRedaction(playerLog)

  process.on('uncaughtException', (error) => {
    errorLog.error('Unhandled main-process exception', error)
  })

  process.on('unhandledRejection', (reason) => {
    errorLog.error('Unhandled main-process rejection', reason)
  })

  process.on('warning', (warning) => {
    log.warn('Process warning', warning)
  })

  initialized = true
  pruneOldLogs()
  return getLoggers()
}

function logApplicationStart(app) {
  const { appDir, logDir } = ensureAppDirs()
  log.info('Application started')
  log.info('Application version', app.getVersion())
  log.info('Electron version', process.versions.electron)
  log.info('Chrome version', process.versions.chrome)
  log.info('Node version', process.versions.node)
  log.info('OS information', `${os.type()} ${os.release()} ${os.arch()}`)
  log.info('Platform', process.platform)
  log.info('Packaged', app.isPackaged)
  log.info('App directory', appDir)
  log.info('Log directory', logDir)
}

function applyLogSettings({ level, retentionDays, maxSizeMb, debugMode } = {}) {
  const nextLevel = normalizeLevel(debugMode ? 'debug' : level)
  if (nextLevel) {
    fileLevel = nextLevel
  }
  if (typeof maxSizeMb === 'number' && maxSizeMb > 0) {
    maxLogSize = maxSizeMb * 1024 * 1024
  }
  if (typeof retentionDays === 'number' && retentionDays > 0) {
    retentionMs = retentionDays * 24 * 60 * 60 * 1000
  }
  if (!initialized) {
    return
  }
  configureFileTransport(log, 'application.log', fileLevel)
  if (errorLog) {
    configureFileTransport(errorLog, 'error.log', 'warn')
  }
  if (updaterLog) {
    configureFileTransport(updaterLog, 'updater.log', fileLevel)
  }
  if (playerLog) {
    configureFileTransport(playerLog, 'player.log', fileLevel)
  }
  pruneOldLogs()
}

function getLoggers() {
  return {
    log,
    errorLog: errorLog || log,
    updaterLog: updaterLog || log,
    playerLog: playerLog || log
  }
}

module.exports = {
  setupLogging,
  applyLogSettings,
  logApplicationStart,
  getLoggers,
  MAX_LOG_SIZE: DEFAULT_MAX_LOG_SIZE,
  RETENTION_MS: DEFAULT_RETENTION_MS
}
