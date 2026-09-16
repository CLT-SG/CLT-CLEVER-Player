# Optional WebRTC audio in CLEVER Player

VNC screen playback is unchanged. When a slot shows a registered ScreencastApp device, the noVNC page may include `audio=1`. An overlay then lets the operator enable:

- System Audio (remote PC output → player speakers)
- Microphone (player mic → remote PC)
- Speaker / Output
- Two-way audio

All of those start **off**. Enabling them opens a WebRTC session to `wss://<device>:<wsPort>/audio`. That socket is not the VNC websockify path (`/screen0`, …).

If audio fails or reconnects, the VNC picture stays up.

See also CLEVER-node `docs/VNC_INTEGRATION.md` and ScreencastApp `docs/AUDIO.md`.
