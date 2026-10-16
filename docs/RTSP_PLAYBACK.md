# RTSP playback in CLEVER-Player

CLEVER-Player does not decode RTSP itself. Video Wall and Console load the
CLEVER-Service preview UI, which embeds CLEVER-node’s MediaMTX WebRTC player
inside Electron `<webview>` slots.

```
RTSP camera / KVM-ENC
  → MediaMTX (direct RTSP pull; no FFmpeg by default)
  → WebRTC WHEP (:8889)
  → CLEVER-node http://<controller>:9100/mediamtx/?stream=camera{id}|screencast{id}
  → CLEVER-Player slot webview
```

## Compatibility notes

- VNC screencasts continue to use noVNC / ScreencastApp audio paths; unchanged.
- Mute toggles must not remount the webview URL (preview freezes `muted` in the
  initial query and applies mute via `webview.setAudioMuted`).
- Per-slot reconnect is handled inside the mediamtx player and
  `SlotCameraRTSP.vue`; a single slot failure must not remount the whole layout
  (`slot-sync.js` already avoids remount on mute-only updates).

## Operator checks

1. MediaMTX reachable on the controller LAN (`:8554` RTSP, `:8889` WebRTC, `:9997` API).
2. CLEVER-node listening on `:9100`.
3. After upgrading CLEVER-Service, run:
   - `php artisan cameras:syncmediamtx`
   - `php artisan screencast:syncmediamtx`

See CLEVER-Service `docs/rtsp-streaming.md` for ingest modes and codec policy.
