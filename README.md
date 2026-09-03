# CLEVER Player

Electron-based player for CLEVER Console and Video Wall.

- Windows (NSIS x64) and Linux (`.deb` + AppImage x64) builds
- Single `config.ini` for all settings, with automatic migration from legacy `config.js`
- Auto-update via GitHub Releases (`electron-updater`)
- Electron 44 runtime

## Requirements

- **Node.js 20.18+** (Node 22 recommended — see [`.nvmrc`](./.nvmrc))
- **npm 10+**
- Platform requirements for packaging: see [docs/PRODUCTION.md](./docs/PRODUCTION.md)

## Quick start

```bash
npm install
npm run dev
```

`npm start` is an alias of `npm run dev`.

The first launch creates `~/clever-console/config.ini` if it does not exist.
Edit that file with any text editor — no JavaScript required — and restart the
player. See [docs/CONFIGURATION.md](./docs/CONFIGURATION.md).

Do **not** install Electron globally. The project pins Electron as a local
`devDependency`.

## Documentation

| Topic | File |
| --- | --- |
| Configuration reference (`config.ini`) | [docs/CONFIGURATION.md](./docs/CONFIGURATION.md) |
| Production build & deployment | [docs/PRODUCTION.md](./docs/PRODUCTION.md) |
| Release process & GitHub Actions | [docs/RELEASE.md](./docs/RELEASE.md) |
| Troubleshooting & logs | [docs/TROUBLESHOOTING.md](./docs/TROUBLESHOOTING.md) |
| Security notes | [docs/SECURITY.md](./docs/SECURITY.md) |

## Scripts

| Script            | Description                          |
| ----------------- | ------------------------------------ |
| `npm run dev`     | Development Electron process         |
| `npm test`        | Node test runner                     |
| `npm run lint`    | ESLint                               |
| `npm run build`   | Unpacked production app              |
| `npm run package` | Current-platform installer           |
| `npm run release` | Package and publish (CI use)         |

Platform-specific packaging (`package:win`, `package:linux`) is documented in
[docs/PRODUCTION.md](./docs/PRODUCTION.md).

## License

ISC. Copyright © Closed-Loop Technology Pte. Ltd.
