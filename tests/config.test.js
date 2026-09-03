'use strict'

const { test, describe } = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')
const http = require('node:http')
const { parseIni, serializeIni } = require('../src/main/ini')
const {
  SCHEMA,
  validateAndApplyDefaults,
  parseLegacyConfigJs,
  legacyJsToSections,
  toLegacyConfig,
  getDefaultSections
} = require('../src/main/config-schema')
const configService = require('../src/main/config-service')
const { isValidAccelerator, isPrivateHost, isValidHost } = require('../src/main/config-template')
const { normalizeUrl, isReachable } = require('../src/main/reachable')

function sampleConfigJs(host = '10.0.0.5') {
  return `
        var hostserver = '${host}'; // IP or Hostname Hosted
        var controllerport = '80'; // Clever Controller Port Number
        var cleverwebport = '9100'; // Clever Web Hosting Port Number
        var mediaserverport = '9200'; // Media Server Services Port Number
        var screenserverport = '9300'; // Screen Cast Web Hosting Services Port Number
        var screenapiport = '9301'; // Screen Cast Socket API Services Port Number
        var tempid = '42'; // insert template id
        var serialkey = 'abc123serial'; // Serial key
        var ctrltype = 'videowall'; // Controller type
        module.exports.hostserver = hostserver;
        module.exports.ctrltype = ctrltype;
      `
}

describe('INI parser', () => {
  test('parses sections, comments, and quoted values', () => {
    const parsed = parseIni(`
; comment
# hash comment
[PLAYER]
SERIAL_KEY="ABC DEF"
[SERVER]
HOST=10.0.0.8
    `)
    assert.equal(parsed.PLAYER.SERIAL_KEY, 'ABC DEF')
    assert.equal(parsed.SERVER.HOST, '10.0.0.8')
  })

  test('round-trips schema values', () => {
    const sections = getDefaultSections()
    sections.SERVER.HOST = 'clever.local'
    sections.PLAYER.CTRL_TYPE = 'videowall'
    const text = serializeIni(sections, SCHEMA)
    const parsed = parseIni(text)
    assert.equal(parsed.SERVER.HOST, 'clever.local')
    assert.equal(parsed.PLAYER.CTRL_TYPE, 'videowall')
    assert.match(text, /\[LOGGING\]/)
    assert.match(text, /LOG_LEVEL=INFO/)
  })
})

describe('configuration validation', () => {
  test('replaces invalid SERVER values with defaults and continues', () => {
    const { sections, warnings } = validateAndApplyDefaults({
      SERVER: {
        HOST: '10.1.2.3',
        CONTROLLER_PORT: '99999',
        HEARTBEAT_INTERVAL: 'nope'
      },
      LOGGING: {
        LOG_LEVEL: 'TRACE'
      }
    })
    assert.equal(sections.SERVER.HOST, '10.1.2.3')
    assert.equal(sections.SERVER.CONTROLLER_PORT, 80)
    assert.equal(sections.SERVER.HEARTBEAT_INTERVAL, 30)
    assert.equal(sections.LOGGING.LOG_LEVEL, 'info')
    assert.ok(warnings.some((item) => item.key === 'CONTROLLER_PORT'))
    assert.ok(warnings.some((item) => item.key === 'HEARTBEAT_INTERVAL'))
    assert.ok(warnings.some((item) => item.key === 'LOG_LEVEL'))
  })

  test('accepts boolean synonyms and integer values', () => {
    const { sections, warnings } = validateAndApplyDefaults({
      ADVANCED: { DEV_MODE: 'yes', DEBUG_MODE: '0' },
      NETWORK: { NETWORK_TIMEOUT: '15' }
    })
    assert.equal(warnings.length, 0)
    assert.equal(sections.ADVANCED.DEV_MODE, true)
    assert.equal(sections.ADVANCED.DEBUG_MODE, false)
    assert.equal(sections.NETWORK.NETWORK_TIMEOUT, 15)
  })

  test('legacy mapping keeps player runtime fields', () => {
    const sections = legacyJsToSections(parseLegacyConfigJs(sampleConfigJs('192.168.10.20')))
    const legacy = toLegacyConfig(sections)
    assert.equal(legacy.hostserver, '192.168.10.20')
    assert.equal(legacy.controller, '192.168.10.20:80')
    assert.equal(legacy.cleverweb, '192.168.10.20:9100')
    assert.equal(legacy.tempid, '42')
    assert.equal(legacy.serialkey, 'abc123serial')
    assert.equal(legacy.ctrltype, 'videowall')
    assert.equal(legacy.timeout, 30000)
    assert.equal(legacy.controllerport1, '80')
  })
})

describe('config.js migration', () => {
  test('parses legacy assignments without evaluating JavaScript', () => {
    const parsed = parseLegacyConfigJs("var hostserver = 'evil'); process.exit(1); //';\nvar tempid = '9';")
    assert.equal(parsed.hostserver.includes('process.exit'), false)
    assert.equal(parsed.tempid, '9')
  })

  test('writes config.ini, backups config.js, and keeps runtime compatibility', () => {
    const appDir = fs.mkdtempSync(path.join(os.tmpdir(), 'clever-config-'))
    try {
      configService.resetForTests()
      const jsPath = path.join(appDir, 'config.js')
      fs.writeFileSync(jsPath, sampleConfigJs('10.8.8.8'))
      const snapshot = configService.initialize({ appDir })
      assert.equal(snapshot.migrated, true)
      assert.equal(fs.existsSync(path.join(appDir, 'config.ini')), true)
      assert.equal(fs.existsSync(jsPath), false)
      assert.equal(fs.existsSync(`${jsPath}.bak`), true)
      const legacy = snapshot.legacy
      assert.equal(legacy.hostserver, '10.8.8.8')
      assert.equal(legacy.tempid, '42')
      assert.equal(legacy.ctrltype, 'videowall')
      assert.equal(legacy.serialkey, 'abc123serial')
      const ini = fs.readFileSync(snapshot.iniPath, 'utf8')
      assert.match(ini, /HOST=10\.8\.8\.8/)
      assert.match(ini, /TEMPLATE_ID=42/)
      assert.match(ini, /CTRL_TYPE=videowall/)
    } finally {
      fs.rmSync(appDir, { recursive: true, force: true })
      configService.resetForTests()
    }
  })

  test('updates HOST from the configure UI without resetting other ports', () => {
    const appDir = fs.mkdtempSync(path.join(os.tmpdir(), 'clever-config-'))
    try {
      configService.resetForTests()
      configService.createDefault('10.0.0.5', appDir)
      const before = configService.getValues()
      configService.updateFromConfigureUi({
        hostaddress: '10.0.0.9',
        tempid: '7',
        ctrltype: 'videowall',
        serialkey: 'new-key'
      })
      const after = configService.getValues()
      assert.equal(after.HOST, '10.0.0.9')
      assert.equal(after.TEMPLATE_ID, '7')
      assert.equal(after.CTRL_TYPE, 'videowall')
      assert.equal(after.SERIAL_KEY, 'new-key')
      assert.equal(after.WEB_PORT, before.WEB_PORT)
      assert.equal(after.MEDIA_PORT, before.MEDIA_PORT)
    } finally {
      fs.rmSync(appDir, { recursive: true, force: true })
      configService.resetForTests()
    }
  })
})

describe('validation helpers', () => {
  test('accepts electron accelerators used by presets', () => {
    assert.equal(isValidAccelerator('Alt+F5'), true)
    assert.equal(isValidAccelerator('Control+Shift+P'), true)
    assert.equal(isValidAccelerator('not a key!!!'), false)
    assert.equal(isValidAccelerator(''), false)
  })

  test('detects private hosts', () => {
    assert.equal(isPrivateHost('127.0.0.1'), true)
    assert.equal(isPrivateHost('192.168.1.10'), true)
    assert.equal(isPrivateHost('10.1.2.3'), true)
    assert.equal(isPrivateHost('example.com'), false)
  })

  test('accepts IPs and hostnames', () => {
    assert.equal(isValidHost('localhost'), true)
    assert.equal(isValidHost('10.0.0.8'), true)
    assert.equal(isValidHost('clever.local'), true)
    assert.equal(isValidHost('not a host'), false)
  })
})

describe('reachable helper', () => {
  test('normalizes hosts into URLs', () => {
    assert.equal(normalizeUrl('10.0.0.1:80'), 'http://10.0.0.1:80')
    assert.equal(normalizeUrl('https://example.com'), 'https://example.com')
  })

  test('detects a local HTTP server', async () => {
    const server = http.createServer((_req, res) => {
      res.writeHead(200)
      res.end('ok')
    })
    await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve))
    const { port } = server.address()
    try {
      assert.equal(await isReachable(`127.0.0.1:${port}`, { timeout: 2000 }), true)
      assert.equal(await isReachable('127.0.0.1:1', { timeout: 500 }), false)
    } finally {
      server.close()
    }
  })
})
