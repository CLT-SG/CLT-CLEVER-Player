# Slot overlay display (Video Wall & Console)

CLEVER-Player hosts the CLEVER-Service preview UI. Overlay chrome is rendered
in that preview (and inside CLEVER-node for noVNC), not by a separate Player
renderer.

## Settings ownership

- **Video Wall** — template columns on CLEVER-Service (`show_content_name`,
  `show_mute_icon`, `show_screencast_settings`). Edited under `/templates`.
  Defaults: content name off; mute icon and Screencast settings on
  (backward compatible with always-visible chrome).
- **Console** — OSD “Others” toggles persisted as `consoleOverlaySettings` in
  the preview `localStorage`. Console changes never overwrite template rows.

## Soft updates

- Mute icon / content label: Vue `v-if` against the resolved prefs (no remount).
- noVNC Settings panel: initial `show_settings` query param; runtime toggles
  call `window.cleverSetShowSettings` via `webview.executeJavaScript`.
- MediaMTX / HTML5 video: slot URLs send `controls=false` so native playback
  controls do not stay visible after connect/reconnect.

## Related

- CLEVER-Service `resources/js/utils/slotOverlaySettings.js`
- CLEVER-node `novnc/app/ui.js` (`initShowSettingsFromQuery`)
- [AUDIO.md](AUDIO.md)
