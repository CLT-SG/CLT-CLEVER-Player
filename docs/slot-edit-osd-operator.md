# Slot editing and Console OSD ownership

CLEVER-Player hosts the Electron shell for Console and Video Wall. Interactive slot layout editing and the Console operator OSD are implemented in **CLEVER-Service** preview pages loaded by this player.

## Player responsibilities

- Open the correct preview URL for `CTRL_TYPE` (`console` | `videowall`).
- Preserve exact Video Wall window bounds from the template resolution.
- Forward device registration/heartbeat; do not fork Assign Source or Screencast registries.

## Console OSD shortcut

- **Alt+O** is registered by CLEVER-Player and sends `app-toggleOsd` to the preview window.
- This works while a Screencast/VNC `<webview>` has focus (unlike page-level key handlers alone).
- Hover-to-show OSD was removed in CLEVER-Service so remote control is not interrupted.

## Push to Video Wall (Console)

CLEVER-Service owns the two Console workflows; the player only hosts the destination Video Wall window:

| Workflow | Service UI | Player role |
|----------|------------|-------------|
| **Push Selected Content** | Slot toolbox → assigns a source onto a wall cell via Service APIs | Receives incremental slot sync as today |
| **Push Current Layout** | OSD Push tab → full Console template | `POST /api/pushFromConsole` stores the layout payload and reloads preview; rejects when `source_resolution` does not match this wall's template resolution |

Do not fold selected-content assignment into `pushFromConsole`.

## Out of scope for Player

- Drag/resize handle chrome, OSD tabs, Assign Source UI, and the content interaction shield remain Service-owned Vue.
- Screencast connection state continues to come from Service content/screencast payloads and CLEVER-node / ScreencastApp sessions.
- Layout-editing pointer locks must not require Player IPC or Screencast disconnects.
