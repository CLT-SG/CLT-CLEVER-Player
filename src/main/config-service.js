'use strict'

const fs = require('fs')
const path = require('path')
const { getAppDir, ensureAppDirs } = require('./paths')
const { parseIni, serializeIni } = require('./ini')
const {
  SCHEMA,
  getDefaultSections,
  validateAndApplyDefaults,
  flattenSections,
  toLegacyConfig,
  parseLegacyConfigJs,
  legacyJsToSections
} = require('./config-schema')

let current = {
  appDir: null,
  iniPath: null,
  jsPath: null,
  sections: getDefaultSections(),
  warnings: [],
  migrated: false,
  created: false,
  loaded: false
}

function getLogger() {
  try {
    return require('./logger').getLoggers()
  } catch {
    return {
      log: console,
      errorLog: console
    }
  }
}

function resolvePaths(appDir) {
  const dir = appDir || getAppDir()
  return {
    appDir: dir,
    iniPath: path.join(dir, 'config.ini'),
    jsPath: path.join(dir, 'config.js')
  }
}

function uniqueBackupPath(filePath) {
  const backup = `${filePath}.bak`
  if (!fs.existsSync(backup)) {
    return backup
  }
  return `${filePath}.${Date.now()}.bak`
}

function readFileIfExists(filePath) {
  try {
    if (fs.existsSync(filePath)) {
      return fs.readFileSync(filePath, 'utf8')
    }
  } catch (error) {
    getLogger().errorLog.error('Failed to read configuration file', filePath, error)
  }
  return null
}

function writeIniFile(iniPath, sections) {
  fs.mkdirSync(path.dirname(iniPath), { recursive: true })
  fs.writeFileSync(iniPath, serializeIni(sections, SCHEMA), 'utf8')
}

function applyState(appDir, iniPath, jsPath, sections, warnings, flags = {}) {
  current = {
    appDir,
    iniPath,
    jsPath,
    sections,
    warnings: warnings || [],
    migrated: Boolean(flags.migrated),
    created: Boolean(flags.created),
    loaded: true
  }
  logWarnings(current.warnings)
  return getSnapshot()
}

function logWarnings(warnings) {
  if (!warnings || warnings.length === 0) {
    return
  }
  const { errorLog } = getLogger()
  for (const warning of warnings) {
    errorLog.error(
      `Invalid ${warning.section}.${warning.key} value "${warning.value}": ${warning.reason}. Using default ${warning.used}.`
    )
  }
}

function loadFromIni(iniPath, appDir, jsPath) {
  const source = readFileIfExists(iniPath)
  if (source === null) {
    const sections = getDefaultSections()
    getLogger().errorLog.error('config.ini could not be read. Using default values.')
    return applyState(appDir, iniPath, jsPath, sections, [{
      section: 'SERVER',
      key: 'HOST',
      value: '',
      reason: 'Configuration file unreadable',
      used: sections.SERVER.HOST
    }])
  }
  const parsed = parseIni(source)
  const { sections, warnings } = validateAndApplyDefaults(parsed)
  return applyState(appDir, iniPath, jsPath, sections, warnings)
}

function migrateFromJs(jsPath, iniPath, appDir) {
  const { log, errorLog } = getLogger()
  const source = readFileIfExists(jsPath)
  if (source === null) {
    return null
  }

  const legacy = parseLegacyConfigJs(source)
  const migratedSections = legacyJsToSections(legacy)
  const { sections, warnings } = validateAndApplyDefaults(migratedSections)

  try {
    writeIniFile(iniPath, sections)
    const backupPath = uniqueBackupPath(jsPath)
    fs.copyFileSync(jsPath, backupPath)
    fs.unlinkSync(jsPath)
    log.info('Migrated configuration from config.js to config.ini', { backupPath })
  } catch (error) {
    errorLog.error('Failed to finish config.js migration', error)
  }

  return applyState(appDir, iniPath, jsPath, sections, warnings, { migrated: true })
}

function createDefault(host, appDir) {
  const paths = resolvePaths(appDir)
  const sections = getDefaultSections()
  const safeHost = String(host || '127.0.0.1').replace(/['"]/g, '')
  sections.SERVER.HOST = safeHost
  writeIniFile(paths.iniPath, sections)
  return applyState(paths.appDir, paths.iniPath, paths.jsPath, sections, [], { created: true })
}

function initialize(options = {}) {
  ensureAppDirs()
  const paths = resolvePaths(options.appDir)
  current.appDir = paths.appDir
  current.iniPath = paths.iniPath
  current.jsPath = paths.jsPath

  if (fs.existsSync(paths.iniPath)) {
    return loadFromIni(paths.iniPath, paths.appDir, paths.jsPath)
  }

  if (fs.existsSync(paths.jsPath)) {
    const migrated = migrateFromJs(paths.jsPath, paths.iniPath, paths.appDir)
    if (migrated) {
      return migrated
    }
  }

  const host = options.host || '127.0.0.1'
  return createDefault(host, paths.appDir)
}

function reload() {
  if (!current.iniPath || !fs.existsSync(current.iniPath)) {
    return getSnapshot()
  }
  return loadFromIni(current.iniPath, current.appDir, current.jsPath)
}

function mergeSections(base, overlay) {
  const result = asParsed(base)
  for (const [section, values] of Object.entries(overlay || {})) {
    result[section] = { ...(result[section] || {}), ...values }
  }
  return result
}

function updateValues(partial, options = {}) {
  const { sections, warnings } = validateAndApplyDefaults(
    mergeSections(current.sections, partialToSections(partial))
  )
  current.sections = sections
  current.warnings = warnings
  logWarnings(warnings)
  if (options.write !== false) {
    writeIniFile(current.iniPath || resolvePaths(current.appDir).iniPath, sections)
  }
  current.loaded = true
  return getSnapshot()
}

function partialToSections(partial) {
  if (!partial || typeof partial !== 'object') {
    return {}
  }
  if (partial.PLAYER || partial.SERVER) {
    return partial
  }
  const parsed = {}
  for (const [key, value] of Object.entries(partial)) {
    if (value && typeof value === 'object' && !Array.isArray(value)) {
      parsed[key.toUpperCase()] = value
      continue
    }
    const field = SCHEMA.find((item) => item.key === key || `${item.section}.${item.key}` === key)
    if (!field) {
      continue
    }
    if (!parsed[field.section]) {
      parsed[field.section] = {}
    }
    parsed[field.section][field.key] = value
  }
  return parsed
}

function asParsed(sections) {
  const parsed = {}
  for (const [section, values] of Object.entries(sections || {})) {
    parsed[section] = { ...values }
  }
  return parsed
}

function updateFromConfigureUi(args = {}) {
  return updateValues({
    HOST: args.hostaddress,
    TEMPLATE_ID: args.tempid,
    CTRL_TYPE: args.ctrltype,
    SERIAL_KEY: args.serialkey
  })
}

function getSnapshot() {
  const iniPath = current.iniPath || resolvePaths(current.appDir).iniPath
  return {
    appDir: current.appDir,
    iniPath,
    jsPath: current.jsPath,
    sections: current.sections,
    values: flattenSections(current.sections),
    warnings: current.warnings,
    migrated: current.migrated,
    created: current.created,
    loaded: current.loaded,
    legacy: toLegacyConfig(current.sections, { iniPath })
  }
}

function getLegacyConfig() {
  if (!current.loaded) {
    const paths = resolvePaths()
    if (fs.existsSync(paths.iniPath)) {
      loadFromIni(paths.iniPath, paths.appDir, paths.jsPath)
    } else if (fs.existsSync(paths.jsPath)) {
      migrateFromJs(paths.jsPath, paths.iniPath, paths.appDir)
    }
  }
  return current.loaded ? toLegacyConfig(current.sections, { iniPath: current.iniPath }) : null
}

function getValues() {
  return flattenSections(current.sections)
}

function getSections() {
  return current.sections
}

function getIniPath(appDir) {
  return resolvePaths(appDir).iniPath
}

function getJsPath(appDir) {
  return resolvePaths(appDir).jsPath
}

function hasIni(appDir) {
  return fs.existsSync(resolvePaths(appDir).iniPath)
}

function hasLegacyJs(appDir) {
  return fs.existsSync(resolvePaths(appDir).jsPath)
}

function generateDefaultIni(host) {
  const sections = getDefaultSections()
  if (host) {
    sections.SERVER.HOST = String(host).replace(/['"]/g, '')
  }
  return serializeIni(sections, SCHEMA)
}

function resetForTests() {
  current = {
    appDir: null,
    iniPath: null,
    jsPath: null,
    sections: getDefaultSections(),
    warnings: [],
    migrated: false,
    created: false,
    loaded: false
  }
}

module.exports = {
  initialize,
  reload,
  createDefault,
  updateValues,
  updateFromConfigureUi,
  getSnapshot,
  getLegacyConfig,
  getValues,
  getSections,
  getIniPath,
  getJsPath,
  hasIni,
  hasLegacyJs,
  generateDefaultIni,
  writeIniFile,
  migrateFromJs,
  loadFromIni,
  resetForTests
}
