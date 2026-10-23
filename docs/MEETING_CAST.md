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

### Google Meet / Teams / Zoom / Webex on Electron

These providers often work in Google Chrome but **fail inside Electron `<webview>` guests** (unsupported client after Ask to join). CLEVER-Player therefore opens them in a dedicated top-level `BrowserWindow` positioned over the slot:

- IPC: `meeting-open-window` / `meeting-close-window` / `meeting-update-bounds`
- No CLEVER preload in that window (closer to Chrome)
- Chrome-like user agent without an `Electron/` token
- Guest name fill + Ask to join assist after load

Jitsi remains in the slot `<webview>` because embed is supported.

Google Meet guest joins still need host **Admit**. CLEVER cannot bypass Meet admission or org policy.

## Provider limits

Teams, Zoom, Google Meet, and Webex generally cannot be controlled as embedded iframes. The player shows the provider’s browser join experience and reports load / failure / waiting-host state. Jitsi may embed more deeply when the room URL allows it.
