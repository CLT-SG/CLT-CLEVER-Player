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

### Runtime role changes

When CLEVER-Service bumps `config_revision` with `desiredConfig.deviceRole`:

1. Heartbeat (or `POST :9000/api/config_sync`) receives the pending config.
2. Player writes `CTRL_TYPE`, reloads windows via `CreateConfig.checkSerial` (no full Electron restart).
3. Console → Video Wall hides/clears the Console window so interactive UI cannot linger.
4. Player acknowledges with `configAppliedRevision` + `appliedRole` only after runtime reload succeeds.
5. Applied revision is persisted in `device-id.json` so reconnects do not re-apply stale revisions incorrectly.

## Source catalogs (Video Wall / Console)

Assignable source lists for the `/templates` drawer and Console/Video Wall previewers are owned by **CLEVER-Service** (`POST /api/sources/assignable`) with a shared server + Vue query cache and revision polling.

CLEVER-Player does **not** maintain a separate source-list cache. It loads Service preview URLs and applies incremental slot/config sync. Treat:

| Data | Freshness owner |
|------|-----------------|
| Source names / types / groups | CLEVER-Service catalog + revision |
| Slot layout / playlist contents | `config_revision` / slot sync pushes |
| Live RFB / stream health | Per-slot connect + probe (not catalog cache) |

Do not persist VNC tokens or session credentials in content `CACHE_*` settings — that cache is for media files only.

## Limitations

- Display resolution changes are reported but not applied by the player (OS-managed).
- Global OSD Audio & Output can manage OS master volume/mute when host tools allow; application mute remains separate. Per-slot mute is unchanged.
