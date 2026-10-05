# Optional WebRTC audio in CLEVER Player

VNC screen playback is unchanged. When a slot shows a registered ScreencastApp device, the noVNC page may include `audio=1`. Audio options then appear inside the noVNC **Settings** panel:

- System Audio (remote PC output → player speakers)
- Microphone (player mic → remote PC)
- Speaker / Output
- Two-way audio
- Mute (local playback)

All of those start **off** except Speaker. Enabling System Audio / Microphone / Two-way opens a WebRTC session to `wss://<device>:<wsPort>/audio`. That socket is not the VNC websockify path (`/screen0`, …).

A compact Settings button remains available in the corner of the Screencast-VNC view so Video Wall and Console operators can open Settings without relying on the sliding control bar handle. Opening or closing Settings does not disconnect VNC.

If audio fails or reconnects, the VNC picture stays up.

## Slot mute and fullscreen background mute

Slot mute/unmute uses a compact 🔇 / 🔊 icon on the **left** side of each Video Wall / Console slot. Mute only changes audio (Electron `setAudioMuted` plus guest HTML/noVNC mute) and must never remount Screencast-VNC or recreate CLEVER-node connections.

CLEVER-Service fans out soft `mute_update` payloads **synchronously** to each Video Wall player's `:9000/api/mute_update` (falls back to `/api/sync`) so audio changes apply immediately without waiting for the 10s poll cycle. Only the affected slot is updated.

Webcast slot toolbars default to the **bottom** of the slot. Drag using the dedicated move handle (≡); Back / Forward / Zoom stay clickable.

**Mute Background Slots During Full Screen** is managed in the CLEVER-Service preview UI that this player loads (Video Wall and Console).

When background muting is enabled:

1. Entering slot full screen mutes every other slot.
2. The focused slot keeps its current mute state.
3. Exiting full screen restores each slot’s previous mute state.

The preference is stored in the preview (`localStorage` key `muteBackgroundOnFullscreen`) and is available from the Console OSD menu, Video Wall control bar, and Template editor.

See also CLEVER-node `docs/VNC_INTEGRATION.md` and ScreencastApp `docs/AUDIO.md`.
