# Troubleshooting

## Common issues

| Problem                                | What to check                                                                                                             |
| -------------------------------------- | ------------------------------------------------------------------------------------------------------------------------- |
| White screen / offline page            | LAN cable, CLEVER server power, `HOST` in `~/clever-console/config.ini`                                                   |
| Activation page                        | `SERIAL_KEY` must match SHA-256 of this machine's MAC address                                                              |
| Update never appears                   | App must be installed from a GitHub Release, not `npm run dev`. Check `~/clever-console/logs/updater.log`                  |
| `latest.yml` missing on Release        | Release workflow failed, or Linux assets were published without the Windows job                                            |
| Tag rejected by workflow               | `vX.Y.Z` must equal `package.json` `"version": "X.Y.Z"`                                                                    |
| Port already in use                    | Local control API did not bind; see `~/clever-console/logs/application.log`                                                |
| Window hangs off the right edge        | Leave `KIOSK_MODE=false` and `FULLSCREEN=false`. The player uses the work area, not the full display. Restart after edits. |

## Logs

Logs live in `~/clever-console/logs/`
(Windows: `%USERPROFILE%\clever-console\logs\`):

```
logs/
├── application.log
├── error.log
├── updater.log
└── player.log
```

Each file rotates at `MAX_LOG_SIZE_MB` from `config.ini` (default 100 MB).
Archived `*.old.log` files are deleted after `LOG_RETENTION_DAYS`
(default 30).

Logged events include application lifecycle, Electron/OS versions,
update states, player start/stop, content load/fail, playlist changes,
and device connection status. Passwords, tokens, serial keys, and
private keys are redacted.

## Auto-update states

User-visible states in the update overlay:

- Checking for updates…
- Update available
- Downloading update…
- Download progress: 45%
- Update downloaded / Restart to update
- Already up to date
- Update failed

Failures never crash the player. The updater retries with exponential
backoff (30s → 1h). After a successful download the app auto-restarts
after 30 seconds; the user can restart immediately from the overlay.
