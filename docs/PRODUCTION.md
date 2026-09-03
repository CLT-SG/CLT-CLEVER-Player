# Production build

There is no transpile step. `build` produces an unpacked app for local testing;
`package` produces the platform installer.

## Local packaging

```bash
npm run build         # unpacked directory (electron-builder --dir)
npm run package       # installer for the current OS

npm run package:win   # Windows NSIS x64
npm run package:linux # Linux .deb + AppImage x64
```

Legacy aliases `win64` and `ubuntu64` are equivalent to `package:win` and `package:linux`.

Output directory: `build/release/`.

## Supported platforms

| Platform | Target                      | Runner            |
| -------- | --------------------------- | ----------------- |
| Windows  | NSIS installer (`.exe`) x64 | Windows 10/11 x64 |
| Linux    | `.deb` + AppImage x64       | Ubuntu 22.04+ x64 |

macOS is not a supported build target.

Linux packaging requires `fakeroot` and `dpkg`:

```bash
sudo apt-get install -y fakeroot dpkg
```

## Deployment

1. Install the platform installer produced by [Release](./RELEASE.md) — do **not** run `npm run dev` on a production player.
2. On first launch the player creates `~/clever-console/config.ini`.
3. Edit `config.ini` (see [Configuration](./CONFIGURATION.md)) and restart the player.

Auto-update is disabled in development (`app.isPackaged === false`) and when
`AUTO_UPDATE=false` or `DEV_MODE=true` in `config.ini`.

## Shortcuts

| Shortcut     | Action                                                     |
| ------------ | ---------------------------------------------------------- |
| `Alt+Home`   | Configuration page                                         |
| `Alt+Insert` | DevTools (requires `ENABLE_DEVTOOLS=true` or `DEV_MODE=true`) |
| `Alt+F5`     | Clear cache and reload                                     |
| `Alt+PageUp` | Switch console / server window                             |
| `Alt+Delete` | Exit                                                       |
