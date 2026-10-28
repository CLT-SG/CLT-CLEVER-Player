'use strict'

const test = require('node:test')
const assert = require('node:assert/strict')
const {
  hideConsoleChrome,
  stackConsoleAboveLogin,
  stackLoginAboveConsole,
  toggleConsoleLoginStack,
} = require('../src/main/window-stack')

function fakeWin(name, { visible = false, focused = false } = {}) {
  const state = { visible, focused, destroyed: false, raised: 0 }
  return {
    name,
    state,
    isDestroyed: () => state.destroyed,
    isVisible: () => state.visible,
    isFocused: () => state.focused,
    isAlwaysOnTop: () => true,
    show() { state.visible = true },
    hide() { state.visible = false },
    moveTop() { state.raised += 1 },
    focus() {
      state.focused = true
      state.visible = true
    },
    blur() { state.focused = false },
  }
}

test('hideConsoleChrome hides the management window', () => {
  const server = fakeWin('server', { visible: true })
  hideConsoleChrome(server)
  assert.equal(server.state.visible, false)
})

test('stackConsoleAboveLogin shows login then raises console', () => {
  const login = fakeWin('login')
  const consoleWin = fakeWin('console')
  stackConsoleAboveLogin(login, consoleWin)
  assert.equal(login.state.visible, true)
  assert.equal(consoleWin.state.visible, true)
  assert.equal(consoleWin.state.focused, true)
  assert.equal(consoleWin.state.raised, 1)
  assert.equal(login.state.focused, false)
})

test('stackLoginAboveConsole raises login over console', () => {
  const login = fakeWin('login', { visible: true })
  const consoleWin = fakeWin('console', { visible: true, focused: true })
  stackLoginAboveConsole(login, consoleWin)
  assert.equal(login.state.focused, true)
  assert.equal(login.state.raised, 1)
})

test('toggleConsoleLoginStack flips between surfaces', () => {
  const login = fakeWin('login', { visible: true, focused: true })
  const consoleWin = fakeWin('console', { visible: true })
  assert.equal(toggleConsoleLoginStack(login, consoleWin), 'console')
  assert.equal(consoleWin.state.focused, true)
  login.state.focused = false
  assert.equal(toggleConsoleLoginStack(login, consoleWin), 'login')
  assert.equal(login.state.focused, true)
})
