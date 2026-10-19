# RTSP playback in CLEVER-Player

CLEVER-Player does not decode RTSP itself. Video Wall and Console load the
CLEVER-Service preview UI, which embeds CLEVER-node’s MediaMTX WebRTC player
inside Electron `<webview>` slots.

```
RTSP camera / KVM-ENC
  → MediaMTX (direct pull, or on-demand remux for WebRTC-safe audio)
  → WebRTC WHEP (:8889)
  → CLEVER-node http://<controller>:9100/mediamtx/?stream=camera{id}|screencast{id}&hostname=<name>
  → CLEVER-Player slot webview
```

## Automatic recovery (no Alt+F5)

Per-slot recovery is owned by CLEVER-node’s MediaMTX WebRTC reader and
CLEVER-Service slot components — not by a full CLEVER-Player window reload.

| Signal | Action |
| --- | --- |
| WHEP/peer/track failure | Dispose session, exponential backoff, new WHEP session |
| Connected but no inbound video | Stall watchdog recreates the downstream session |
| Hung MediaMTX remux/source | CLEVER-Service force-replaces that path only |
| Webview load failure | Slot remounts that webview only |

`Alt+F5` (cache clear + `mainWin.reload()`) remains an operator escape hatch for
window-level faults. It must not be required for camera power-cycle recovery.

`src/main/recovery.js` continues to handle Chromium crash / unresponsive window
relaunch only — it does not implement RTSP health checks.

## Compatibility notes

- VNC screencasts continue to use noVNC / ScreencastApp audio paths; unchanged.
- Mute toggles must not remount the webview URL (preview freezes `muted` in the
  initial query and applies mute via `webview.setAudioMuted` + soft postMessage).
- Per-slot reconnect must not remount the whole layout (`slot-sync.js` already
  avoids remount on mute-only updates).
- `CLEVER_STREAM_INGEST_MODE=direct` and MediaMTX remain the ingest path; do not
  introduce a player-side transcoder.

## Operator checks

1. MediaMTX reachable on the controller LAN (`:8554` RTSP, `:8889` WebRTC, `:9997` API).
2. CLEVER-node listening on `:9100`.
3. After upgrading CLEVER-Service, run:
   - `php artisan cameras:syncmediamtx`
   - `php artisan screencast:syncmediamtx`
4. Optional recovery knobs (Service):
   - `CLEVER_STREAM_STALE_SOURCE_RECOVER_AFTER` (default 45)
   - `CLEVER_STREAM_STALE_SOURCE_RECOVER_COOLDOWN` (default 120)

See CLEVER-Service `docs/rtsp-streaming.md` for ingest modes, lifecycle, and
recovery RCA.
