'use strict'

const test = require('node:test')
const assert = require('node:assert/strict')
const {
  hideConsoleChrome,
  stackConsoleAboveLogin,
  stackLoginAboveConsole,
  toggleConsoleLoginStack,
  enforcePreferredStack,
  getPreferredSurface,
  LEVEL_TOP,
  LEVEL_UNDER,
} = require('../src/main/window-stack')

function fakeWin(name, { visible = false, focused = false } = {}) {
  const state = {
    visible,
    focused,
    destroyed: false,
    raised: 0,
    alwaysOnTopLevel: null,
  }
  return {
    name,
    state,
    isDestroyed: () => state.destroyed,
    isVisible: () => state.visible,
    isFocused: () => state.focused,
    isAlwaysOnTop: () => Boolean(state.alwaysOnTopLevel),
    show() { state.visible = true },
    hide() { state.visible = false },
    moveTop() { state.raised += 1 },
    focus() {
      state.focused = true
      state.visible = true
    },
    blur() { state.focused = false },
    setAlwaysOnTop(_flag, level) {
      state.alwaysOnTopLevel = level || 'normal'
    },
  }
}

test('hideConsoleChrome hides the management window', () => {
  const server = fakeWin('server', { visible: true })
  hideConsoleChrome(server)
  assert.equal(server.state.visible, false)
})

test('default preferred surface is Console login/preview', () => {
  assert.equal(getPreferredSurface(), 'login')
})

test('stackLoginAboveConsole raises Console login/preview above management', () => {
  const login = fakeWin('login')
  const consoleWin = fakeWin('console', { visible: true, focused: true })
  stackLoginAboveConsole(login, consoleWin)
  assert.equal(login.state.visible, true)
  assert.equal(consoleWin.state.visible, true)
  assert.equal(login.state.focused, true)
  assert.equal(login.state.raised, 1)
  assert.equal(login.state.alwaysOnTopLevel, LEVEL_TOP)
  assert.equal(consoleWin.state.alwaysOnTopLevel, LEVEL_UNDER)
  assert.equal(getPreferredSurface(), 'login')
})

test('stackConsoleAboveLogin raises management above Console login/preview', () => {
  const login = fakeWin('login', { visible: true })
  const consoleWin = fakeWin('console')
  stackConsoleAboveLogin(login, consoleWin)
  assert.equal(consoleWin.state.focused, true)
  assert.equal(consoleWin.state.raised, 1)
  assert.equal(consoleWin.state.alwaysOnTopLevel, LEVEL_TOP)
  assert.equal(login.state.alwaysOnTopLevel, LEVEL_UNDER)
  assert.equal(getPreferredSurface(), 'console')
})

test('toggleConsoleLoginStack flips between surfaces using preferred state', () => {
  const login = fakeWin('login', { visible: true, focused: true })
  const consoleWin = fakeWin('console', { visible: true })
  stackLoginAboveConsole(login, consoleWin)
  assert.equal(toggleConsoleLoginStack(login, consoleWin), 'console')
  assert.equal(consoleWin.state.focused, true)
  assert.equal(getPreferredSurface(), 'console')
  assert.equal(toggleConsoleLoginStack(login, consoleWin), 'login')
  assert.equal(login.state.focused, true)
  assert.equal(getPreferredSurface(), 'login')
})

test('enforcePreferredStack restores Console login/preview after a focus race', () => {
  const login = fakeWin('login', { visible: true })
  const consoleWin = fakeWin('console', { visible: true, focused: true })
  stackLoginAboveConsole(login, consoleWin)
  consoleWin.focus()
  login.state.raised = 0
  consoleWin.state.raised = 0
  assert.equal(enforcePreferredStack(login, consoleWin), 'login')
  assert.equal(login.state.focused, true)
  assert.equal(login.state.raised >= 1, true)
})
