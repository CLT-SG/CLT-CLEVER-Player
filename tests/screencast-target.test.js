'use strict'

const { test, describe } = require('node:test')
const assert = require('node:assert/strict')
const {
  connectionCandidates,
  preferredHostname,
  deriveHostnameLocal,
  splitHostScreen,
  applyRegisteredWebsockify,
  buildScreencastUrl
} = require('../src/main/screencast-target')

describe('Screencast-VNC connection targets', () => {
  test('uses registered hostname, FQDN, and IP without inventing .local', () => {
    assert.deepEqual(
      connectionCandidates('CLT-27AIO', 'CLT-27AIO.local', '192.168.1.100'),
      ['CLT-27AIO', 'CLT-27AIO.local', '192.168.1.100']
    )
    assert.equal(preferredHostname('CLT-27AIO', 'CLT-27AIO.local'), 'CLT-27AIO')
    assert.equal(preferredHostname('CLT-27AIO.local'), 'CLT-27AIO.local')
    assert.equal(preferredHostname('192.168.1.100'), '192.168.1.100')
    assert.equal(deriveHostnameLocal('CLT-27AIO', null), null)
    assert.equal(deriveHostnameLocal('CLT-27AIO', 'CLT-27AIO.local'), 'CLT-27AIO.local')
  })

  test('splits host:screen on the last colon so .local names stay intact', () => {
    assert.deepEqual(splitHostScreen('CLT-27AIO.local:0'), {
      hostname: 'CLT-27AIO.local',
      screen: '0'
    })
    assert.deepEqual(splitHostScreen('192.168.1.100:1'), {
      hostname: '192.168.1.100',
      screen: '1'
    })
  })

  test('keeps ScreencastApp websockify instead of connecting to VNC directly', () => {
    const player = applyRegisteredWebsockify(
      { port: 8080, path: '' },
      { deviceId: 'abc', wsPort: 8840, vncPort: 5900 }
    )
    assert.equal(player.port, 8840)
    assert.equal(player.path, 'screen0')
    const preview = applyRegisteredWebsockify(
      { port: 8840, path: 'screen0' },
      { deviceId: 'abc', wsPort: 8840, vncPort: 5900 }
    )
    assert.equal(preview.port, 8840)
    assert.equal(preview.path, 'screen0')
    const url = buildScreencastUrl('/screencast', 'CLT-27AIO.local:0', {
      deviceId: 'abc',
      wsPort: 8840,
      vncPort: 5900,
      ip: '192.168.1.100'
    })
    assert.match(url, /hostname=CLT-27AIO\.local/)
    assert.match(url, /port=8840/)
    assert.match(url, /path=screen0/)
    assert.doesNotMatch(url, /:5900/)
  })
})
