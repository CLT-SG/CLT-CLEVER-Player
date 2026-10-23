# Meeting Cast (CLEVER-Player)

Meeting Cast is rendered by CLEVER-Service’s preview Vue app (`SlotMeetingCast.vue`) inside the player’s existing Electron `<webview>` guests. CLEVER-Player does not introduce a separate source factory.

## Behaviour

- Configuration arrives through the normal template / content sync path (`getContent` includes `meeting_player`)
- Soft mute uses the shared slot mute path (`meeting-{slotId}` webview id + `setAudioMuted`)
- Source switches destroy the Vue slot component, which tears down the meeting webview and mutes audio
- Ending a CLEVER display session is an API call to CLEVER-Service; it does not terminate the remote meeting for other participants

## Compatibility

- Keep the current Electron runtime for this player build
- Do not treat Meeting Cast as a reason to change ScreencastApp’s Electron 22.3.25 pin
- Guest navigation remains subject to `src/main/security.js` http/https allow rules

## Auto-join

Video Wall Meeting Cast loads the provider join URL automatically when the slot becomes active. Do not require an on-screen Open / Join click for live display.

### Electron meeting window (not Webcast)

Meeting Cast on CLEVER-Player uses a dedicated top-level `BrowserWindow` positioned over the Video Wall / Console slot. It is **not** the Webcast `<webview>` path.

- IPC: `meeting-open-window` / `meeting-close-window` / `meeting-update-bounds`
- Applies to Teams, Zoom, Google Meet, Webex, and Jitsi when the player API is present
- No CLEVER preload in that window (closer to Chrome)
- Stock Google Chrome user-agent + `Sec-CH-UA` client hints (never Electron’s default UA)
- Session / `webContents` / request headers all forced to that Chrome identity
- Join assist from Service `meeting_player.join`:
  - Guest → fill configured guest display name + Ask to join
  - Signed-in → autofill platform login identifier/password (best-effort; MFA/SSO may still need a person)
- Session partition is per platform + identity mode so guest and signed-in cookies stay separate
- On slot teardown or CLEVER-Player quit, meeting windows **Leave / Hang up** (best-effort) before destroy, then navigate to `about:blank`. This avoids leaving a ghost participant on the host roster. Never clicks “End meeting for all”.

Embedded `<webview>` is only a Service browser-preview fallback when the player API is unavailable.

Google Meet guest joins still need host **Admit**. CLEVER cannot bypass Meet admission or org policy.

## Provider limits

Teams, Zoom, Google Meet, and Webex generally cannot be controlled as embedded iframes. The player shows the provider’s browser join experience and reports load / failure / waiting-host state. Jitsi may embed more deeply when the room URL allows it.
