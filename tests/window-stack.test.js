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
    blurred: 0,
    alwaysOnTopLevel: null,
    alwaysOnTopClears: 0,
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
    blur() {
      state.focused = false
      state.blurred += 1
    },
    setAlwaysOnTop(flag, level) {
      if (!flag) {
        state.alwaysOnTopLevel = null
        state.alwaysOnTopClears += 1
        return
      }
      state.alwaysOnTopLevel = level || 'normal'
    },
  }
}

test('hideConsoleChrome hides the management window', () => {
  const server = fakeWin('server', { visible: true })
  hideConsoleChrome(server)
  assert.equal(server.state.visible, false)
})

test('default preferred surface is Console login/preview (player)', () => {
  assert.equal(getPreferredSurface(), 'player')
})

test('stackLoginAboveConsole raises Console login/preview above management', () => {
  const login = fakeWin('login')
  const management = fakeWin('management', { visible: true, focused: true })
  stackLoginAboveConsole(login, management)
  assert.equal(login.state.visible, true)
  assert.equal(management.state.visible, true)
  assert.equal(login.state.focused, true)
  assert.equal(login.state.raised, 1)
  assert.equal(management.state.blurred >= 1, true)
  assert.equal(login.state.alwaysOnTopLevel, LEVEL_TOP)
  assert.equal(management.state.alwaysOnTopLevel, LEVEL_UNDER)
  assert.equal(getPreferredSurface(), 'player')
})

test('stackConsoleAboveLogin raises management above Console login/preview', () => {
  const login = fakeWin('login', { visible: true })
  const management = fakeWin('management')
  stackConsoleAboveLogin(login, management)
  assert.equal(management.state.focused, true)
  assert.equal(management.state.raised, 1)
  assert.equal(management.state.alwaysOnTopLevel, LEVEL_TOP)
  assert.equal(login.state.alwaysOnTopLevel, LEVEL_UNDER)
  assert.equal(getPreferredSurface(), 'management')
})

test('toggleConsoleLoginStack flips between player and management', () => {
  const login = fakeWin('login', { visible: true, focused: true })
  const management = fakeWin('management', { visible: true })
  stackLoginAboveConsole(login, management)
  assert.equal(toggleConsoleLoginStack(login, management), 'management')
  assert.equal(management.state.focused, true)
  assert.equal(getPreferredSurface(), 'management')
  assert.equal(toggleConsoleLoginStack(login, management), 'player')
  assert.equal(login.state.focused, true)
  assert.equal(getPreferredSurface(), 'player')
})

test('enforcePreferredStack restores Console login/preview after a focus race', () => {
  const login = fakeWin('login', { visible: true })
  const management = fakeWin('management', { visible: true, focused: true })
  stackLoginAboveConsole(login, management)
  management.focus()
  login.state.raised = 0
  management.state.raised = 0
  assert.equal(enforcePreferredStack(login, management), 'player')
  assert.equal(login.state.focused, true)
  assert.equal(login.state.raised >= 1, true)
})

test('schedulePreferredStackEnforcement reasserts player on top after delays', async () => {
  const { schedulePreferredStackEnforcement } = require('../src/main/window-stack')
  const login = fakeWin('login', { visible: true })
  const management = fakeWin('management', { visible: true, focused: true })
  stackLoginAboveConsole(login, management)
  management.focus()
  login.state.raised = 0
  schedulePreferredStackEnforcement(login, management, [0, 5])
  await new Promise((resolve) => setTimeout(resolve, 20))
  assert.equal(getPreferredSurface(), 'player')
  assert.equal(login.state.focused, true)
  assert.equal(login.state.raised >= 1, true)
})
