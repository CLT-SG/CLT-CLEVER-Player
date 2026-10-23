# Slot overlay display (Video Wall & Console)

CLEVER-Player hosts the CLEVER-Service preview UI. Overlay chrome is rendered
in that preview (and inside CLEVER-node for noVNC), not by a separate Player
renderer.

## Settings ownership

- **Video Wall** — template columns on CLEVER-Service (`show_content_name`,
  `show_mute_icon`, `show_screencast_settings`). Edited under `/templates` via
  the **Slot Overlay** button beside Mute BG Full. Defaults: content name off;
  mute icon and noVNC side panel on (backward compatible).
- **Console** — OSD “Others” toggles persisted as `consoleOverlaySettings` in
  the preview `localStorage`. Console changes never overwrite template rows.

## Soft updates

- Mute icon / content label: Vue `v-if` against the resolved prefs (no remount).
- Template overlay changes push `overlay_update` to players immediately
  (`:9000/api/overlay_update`, falls back to `/api/sync`). Polls also carry
  overlay fields on every slot-sync response.
- noVNC **left control bar / settings arrow**: initial `show_settings` query
  param; runtime toggles call `window.cleverSetShowSettings` via
  `webview.executeJavaScript`. Slot embeds do not show a floating gear FAB;
  settings open from the left control bar.
- MediaMTX / HTML5 video: slot URLs send `controls=false` so native playback
  controls do not stay visible after connect/reconnect.

## Related

- CLEVER-Service `resources/js/utils/slotOverlaySettings.js`
- CLEVER-node `novnc/app/ui.js` (`initShowSettingsFromQuery`)
- [AUDIO.md](AUDIO.md)
