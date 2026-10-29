# Slot editing and Console OSD ownership

CLEVER-Player hosts the Electron shell for Console and Video Wall. Interactive slot layout editing and the Console operator OSD are implemented in **CLEVER-Service** preview pages loaded by this player.

## Player responsibilities

- Open the correct preview URL for `CTRL_TYPE` (`console` | `videowall`).
- Preserve exact Video Wall window bounds from the template resolution.
- Forward device registration/heartbeat; do not fork Assign Source or Screencast registries.

## Out of scope for Player

- Drag/resize handle chrome, OSD tabs, Assign Source UI, and the content interaction shield remain Service-owned Vue.
- Screencast connection state continues to come from Service content/screencast payloads and CLEVER-node / ScreencastApp sessions.
- Layout-editing pointer locks must not require Player IPC or Screencast disconnects.
