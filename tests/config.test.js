'use strict'

const { test, describe } = require('node:test')
const assert = require('node:assert/strict')
const http = require('node:http')
const { generateConfigContent, variableOrder, isValidAccelerator, isPrivateHost, isValidHost } = require('../src/main/config-template')
const { normalizeUrl, isReachable } = require('../src/main/reachable')

describe('config template', () => {
  test('generates semantic config exports for a host', () => {
    const content = generateConfigContent('10.0.0.5')
    assert.match(content, /var hostserver = '10\.0\.0\.5';/)
    assert.match(content, /module\.exports\.ctrltype = ctrltype;/)
    for (const name of variableOrder()) {
      assert.equal(content.includes(name), true)
    }
  })

  test('strips quotes from host values', () => {
    const content = generateConfigContent("evil'); process.exit(1); //")
    assert.equal(content.includes("evil');"), false)
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
