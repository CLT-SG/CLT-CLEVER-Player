'use strict'

/**
 * Host OS audio output controls for CLEVER-Player OSD.
 *
 * Uses platform CLI / scripting (no native addons) so packaged builds stay
 * portable. Capabilities degrade gracefully when tools are missing.
 *
 * Linux: pactl (PulseAudio) or wpctl (WirePlumber)
 * macOS: osascript volume settings; SwitchAudioSource when installed
 * Windows: PowerShell CoreAudio endpoint volume + device enumeration
 */

const { execFile } = require('child_process')
const { promisify } = require('util')

const execFileAsync = promisify(execFile)

const DEFAULT_TIMEOUT_MS = 8000

function clampVolume(value) {
  const n = Number(value)
  if (!Number.isFinite(n)) return null
  return Math.max(0, Math.min(100, Math.round(n)))
}

function run(cmd, args, options = {}) {
  return execFileAsync(cmd, args, {
    timeout: options.timeout || DEFAULT_TIMEOUT_MS,
    windowsHide: true,
    encoding: 'utf8',
    maxBuffer: 2 * 1024 * 1024,
    env: options.env || process.env
  }).then((result) => ({
    ok: true,
    stdout: String(result.stdout || ''),
    stderr: String(result.stderr || '')
  })).catch((error) => ({
    ok: false,
    stdout: String((error && error.stdout) || ''),
    stderr: String((error && error.stderr) || (error && error.message) || ''),
    code: error && error.code,
    error
  }))
}

function emptyState(partial = {}) {
  return {
    ok: false,
    platform: process.platform,
    systemVolumeSupported: false,
    systemMuteSupported: false,
    outputDeviceSupported: false,
    volume: null,
    muted: null,
    devices: [],
    selectedDeviceId: null,
    defaultDeviceId: null,
    error: null,
    note: null,
    ...partial
  }
}

/** @internal exported for unit tests */
function parsePactlSinkList(stdout) {
  const devices = []
  let current = null
  String(stdout || '').split(/\r?\n/).forEach((line) => {
    const sinkMatch = line.match(/^Sink\s+#(\d+)/i)
    if (sinkMatch) {
      if (current) devices.push(current)
      current = {
        id: sinkMatch[1],
        name: `Sink ${sinkMatch[1]}`,
        description: '',
        isDefault: false
      }
      return
    }
    if (!current) return
    const nameMatch = line.match(/^\s*Name:\s*(.+)\s*$/i)
    if (nameMatch) {
      current.name = nameMatch[1].trim()
      return
    }
    const descMatch = line.match(/^\s*Description:\s*(.+)\s*$/i)
    if (descMatch) {
      current.description = descMatch[1].trim()
    }
  })
  if (current) devices.push(current)
  return devices
}

/** @internal exported for unit tests */
function parsePactlDefaultSink(stdout) {
  const match = String(stdout || '').match(/Default Sink:\s*(.+)\s*$/im)
  return match ? match[1].trim() : null
}

/** @internal exported for unit tests */
function parsePactlVolume(stdout) {
  const match = String(stdout || '').match(/(\d+)%/)
  return match ? clampVolume(match[1]) : null
}

/** @internal exported for unit tests */
function parsePactlMute(stdout) {
  const match = String(stdout || '').match(/Mute:\s*(yes|no)/i)
  if (!match) return null
  return match[1].toLowerCase() === 'yes'
}

/** @internal exported for unit tests */
function parseWpctlStatus(stdout) {
  const devices = []
  let inSinks = false
  let defaultId = null
  String(stdout || '').split(/\r?\n/).forEach((raw) => {
    // Strip ANSI + WirePlumber tree glyphs so device lines are plain text.
    const line = raw
      .replace(/\x1b\[[0-9;]*m/g, '')
      .replace(/[├└│─┘┐┌*]/g, (ch) => (ch === '*' || ch === '●' ? '*' : ' '))
      .replace(/\s+/g, ' ')
      .trim()
    if (/^Sinks:/i.test(line) || /\bSinks:\s*$/i.test(line) || /Sinks:/i.test(line)) {
      inSinks = true
      return
    }
    if (inSinks && (/^Sources:/i.test(line) || /\bSources:/i.test(line))) {
      inSinks = false
      return
    }
    if (!inSinks) return
    const match = line.match(/^(\*)?\s*(\d+)\.\s+(.+?)\s*$/)
    if (!match) return
    const id = match[2]
    const name = match[3].replace(/\s*\[.*$/, '').trim()
    const isDefault = Boolean(match[1])
    if (isDefault) defaultId = id
    devices.push({ id, name, description: name, isDefault })
  })
  return { devices, defaultId }
}

/** @internal exported for unit tests */
function parseWpctlVolume(stdout) {
  const match = String(stdout || '').match(/Volume:\s*([0-9.]+)/i)
  if (!match) return null
  return clampVolume(Number(match[1]) * 100)
}

/** @internal exported for unit tests */
function parseMacVolumeSettings(stdout) {
  const text = String(stdout || '')
  const volMatch = text.match(/output volume:(-?\d+)/i)
  const muteMatch = text.match(/output muted:(true|false)/i)
  return {
    volume: volMatch ? clampVolume(volMatch[1]) : null,
    muted: muteMatch ? muteMatch[1].toLowerCase() === 'true' : null
  }
}

/** @internal exported for unit tests */
function parseSwitchAudioSourceList(stdout) {
  const devices = []
  String(stdout || '').split(/\r?\n/).forEach((line) => {
    const trimmed = line.trim()
    if (!trimmed) return
    const isDefault = /\(default(?:\s+output)?\)\s*$/i.test(trimmed)
    const name = trimmed.replace(/\s*\(default(?:\s+output)?\)\s*$/i, '').trim()
    if (!name) return
    devices.push({
      id: name,
      name,
      description: name,
      isDefault
    })
  })
  return devices
}

async function linuxViaPactl() {
  const info = await run('pactl', ['info'])
  if (!info.ok) return null
  const defaultSink = parsePactlDefaultSink(info.stdout)
  const list = await run('pactl', ['list', 'sinks'])
  const devices = parsePactlSinkList(list.ok ? list.stdout : '').map((d) => ({
    ...d,
    isDefault: Boolean(defaultSink && (d.name === defaultSink || d.id === defaultSink))
  }))
  const sinkTarget = defaultSink || '@DEFAULT_SINK@'
  const vol = await run('pactl', ['get-sink-volume', sinkTarget])
  const mute = await run('pactl', ['get-sink-mute', sinkTarget])
  const defaultDevice = devices.find((d) => d.isDefault) || devices[0] || null
  return emptyState({
    ok: true,
    systemVolumeSupported: true,
    systemMuteSupported: true,
    outputDeviceSupported: devices.length > 0,
    volume: parsePactlVolume(vol.ok ? vol.stdout : ''),
    muted: parsePactlMute(mute.ok ? mute.stdout : ''),
    devices,
    selectedDeviceId: defaultDevice ? defaultDevice.id : null,
    defaultDeviceId: defaultDevice ? defaultDevice.id : null,
    note: 'Linux PulseAudio (pactl)'
  })
}

async function linuxViaWpctl() {
  const status = await run('wpctl', ['status'])
  if (!status.ok) return null
  const parsed = parseWpctlStatus(status.stdout)
  const target = parsed.defaultId || '@DEFAULT_AUDIO_SINK@'
  const vol = await run('wpctl', ['get-volume', target])
  const volumeText = vol.ok ? vol.stdout : ''
  const muted = /MUTED/i.test(volumeText)
  const defaultDevice = parsed.devices.find((d) => d.isDefault) || parsed.devices[0] || null
  return emptyState({
    ok: true,
    systemVolumeSupported: true,
    systemMuteSupported: true,
    outputDeviceSupported: parsed.devices.length > 0,
    volume: parseWpctlVolume(volumeText),
    muted,
    devices: parsed.devices,
    selectedDeviceId: defaultDevice ? defaultDevice.id : null,
    defaultDeviceId: defaultDevice ? defaultDevice.id : null,
    note: 'Linux WirePlumber (wpctl)'
  })
}

async function getLinuxState() {
  const pactlState = await linuxViaPactl()
  if (pactlState) return pactlState
  const wpctlState = await linuxViaWpctl()
  if (wpctlState) return wpctlState
  return emptyState({
    error: 'Neither pactl nor wpctl is available for system audio control.',
    note: 'Install PulseAudio/PipeWire tools to manage host volume from the OSD.'
  })
}

async function setLinuxVolume(volume) {
  const v = clampVolume(volume)
  if (v === null) return { ok: false, error: 'Invalid volume' }
  let result = await run('pactl', ['set-sink-volume', '@DEFAULT_SINK@', `${v}%`])
  if (result.ok) return { ok: true, volume: v }
  result = await run('wpctl', ['set-volume', '@DEFAULT_AUDIO_SINK@', String(v / 100)])
  if (result.ok) return { ok: true, volume: v }
  return { ok: false, error: result.stderr || 'Failed to set Linux system volume' }
}

async function setLinuxMute(muted) {
  const flag = muted ? '1' : '0'
  let result = await run('pactl', ['set-sink-mute', '@DEFAULT_SINK@', flag])
  if (result.ok) return { ok: true, muted: !!muted }
  result = await run('wpctl', ['set-mute', '@DEFAULT_AUDIO_SINK@', muted ? '1' : '0'])
  if (result.ok) return { ok: true, muted: !!muted }
  return { ok: false, error: result.stderr || 'Failed to set Linux system mute' }
}

async function setLinuxOutputDevice(deviceId) {
  const id = String(deviceId || '').trim()
  if (!id) return { ok: false, error: 'Missing device id' }
  // Prefer sink name for pactl; numeric id also accepted by some hosts.
  let result = await run('pactl', ['set-default-sink', id])
  if (result.ok) return { ok: true, selectedDeviceId: id }
  // Resolve numeric id → name from list when needed.
  const list = await run('pactl', ['list', 'short', 'sinks'])
  if (list.ok) {
    const line = String(list.stdout).split(/\r?\n/).find((row) => row.startsWith(`${id}\t`) || row.includes(`\t${id}\t`))
    if (line) {
      const parts = line.split(/\t/)
      const name = parts[1] || parts[0]
      result = await run('pactl', ['set-default-sink', name])
      if (result.ok) return { ok: true, selectedDeviceId: id }
    }
  }
  return { ok: false, error: result.stderr || 'Failed to set Linux default sink (wpctl device switch not supported)' }
}

async function getDarwinState() {
  const settings = await run('osascript', ['-e', 'get volume settings'])
  if (!settings.ok) {
    return emptyState({
      error: settings.stderr || 'osascript volume settings failed',
      note: 'macOS system volume requires AppleScript access.'
    })
  }
  const parsed = parseMacVolumeSettings(settings.stdout)
  let devices = []
  const switchList = await run('SwitchAudioSource', ['-a', '-t', 'output'])
  if (switchList.ok) {
    devices = parseSwitchAudioSourceList(switchList.stdout)
  }
  const defaultDevice = devices.find((d) => d.isDefault) || devices[0] || null
  return emptyState({
    ok: true,
    systemVolumeSupported: true,
    systemMuteSupported: true,
    outputDeviceSupported: devices.length > 0,
    volume: parsed.volume,
    muted: parsed.muted,
    devices,
    selectedDeviceId: defaultDevice ? defaultDevice.id : null,
    defaultDeviceId: defaultDevice ? defaultDevice.id : null,
    note: devices.length
      ? 'macOS volume via osascript; devices via SwitchAudioSource'
      : 'macOS volume via osascript. Install SwitchAudioSource for output device switching.'
  })
}

async function setDarwinVolume(volume) {
  const v = clampVolume(volume)
  if (v === null) return { ok: false, error: 'Invalid volume' }
  const result = await run('osascript', ['-e', `set volume output volume ${v}`])
  if (!result.ok) return { ok: false, error: result.stderr || 'Failed to set macOS volume' }
  return { ok: true, volume: v }
}

async function setDarwinMute(muted) {
  const result = await run('osascript', ['-e', `set volume output muted ${muted ? 'true' : 'false'}`])
  if (!result.ok) return { ok: false, error: result.stderr || 'Failed to set macOS mute' }
  return { ok: true, muted: !!muted }
}

async function setDarwinOutputDevice(deviceId) {
  const name = String(deviceId || '').trim()
  if (!name) return { ok: false, error: 'Missing device name' }
  const result = await run('SwitchAudioSource', ['-t', 'output', '-s', name])
  if (!result.ok) {
    return {
      ok: false,
      error: result.stderr || 'SwitchAudioSource is required to change macOS output devices'
    }
  }
  return { ok: true, selectedDeviceId: name }
}

const WIN_PS_SCRIPT = `
$ErrorActionPreference = 'Stop'
Add-Type -TypeDefinition @"
using System;
using System.Runtime.InteropServices;
namespace Audio {
  [Guid("5CDF2C82-841E-4546-9722-0CF740782BA3"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
  interface IAudioEndpointVolume {
    int NotImpl1(); int NotImpl2();
    int GetChannelCount(out uint pcChannels);
    int SetMasterVolumeLevel(float fLevelDB, Guid pguidEventContext);
    int SetMasterVolumeLevelScalar(float fLevel, Guid pguidEventContext);
    int GetMasterVolumeLevel(out float pfLevelDB);
    int GetMasterVolumeLevelScalar(out float pfLevel);
    int SetChannelVolumeLevel(uint nChannel, float fLevelDB, Guid pguidEventContext);
    int SetChannelVolumeLevelScalar(uint nChannel, float fLevel, Guid pguidEventContext);
    int GetChannelVolumeLevel(uint nChannel, out float pfLevelDB);
    int GetChannelVolumeLevelScalar(uint nChannel, out float pfLevel);
    int SetMute([MarshalAs(UnmanagedType.Bool)] bool bMute, Guid pguidEventContext);
    int GetMute(out bool pbMute);
  }
  [Guid("D666063F-1587-4E43-81F1-B948E807363F"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
  interface IMMDevice {
    int Activate(ref Guid iid, int dwClsCtx, IntPtr pActivationParams, [MarshalAs(UnmanagedType.IUnknown)] out object ppInterface);
  }
  [Guid("A95664D2-9614-4F35-A746-DE8DB63617E6"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
  interface IMMDeviceEnumerator {
    int EnumAudioEndpoints(int dataFlow, int dwStateMask, out IntPtr ppDevices);
    int GetDefaultAudioEndpoint(int dataFlow, int role, out IMMDevice ppDevice);
  }
  [ComImport, Guid("BCDE0395-E52F-467C-8E3D-C4579291692E")] class MMDeviceEnumeratorComObject { }
  public class Master {
    public static float GetVolume() {
      var enumerator = (IMMDeviceEnumerator)(new MMDeviceEnumeratorComObject());
      IMMDevice device; enumerator.GetDefaultAudioEndpoint(0, 1, out device);
      Guid iid = typeof(IAudioEndpointVolume).GUID;
      object o; device.Activate(ref iid, 1, IntPtr.Zero, out o);
      var ep = (IAudioEndpointVolume)o; float v; ep.GetMasterVolumeLevelScalar(out v); return v;
    }
    public static bool GetMute() {
      var enumerator = (IMMDeviceEnumerator)(new MMDeviceEnumeratorComObject());
      IMMDevice device; enumerator.GetDefaultAudioEndpoint(0, 1, out device);
      Guid iid = typeof(IAudioEndpointVolume).GUID;
      object o; device.Activate(ref iid, 1, IntPtr.Zero, out o);
      var ep = (IAudioEndpointVolume)o; bool m; ep.GetMute(out m); return m;
    }
    public static void SetVolume(float v) {
      var enumerator = (IMMDeviceEnumerator)(new MMDeviceEnumeratorComObject());
      IMMDevice device; enumerator.GetDefaultAudioEndpoint(0, 1, out device);
      Guid iid = typeof(IAudioEndpointVolume).GUID;
      object o; device.Activate(ref iid, 1, IntPtr.Zero, out o);
      var ep = (IAudioEndpointVolume)o; ep.SetMasterVolumeLevelScalar(v, Guid.Empty);
    }
    public static void SetMute(bool m) {
      var enumerator = (IMMDeviceEnumerator)(new MMDeviceEnumeratorComObject());
      IMMDevice device; enumerator.GetDefaultAudioEndpoint(0, 1, out device);
      Guid iid = typeof(IAudioEndpointVolume).GUID;
      object o; device.Activate(ref iid, 1, IntPtr.Zero, out o);
      var ep = (IAudioEndpointVolume)o; ep.SetMute(m, Guid.Empty);
    }
  }
}
"@
$vol = [Audio.Master]::GetVolume()
$mute = [Audio.Master]::GetMute()
$devices = @()
try {
  $obj = New-Object -ComObject MMDeviceEnumerator.MMDeviceEnumerator
} catch {
  $obj = $null
}
# Device names via Win32_SoundDevice (informational; default switch needs separate tooling)
Get-CimInstance Win32_SoundDevice | ForEach-Object {
  $devices += [pscustomobject]@{ id = $_.DeviceID; name = $_.Name; description = $_.Description; isDefault = $false }
}
$result = [pscustomobject]@{
  volume = [int][Math]::Round($vol * 100)
  muted = [bool]$mute
  devices = $devices
}
$result | ConvertTo-Json -Compress
`

async function runPowerShell(script) {
  const encoded = Buffer.from(script, 'utf16le').toString('base64')
  let result = await run('powershell.exe', ['-NoProfile', '-NonInteractive', '-EncodedCommand', encoded])
  if (result.ok) return result
  result = await run('pwsh', ['-NoProfile', '-NonInteractive', '-EncodedCommand', encoded])
  return result
}

async function getWindowsState() {
  const result = await runPowerShell(WIN_PS_SCRIPT)
  if (!result.ok) {
    return emptyState({
      error: result.stderr || 'PowerShell CoreAudio query failed',
      note: 'Windows system volume requires PowerShell access to CoreAudio.'
    })
  }
  let parsed
  try {
    parsed = JSON.parse(String(result.stdout || '').trim().split(/\r?\n/).filter(Boolean).pop())
  } catch (error) {
    return emptyState({
      error: 'Failed to parse Windows audio state',
      note: String(error && error.message)
    })
  }
  const devices = Array.isArray(parsed.devices)
    ? parsed.devices.map((d) => ({
      id: String(d.id || d.name || ''),
      name: String(d.name || d.id || 'Audio device'),
      description: String(d.description || d.name || ''),
      isDefault: Boolean(d.isDefault)
    })).filter((d) => d.id)
    : []
  return emptyState({
    ok: true,
    systemVolumeSupported: true,
    systemMuteSupported: true,
    // Default-device switching needs AudioDeviceCmdlets / nircmd — report list only.
    outputDeviceSupported: false,
    volume: clampVolume(parsed.volume),
    muted: Boolean(parsed.muted),
    devices,
    selectedDeviceId: null,
    defaultDeviceId: null,
    note: devices.length
      ? 'Windows volume/mute via CoreAudio. Output device switching is not available without extra host tools.'
      : 'Windows volume/mute via CoreAudio.'
  })
}

async function setWindowsVolume(volume) {
  const v = clampVolume(volume)
  if (v === null) return { ok: false, error: 'Invalid volume' }
  const script = `${WIN_PS_SCRIPT}\n[Audio.Master]::SetVolume(${(v / 100).toFixed(4)})\n`
  // Reuse type definition path via compact setter:
  const setter = `
$ErrorActionPreference = 'Stop'
Add-Type -TypeDefinition @"
using System; using System.Runtime.InteropServices;
namespace Audio {
  [Guid("5CDF2C82-841E-4546-9722-0CF740782BA3"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
  interface IAudioEndpointVolume {
    int a(); int b(); int GetChannelCount(out uint c);
    int SetMasterVolumeLevel(float f, Guid g); int SetMasterVolumeLevelScalar(float f, Guid g);
    int GetMasterVolumeLevel(out float f); int GetMasterVolumeLevelScalar(out float f);
    int SetChannelVolumeLevel(uint n, float f, Guid g); int SetChannelVolumeLevelScalar(uint n, float f, Guid g);
    int GetChannelVolumeLevel(uint n, out float f); int GetChannelVolumeLevelScalar(uint n, out float f);
    int SetMute([MarshalAs(UnmanagedType.Bool)] bool m, Guid g); int GetMute(out bool m);
  }
  [Guid("D666063F-1587-4E43-81F1-B948E807363F"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
  interface IMMDevice { int Activate(ref Guid iid, int ctx, IntPtr p, [MarshalAs(UnmanagedType.IUnknown)] out object o); }
  [Guid("A95664D2-9614-4F35-A746-DE8DB63617E6"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
  interface IMMDeviceEnumerator { int EnumAudioEndpoints(int f, int s, out IntPtr d); int GetDefaultAudioEndpoint(int f, int r, out IMMDevice d); }
  [ComImport, Guid("BCDE0395-E52F-467C-8E3D-C4579291692E")] class MMDeviceEnumeratorComObject { }
  public class Master {
    static IAudioEndpointVolume Ep() {
      var en = (IMMDeviceEnumerator)(new MMDeviceEnumeratorComObject());
      IMMDevice device; en.GetDefaultAudioEndpoint(0, 1, out device);
      Guid iid = typeof(IAudioEndpointVolume).GUID; object o; device.Activate(ref iid, 1, IntPtr.Zero, out o);
      return (IAudioEndpointVolume)o;
    }
    public static void SetVolume(float v) { Ep().SetMasterVolumeLevelScalar(v, Guid.Empty); }
    public static void SetMute(bool m) { Ep().SetMute(m, Guid.Empty); }
  }
}
"@
[Audio.Master]::SetVolume(${(v / 100).toFixed(4)})
`
  void script
  const result = await runPowerShell(setter)
  if (!result.ok) return { ok: false, error: result.stderr || 'Failed to set Windows volume' }
  return { ok: true, volume: v }
}

async function setWindowsMute(muted) {
  const setter = `
$ErrorActionPreference = 'Stop'
Add-Type -TypeDefinition @"
using System; using System.Runtime.InteropServices;
namespace Audio {
  [Guid("5CDF2C82-841E-4546-9722-0CF740782BA3"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
  interface IAudioEndpointVolume {
    int a(); int b(); int GetChannelCount(out uint c);
    int SetMasterVolumeLevel(float f, Guid g); int SetMasterVolumeLevelScalar(float f, Guid g);
    int GetMasterVolumeLevel(out float f); int GetMasterVolumeLevelScalar(out float f);
    int SetChannelVolumeLevel(uint n, float f, Guid g); int SetChannelVolumeLevelScalar(uint n, float f, Guid g);
    int GetChannelVolumeLevel(uint n, out float f); int GetChannelVolumeLevelScalar(uint n, out float f);
    int SetMute([MarshalAs(UnmanagedType.Bool)] bool m, Guid g); int GetMute(out bool m);
  }
  [Guid("D666063F-1587-4E43-81F1-B948E807363F"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
  interface IMMDevice { int Activate(ref Guid iid, int ctx, IntPtr p, [MarshalAs(UnmanagedType.IUnknown)] out object o); }
  [Guid("A95664D2-9614-4F35-A746-DE8DB63617E6"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
  interface IMMDeviceEnumerator { int EnumAudioEndpoints(int f, int s, out IntPtr d); int GetDefaultAudioEndpoint(int f, int r, out IMMDevice d); }
  [ComImport, Guid("BCDE0395-E52F-467C-8E3D-C4579291692E")] class MMDeviceEnumeratorComObject { }
  public class Master {
    static IAudioEndpointVolume Ep() {
      var en = (IMMDeviceEnumerator)(new MMDeviceEnumeratorComObject());
      IMMDevice device; en.GetDefaultAudioEndpoint(0, 1, out device);
      Guid iid = typeof(IAudioEndpointVolume).GUID; object o; device.Activate(ref iid, 1, IntPtr.Zero, out o);
      return (IAudioEndpointVolume)o;
    }
    public static void SetMute(bool m) { Ep().SetMute(m, Guid.Empty); }
  }
}
"@
[Audio.Master]::SetMute(${muted ? '$true' : '$false'})
`
  const result = await runPowerShell(setter)
  if (!result.ok) return { ok: false, error: result.stderr || 'Failed to set Windows mute' }
  return { ok: true, muted: !!muted }
}

async function getSystemAudioState() {
  if (process.platform === 'linux') return getLinuxState()
  if (process.platform === 'darwin') return getDarwinState()
  if (process.platform === 'win32') return getWindowsState()
  return emptyState({
    error: `Unsupported platform: ${process.platform}`,
    note: 'System audio OSD controls require Windows, macOS, or Linux.'
  })
}

async function setSystemVolume(volume) {
  if (process.platform === 'linux') return setLinuxVolume(volume)
  if (process.platform === 'darwin') return setDarwinVolume(volume)
  if (process.platform === 'win32') return setWindowsVolume(volume)
  return { ok: false, error: `Unsupported platform: ${process.platform}` }
}

async function setSystemMute(muted) {
  if (process.platform === 'linux') return setLinuxMute(muted)
  if (process.platform === 'darwin') return setDarwinMute(muted)
  if (process.platform === 'win32') return setWindowsMute(muted)
  return { ok: false, error: `Unsupported platform: ${process.platform}` }
}

async function setSystemOutputDevice(deviceId) {
  if (process.platform === 'linux') return setLinuxOutputDevice(deviceId)
  if (process.platform === 'darwin') return setDarwinOutputDevice(deviceId)
  if (process.platform === 'win32') {
    return {
      ok: false,
      error: 'Windows output device switching is not available without host audio-device tools.'
    }
  }
  return { ok: false, error: `Unsupported platform: ${process.platform}` }
}

module.exports = {
  clampVolume,
  parsePactlSinkList,
  parsePactlDefaultSink,
  parsePactlVolume,
  parsePactlMute,
  parseWpctlStatus,
  parseWpctlVolume,
  parseMacVolumeSettings,
  parseSwitchAudioSourceList,
  getSystemAudioState,
  setSystemVolume,
  setSystemMute,
  setSystemOutputDevice
}
