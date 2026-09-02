'use strict'

const { test, describe } = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const pkg = require('../package.json')

describe('version and release metadata', () => {
  test('package version is semantic', () => {
    assert.match(pkg.version, /^\d+\.\d+\.\d+(-[a-z]+\.\d+)?$/)
  })

  test('electron-builder publishes GitHub update metadata', () => {
    assert.equal(pkg.build.publish.provider, 'github')
    assert.equal(pkg.build.win.target, 'nsis')
    assert.match(pkg.build.nsis.artifactName, /Clever-Player Setup/)
  })

  test('required release workflow exists', () => {
    const workflow = fs.readFileSync(path.join(__dirname, '../.github/workflows/release.yml'), 'utf8')
    assert.match(workflow, /tags:\s*\n\s*- 'v\*'/)
    assert.match(workflow, /electron-builder/)
    assert.match(workflow, /GH_TOKEN/)
  })
})
