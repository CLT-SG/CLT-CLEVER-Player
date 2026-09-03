# CLEVER Player

Electron player for CLEVER Console and Video Wall.

Version **4.2.0** stores all player settings in a single `config.ini` file, migrates existing `config.js` installs automatically, and removes unused Flash/offline assets. It also includes the Electron 44 runtime and GitHub Releases auto-update from 4.1.0.

## Requirements

- **Node.js 20.18+** (Node 22 is recommended; see `.nvmrc`)
- npm 10+
- For packaging:
  - Windows: Windows 10/11 x64
  - Linux: Ubuntu 22.04+ x64, with `fakeroot` and `dpkg`
  - macOS: macOS 13 Ventura or later (Electron 44 requirement)

Runtime (packaged app) uses the Node.js version bundled with Electron 44 (Node 24).

## Install

```bash
npm install
```

Do not install Electron globally. The project pins Electron as a local `devDependency`.

## Development

```bash
npm install
npm run dev
```

`npm start` is an alias of `npm run dev`.

The first launch creates `~/clever-console/config.ini` if it does not exist. Edit that file with a text editor — no JavaScript knowledge is required.

### First-time setup

```text
1. Install CLEVER Player
2. Edit ~/clever-console/config.ini
3. Save the file
4. Start (or restart) the player
```

If an older install still has `config.js`, the player converts it on startup:

```text
Application Start
       ↓
config.ini exists?
       ↓
No
       ↓
Read existing config.js
       ↓
Generate config.ini
       ↓
Rename config.js → config.js.bak
       ↓
Continue startup
```

Shortcuts:

| Shortcut | Action |
| --- | --- |
| Alt+Home | Configuration page |
| Alt+Insert | Developer tools (when `ENABLE_DEVTOOLS=true` or `DEV_MODE=true`) |
| Alt+F5 | Clear cache and reload |
| Alt+PageUp | Switch console / server window |
| Alt+Delete | Exit |

Auto-update is **disabled in development** (`app.isPackaged === false`). Packaged builds also skip updates when `AUTO_UPDATE=false` or `DEV_MODE=true`.

## Configuration

All user-editable settings live in:

```text
~/clever-console/config.ini
```

Windows: `%USERPROFILE%\clever-console\config.ini`

The file uses ordinary INI sections and `KEY=VALUE` lines. Invalid values are logged, replaced with defaults, and startup continues.

A commented production template is in `config.example.ini`.

### Migration from config.js

| Old | New |
| --- | --- |
| `~/clever-console/config.js` | `~/clever-console/config.ini` |
| JavaScript `var hostserver = '...'` | `HOST=...` / `SERVER_URL=...` |
| Manual edits in JS | Text editor, no code |

Existing installs do not need a manual conversion. After migration you will see:

```text
config.ini
config.js.bak
```

Runtime fields used by CLEVER web (`hostserver`, `controller`, `tempid`, `ctrltype`, `serialkey`, and the `*port1` aliases) are still provided automatically.

### Development example

```ini
[PLAYER]
PLAYER_NAME=Dev-Player
SERIAL_KEY=
TEMPLATE_ID=1
CTRL_TYPE=console

[SERVER]
HOST=127.0.0.1
CONTROLLER_PORT=80
WEB_PORT=9100

[DISPLAY]
FULLSCREEN=false
KIOSK_MODE=false

[UPDATER]
AUTO_UPDATE=false

[ADVANCED]
DEV_MODE=true
DEBUG_MODE=true
ENABLE_DEVTOOLS=true
```

### Production example

```ini
[PLAYER]
PLAYER_NAME=Player-01
SERIAL_KEY=
TEMPLATE_ID=1
CTRL_TYPE=videowall

[SERVER]
SERVER_URL=https://server.domain.com
HOST=server.domain.com
CONTROLLER_PORT=80
HEARTBEAT_INTERVAL=30
SYNC_INTERVAL=60

[DISPLAY]
FULLSCREEN=true
KIOSK_MODE=true

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

Give each machine its own name, template, and serial. Host/ports can stay the same:

```ini
[PLAYER]
PLAYER_NAME=Floor-A-Left
PLAYER_GROUP=building-1
PLAYER_TAGS=floor-a,left
TEMPLATE_ID=12
CTRL_TYPE=videowall

[SERVER]
HOST=10.0.0.10
```

Copy `config.example.ini` to each player, change `PLAYER_NAME`, `TEMPLATE_ID`, and `SERIAL_KEY`, then start the app.

## Production build

There is no transpile step. `build` produces an unpacked app for local testing; `package` produces the installer.

```bash
npm run build      # unpacked directory (electron-builder --dir)
npm run package    # installer for the current OS
```

Platform-specific packaging:

```bash
npm run package:win      # Windows NSIS x64
npm run package:linux    # Linux deb + AppImage x64
npm run package:mac      # macOS dmg + zip
```

Legacy script names `win64` and `ubuntu64` still work. x64 is the supported release target.

Output directory: `build/release/`.

## Versioning

Keep these values identical:

```text
package.json version
        ↓
Electron application version
        ↓
Installer version
        ↓
GitHub Release / git tag (vMAJOR.MINOR.PATCH)
        ↓
electron-updater latest.yml version
```

Use semantic versioning `MAJOR.MINOR.PATCH`:

- `4.2.0` — configuration / player features
- `4.2.1` — fixes
- `5.0.0` — breaking player behavior

Optional channels use a prerelease suffix. Those publish `beta.yml` / `alpha.yml` instead of `latest.yml`:

- `4.2.0-beta.1`
- `4.2.0-alpha.1`

Tag names must match `package.json`: tag `v4.1.0` for version `4.1.0`.

## Release process

```text
1. Update version in package.json
2. Commit changes
3. Create version tag (vMAJOR.MINOR.PATCH)
4. Push tag
5. GitHub Actions builds the installer
6. GitHub Release is created
7. Installer and update metadata are published
8. Existing CLEVER Player installations receive the update
```

Commands:

```bash
# after package.json version is 4.1.1
git add package.json package-lock.json
git commit -m "Release 4.1.1"
git tag v4.1.1
git push origin main
git push origin v4.1.1
```

## GitHub Actions

| Workflow | Trigger | What it does |
| --- | --- | --- |
| `.github/workflows/ci.yml` | Push / pull request | `npm ci`, lint, test, Linux unpacked build |
| `.github/workflows/release.yml` | Tag `v*` | Validates version, lints, tests, packages, publishes GitHub Release |

The release job is a matrix:

- Windows (`windows-latest`) → `Clever-Player Setup x.x.x.exe` + `latest.yml` + `.blockmap`
- Linux (`ubuntu-latest`) → `.deb`, `.AppImage`, `latest-linux.yml`
- macOS (`macos-latest`) → `.dmg`, `.zip`, `latest-mac.yml`

If any step fails, the workflow fails. Installers are also uploaded as Actions artifacts for 14 days.

## Auto-update

Packaged builds use `electron-updater` with the GitHub provider (`CLT-SG/CLT-CLEVER-Player`).

```text
Application Starts
       ↓
Check for Update
       ↓
New Version Available?
       ↓
Download Update
       ↓
Notify User
       ↓
Install Update
       ↓
Restart Application
```

User-visible states:

- Checking for updates...
- Update available
- Downloading update...
- Download progress: 45%
- Update downloaded / Restart to update
- Already up to date
- Update failed

Failures never crash the player. The updater retries with exponential backoff (30s → 1h). After a successful download, the app auto-restarts after 30 seconds; the user can restart immediately from the overlay.

Updates are only checked when the app is packaged. Development mode logs `Updates are disabled in development`.

`CLT-CLEVER-Player` is a private GitHub repository. Unauthenticated `releases.atom` requests return 404, so installed players need one of:

1. A public repository (or a public releases-only repo) in `build.publish`, **or**
2. A read-only GitHub token available to the installed app as `GH_TOKEN` / `GITHUB_TOKEN` (contents: read). Do not bake a token into the installer.

Until a release tag is published, `Update failed` is expected and is handled without crashing.

## GitHub Secrets

The default `GITHUB_TOKEN` is enough to create releases (`contents: write`).

Optional code signing secrets — if they are missing, unsigned installers are still published:

| Secret | Purpose |
| --- | --- |
| `CSC_LINK` | Base64-encoded Windows/macOS code-signing certificate (or file URL) |
| `CSC_KEY_PASSWORD` | Certificate password |
| `APPLE_ID` | Apple ID for notarization |
| `APPLE_APP_SPECIFIC_PASSWORD` | Apple app-specific password |
| `APPLE_TEAM_ID` | Apple Team ID |

Set `GH_TOKEN` only if you replace `GITHUB_TOKEN` with a PAT. `electron-builder` reads `GH_TOKEN`; the workflow maps `GITHUB_TOKEN` to that name.

## Code signing

Unsigned Windows NSIS installers work for auto-update (`verifyUpdateCodeSignature` is false until a certificate is configured). For production:

1. Add `CSC_LINK` and `CSC_KEY_PASSWORD` to the repository secrets.
2. Re-run a version tag workflow.
3. SmartScreen warnings go away after the signed binary builds reputation.

macOS notarization uses the Apple secrets above. Electron 44 requires macOS 13+.

## Logging

Logs live in `~/clever-console/logs/` (Windows: `%USERPROFILE%\clever-console\logs\`).

```text
logs/
├── application.log
├── error.log
├── updater.log
└── player.log
```

Each file rotates at the size set by `MAX_LOG_SIZE_MB` in `config.ini` (default 100 MB). Archived `*.old.log` files are deleted after `LOG_RETENTION_DAYS` (default 30).

Logged events include application lifecycle, Electron/OS versions, update states, player start/stop, content load/fail, playlist changes, and device connection status. Passwords, tokens, serial keys, and private keys are redacted.

## Troubleshooting

| Problem | What to check |
| --- | --- |
| White screen / offline page | LAN cable, CLEVER server power, `HOST` / `SERVER_URL` in `~/clever-console/config.ini` |
| Activation page | Serial key must match SHA-256 of this machine's MAC address |
| Update never appears | App must be installed from a GitHub Release, not `npm run dev`. Check `updater.log` |
| `latest.yml` missing | Release workflow failed, or Linux/mac assets were published without the Windows job |
| Tag rejected | `v1.2.3` must equal `package.json` `"version": "1.2.3"` |
| Port 9000 in use | Local control API did not bind; see `application.log` |
| DevTools | Alt+Insert |

## Security notes

The upgrade enables `contextIsolation` and disables `nodeIntegration` in the player window. A preload bridge still exposes the `window.ipcRenderer` / `window.remote.getCurrentWindow().setBounds()` APIs that CLEVER web uses.

Pepper Flash has been removed (unsupported in modern Chromium). Certificate errors are accepted only for private/local HTTPS hosts. Webview guests cannot enable Node integration. Guest webviews still allow mixed content so third-party WebCast URLs (for example Google Slides) can load.

## Scripts

| Script | Description |
| --- | --- |
| `npm run dev` | Development Electron process |
| `npm test` | Node test runner |
| `npm run lint` | ESLint |
| `npm run build` | Unpacked production app |
| `npm run package` | Current-platform installer |
| `npm run release` | Package and publish (CI) |

Removed in 4.2.0: Pepper Flash DLLs, unused `offline2` / fullPage.js assets, dummy `cert/` extraResources, `xml-js`, `src/hostping.js`, and 32-bit package scripts.
