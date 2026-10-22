# CLEVER-Player device registration

## Identity

- Stable `deviceId` in `~/clever-console/device-id.json` (UUID).
- Survives DHCP / IP changes; duplicates are prevented by `device_id` uniqueness on CLEVER-Service.

## Flow

1. On startup the player **announces** to `POST /api/player/announce`.
2. Admin opens **Video Wall & Console** → **Scan Players** and registers the device as Video Wall or Console.
3. Player **claims** the one-time `deviceToken` via `POST /api/player/claim` (15-minute window).
4. **Heartbeat** (`SERVER.HEARTBEAT_INTERVAL`, default 30s) reports capabilities/monitors and applies desired config revisions.

## Local discovery endpoints

| Path | Purpose |
|------|---------|
| `GET :9000/api/health` | Reachability + `deviceId` |
| `GET :9000/api/deviceinfo` | Full device payload for admin scan |

## Roles

Server assigns `CTRL_TYPE` (`videowall` | `console`). The player never self-promotes.

## Limitations

- Display resolution changes are reported but not applied by the player (OS-managed).
- Application mute/volume only; OS master volume is not controlled.
