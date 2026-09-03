# Configuration

All user-editable settings live in a single INI file:

```
~/clever-console/config.ini          # Linux
%USERPROFILE%\clever-console\config.ini   # Windows
```

The file uses ordinary INI sections and `KEY=VALUE` lines. Invalid values are logged, replaced with defaults, and startup continues.

A commented reference is provided in [`config.example.ini`](../config.example.ini).

## First launch

On first start the player writes a default `config.ini` if none exists.
Edit it in any text editor — no JavaScript knowledge is required — then restart the player.

## Migration from `config.js`

Older installs shipped a JavaScript config file. On startup the player converts it automatically:

```
config.js  →  config.ini
config.js  →  config.js.bak
```

Runtime fields consumed by CLEVER web (`hostserver`, `controller`, `tempid`, `ctrltype`, `serialkey`, and the `*port1` aliases) are still provided by the runtime.

| Old (`config.js`)             | New (`config.ini`) |
| ----------------------------- | ------------------ |
| `var hostserver = '...'`      | `HOST=...`         |
| `var tempid = 1`              | `TEMPLATE_ID=1`    |
| `var ctrltype = 'console'`    | `CTRL_TYPE=console`|

## Sections

### `[PLAYER]`

| Key           | Default   | Notes |
| ------------- | --------- | ----- |
| `SERIAL_KEY`  | *empty*   | Must match SHA-256 of this machine's MAC. |
| `TEMPLATE_ID` | `1`       | Numeric template id. |
| `CTRL_TYPE`   | `console` | `console` or `videowall`. |

### `[SERVER]`

| Key                  | Default     |
| -------------------- | ----------- |
| `HOST`               | `127.0.0.1` |
| `CONTROLLER_PORT`    | `80`        |
| `WEB_PORT`           | `9100`      |
| `HEARTBEAT_INTERVAL` | `30`        |
| `SYNC_INTERVAL`      | `60`        |

### `[DISPLAY]`

| Key             | Default | Effect |
| --------------- | ------- | ------ |
| `ALWAYS_ON_TOP` | `true`  | Keep the player above other windows and the taskbar. Does not affect size. |
| `FULLSCREEN`    | `false` | Electron fullscreen. Off by default so migrated installs keep work-area bounds. |
| `KIOSK_MODE`    | `false` | Electron kiosk (full display, over the taskbar). Can extend past the right edge on scaled displays. |

By default the player sizes itself to the primary display **work area** (DIP pixels, `x=0,y=0`), which stays inside the visible desktop at 125% / 150% / 175% Windows scaling. Leave `FULLSCREEN` and `KIOSK_MODE` off unless you need Electron's full-display modes.

### `[LOGGING]`

| Key                  | Default | Notes |
| -------------------- | ------- | ----- |
| `LOG_LEVEL`          | `INFO`  | `DEBUG`, `INFO`, `WARN`, `ERROR`. |
| `LOG_RETENTION_DAYS` | `30`    | Days to keep archived `*.old.log`. |
| `MAX_LOG_SIZE_MB`    | `100`   | Rotation size. |

### `[UPDATER]`

| Key                    | Default  | Notes |
| ---------------------- | -------- | ----- |
| `AUTO_UPDATE`          | `true`   | Set `false` to disable. |
| `UPDATE_CHANNEL`       | `latest` | `latest`, `beta`, `alpha`. |
| `CHECK_INTERVAL_HOURS` | `6`      | |

### `[ADVANCED]`

| Key               | Default | Notes |
| ----------------- | ------- | ----- |
| `DEV_MODE`        | `false` | Skips auto-update when `true`. |
| `DEBUG_MODE`      | `false` | Verbose logging. |
| `ENABLE_DEVTOOLS` | `false` | Enables the `Alt+Insert` DevTools shortcut. |

## Examples

### Development

```ini
[PLAYER]
SERIAL_KEY=
TEMPLATE_ID=1
CTRL_TYPE=console

[SERVER]
HOST=127.0.0.1
CONTROLLER_PORT=80
WEB_PORT=9100

[UPDATER]
AUTO_UPDATE=false

[ADVANCED]
DEV_MODE=true
DEBUG_MODE=true
ENABLE_DEVTOOLS=true
```

### Production

```ini
[PLAYER]
SERIAL_KEY=
TEMPLATE_ID=1
CTRL_TYPE=videowall

[SERVER]
HOST=server.domain.com
CONTROLLER_PORT=80
HEARTBEAT_INTERVAL=30
SYNC_INTERVAL=60

[DISPLAY]
ALWAYS_ON_TOP=true
FULLSCREEN=false
KIOSK_MODE=false

[LOGGING]
LOG_LEVEL=INFO
LOG_RETENTION_DAYS=30
MAX_LOG_SIZE_MB=100

[UPDATER]
AUTO_UPDATE=true
UPDATE_CHANNEL=latest
CHECK_INTERVAL_HOURS=6

[ADVANCED]
DEV_MODE=false
DEBUG_MODE=false
ENABLE_DEVTOOLS=false
```

### Multi-player deployment

Give each machine its own template and serial. Host and ports can stay the same:

```ini
[PLAYER]
TEMPLATE_ID=12
CTRL_TYPE=videowall

[SERVER]
HOST=10.0.0.10
```

Copy `config.example.ini` to each player, change `TEMPLATE_ID` and `SERIAL_KEY`, then start the app.
