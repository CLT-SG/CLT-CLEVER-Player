'use strict'

const { describe, it } = require('node:test')
const assert = require('node:assert/strict')
const {
  clampVolume,
  parsePactlSinkList,
  parsePactlDefaultSink,
  parsePactlVolume,
  parsePactlMute,
  parseWpctlStatus,
  parseWpctlVolume,
  parseMacVolumeSettings,
  parseSwitchAudioSourceList
} = require('../src/main/system-audio')

describe('system-audio helpers', () => {
  it('clamps volume to 0–100', () => {
    assert.equal(clampVolume(-5), 0)
    assert.equal(clampVolume(150), 100)
    assert.equal(clampVolume('42.4'), 42)
    assert.equal(clampVolume('nope'), null)
  })

  it('parses pactl sink list and default sink', () => {
    const sinks = parsePactlSinkList(`
Sink #0
\tState: RUNNING
\tName: alsa_output.pci.analog-stereo
\tDescription: Built-in Audio Analog Stereo
Sink #1
\tName: usb_dac
\tDescription: USB DAC
`)
    assert.equal(sinks.length, 2)
    assert.equal(sinks[0].id, '0')
    assert.equal(sinks[0].name, 'alsa_output.pci.analog-stereo')
    assert.equal(sinks[1].description, 'USB DAC')
    assert.equal(parsePactlDefaultSink('Default Sink: usb_dac\n'), 'usb_dac')
  })

  it('parses pactl volume and mute', () => {
    assert.equal(parsePactlVolume('Volume: front-left: 30000 /  45% / -10.00 dB'), 45)
    assert.equal(parsePactlMute('Mute: yes'), true)
    assert.equal(parsePactlMute('Mute: no'), false)
  })

  it('parses wpctl status and volume', () => {
    const parsed = parseWpctlStatus(`
Audio
 ├─ Sinks:
 │  *   48. Built-in Audio Analog Stereo
 │      52. HDMI Output
 ├─ Sources:
 │      49. Mic
`)
    assert.equal(parsed.devices.length, 2)
    assert.equal(parsed.defaultId, '48')
    assert.equal(parsed.devices[0].isDefault, true)
    assert.equal(parseWpctlVolume('Volume: 0.80'), 80)
    assert.equal(parseWpctlVolume('Volume: 0.50 [MUTED]'), 50)
  })

  it('parses macOS volume settings and SwitchAudioSource list', () => {
    assert.deepEqual(
      parseMacVolumeSettings('output volume:55, input volume:50, alert volume:100, output muted:true'),
      { volume: 55, muted: true }
    )
    const devices = parseSwitchAudioSourceList(`
MacBook Pro Speakers (default)
External Headphones
`)
    assert.equal(devices.length, 2)
    assert.equal(devices[0].isDefault, true)
    assert.equal(devices[1].name, 'External Headphones')
  })
})
