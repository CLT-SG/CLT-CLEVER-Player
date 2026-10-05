# Optional WebRTC audio in CLEVER Player

VNC screen playback is unchanged. When a slot shows a registered ScreencastApp device, the noVNC page may include `audio=1`. An overlay then lets the operator enable:

- System Audio (remote PC output → player speakers)
- Microphone (player mic → remote PC)
- Speaker / Output
- Two-way audio

All of those start **off**. Enabling them opens a WebRTC session to `wss://<device>:<wsPort>/audio`. That socket is not the VNC websockify path (`/screen0`, …).

If audio fails or reconnects, the VNC picture stays up.

## Slot mute and fullscreen background mute

Slot mute/unmute buttons and **Mute Background Slots During Full Screen** are managed in the CLEVER-Service preview UI that this player loads (Video Wall and Console). The player hosts those pages and applies mute through Electron `<webview>.setAudioMuted(...)`.

When background muting is enabled:

1. Entering slot full screen mutes every other slot.
2. The focused slot keeps its current mute state.
3. Exiting full screen restores each slot’s previous mute state.

The preference is stored in the preview (`localStorage` key `muteBackgroundOnFullscreen`) and is available from the Console OSD menu, Video Wall control bar, and Template editor.

See also CLEVER-node `docs/VNC_INTEGRATION.md` and ScreencastApp `docs/AUDIO.md`.
