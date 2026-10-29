# Optional WebRTC audio in CLEVER Player

## Global Audio & Output (OSD)

CLEVER-Player exposes a **global** Audio & Output panel (Console OSD **Audio** tab; Video Wall control-bar **Output**):

- **System master volume / mute** via host OS tools (PulseAudio/`pactl` or WirePlumber/`wpctl` on Linux, AppleScript on macOS, CoreAudio via PowerShell on Windows).
- **Output device** list/refresh when the host supports it (Linux default sink; macOS with SwitchAudioSource). Windows lists devices but does not switch without extra host tools.
- **Application mute / soft volume** for this player’s webContents only — separate from OS master volume.

These controls are never per-slot and do not change template assignments, mute icons, or Screencast WebRTC stream settings. Outside Electron (plain browser), the panel reports that system audio is unavailable.

## Screencast WebRTC (remote stream)

VNC screen playback is unchanged. When a slot shows a registered ScreencastApp device, the noVNC page may include `audio=1`. Audio options then appear inside the noVNC **Settings** panel:

- System Audio (remote PC output → player speakers)
- Microphone (player mic → remote PC)
- Speaker / Output
- Two-way audio
- Mute (local playback)

Speaker starts **on**. System Audio / Microphone / Two-way start **off** unless the Screencast VNC source has **Audio Stream** enabled in CLEVER-Service (`has_audio`), which adds `audio_system=1` to the noVNC URL and auto-subscribes System Audio. Enabling System Audio / Microphone / Two-way opens a WebRTC session to `wss://<device>:<wsPort>/audio`. That socket is not the VNC websockify path (`/screen0`, …).

A compact Settings button remains available in the corner of the Screencast-VNC view so Video Wall and Console operators can open Settings without relying on the sliding control bar handle. Opening or closing Settings does not disconnect VNC.

If audio fails or reconnects, the VNC picture stays up.

## Slot mute and fullscreen background mute

Slot mute/unmute uses a compact 🔇 / 🔊 icon on the **top-right** of each Video Wall / Console slot when the overlay is enabled. Mute only changes audio (Electron `setAudioMuted` plus guest HTML/noVNC mute) and must never remount Screencast-VNC or recreate CLEVER-node connections.

## Slot overlay display settings

Visibility of the content/playlist name label, mute icon, and noVNC left side control panel is configurable:

| Mode | Ownership | Persistence |
|------|-----------|-------------|
| Video Wall | CLEVER-Service template fields `show_content_name`, `show_mute_icon`, `show_screencast_settings` | Slot Overlay button beside Mute BG Full; soft `overlay_update` to players |
| Console | Preview OSD prefs in `localStorage` key `consoleOverlaySettings` | Device-local; **does not** write Video Wall template settings |

Hiding the mute icon or noVNC side panel does not change mute state or the VNC/MediaMTX connection. The left control bar / settings arrow is toggled with `show_settings` / `cleverSetShowSettings` inside CLEVER-node without remounting the webview (slot embeds have no floating gear FAB).

CLEVER-Service fans out soft `mute_update` payloads **synchronously** to each Video Wall player's `:9000/api/mute_update` (falls back to `/api/sync`) so audio changes apply immediately without waiting for the 10s poll cycle. Only the affected slot is updated.

Webcast slot toolbars default to the **bottom** of the slot. Drag using the dedicated move handle (≡); Back / Forward / Zoom stay clickable.

**Mute Background Slots During Full Screen** is managed in the CLEVER-Service preview UI that this player loads (Video Wall and Console).

When background muting is enabled:

1. Entering slot full screen mutes every other slot.
2. The focused slot keeps its current mute state.
3. Exiting full screen restores each slot’s previous mute state.

The preference is stored in the preview (`localStorage` key `muteBackgroundOnFullscreen`) and is available from the Console OSD menu, Video Wall control bar, and Template editor.

See also CLEVER-node `docs/VNC_INTEGRATION.md` and ScreencastApp `docs/AUDIO.md`.
