# Release process

Releases are cut by pushing a git tag. GitHub Actions builds the Windows and
Linux installers and publishes them as a GitHub Release, together with the
`latest*.yml` metadata consumed by `electron-updater`.

## Versioning

Use semantic versioning `MAJOR.MINOR.PATCH`:

| Bump      | When                             |
| --------- | -------------------------------- |
| `MAJOR`   | Breaking player behaviour        |
| `MINOR`   | New configuration or features    |
| `PATCH`   | Bug fixes                        |

Prerelease channels publish `beta.yml` / `alpha.yml` instead of `latest.yml`:

- `4.2.0-beta.1`
- `4.2.0-alpha.1`

The tag name **must** equal `package.json` `version`:

- `"version": "4.2.0"` → `git tag v4.2.0`

The release workflow fails fast if they disagree.

## Release checklist

```
1. Bump "version" in package.json
2. Commit the version change
3. git tag vMAJOR.MINOR.PATCH
4. git push origin main
5. git push origin vMAJOR.MINOR.PATCH
6. Watch the Release workflow in GitHub Actions
7. Verify the GitHub Release contains installer + latest*.yml
```

Example:

```bash
# package.json version is now 4.2.1
git add package.json package-lock.json
git commit -m "Release 4.2.1"
git tag v4.2.1
git push origin main
git push origin v4.2.1
```

If a workflow run fails and you need to re-tag the same version:

```bash
git tag -d v4.2.1
git push --delete origin v4.2.1
# fix, commit, then re-tag
```

Re-using a tag will overwrite any partially-published GitHub Release for that
version. Prefer bumping to the next patch when possible.

## Workflows

| Workflow                                              | Trigger                  | What it does                                                                 |
| ----------------------------------------------------- | ------------------------ | ---------------------------------------------------------------------------- |
| [`.github/workflows/ci.yml`](../.github/workflows/ci.yml)           | Push / pull request      | `npm ci`, lint, test, Linux unpacked build                                   |
| [`.github/workflows/release.yml`](../.github/workflows/release.yml) | Tag `v*`                 | Verifies tag matches `package.json`, lints, tests, packages, publishes Release |

The release job is a matrix:

- Windows (`windows-latest`) → `Clever-Player Setup x.x.x.exe` + `latest.yml` + `.blockmap`
- Linux (`ubuntu-latest`) → `.deb`, `.AppImage`, `latest-linux.yml`

Installers are also uploaded as Actions artifacts for 14 days for debugging.

## Secrets

The default `GITHUB_TOKEN` (`contents: write`) is enough to create releases.

Optional code-signing secrets — unsigned installers are still produced when
they are absent:

| Secret             | Purpose                                                                        |
| ------------------ | ------------------------------------------------------------------------------ |
| `CSC_LINK`         | Base64-encoded Windows code-signing certificate (`.pfx`), or a URL to the file |
| `CSC_KEY_PASSWORD` | Certificate password                                                           |

Set `GH_TOKEN` only if you want to replace `GITHUB_TOKEN` with a PAT.
electron-builder reads `GH_TOKEN`; the workflow maps `GITHUB_TOKEN` to it.

### Windows code signing

Unsigned NSIS installers work for auto-update
(`verifyUpdateCodeSignature` is `false` until a certificate is configured), but
SmartScreen will warn end users on the first install.

To sign:

1. Export your Windows code-signing certificate as `.pfx` with a strong password.
2. Base64-encode the file:
   ```bash
   base64 -w0 cert.pfx > cert.pfx.b64
   ```
3. In GitHub → repo → **Settings → Secrets and variables → Actions**:
   - `CSC_LINK`         = paste the base64 blob
   - `CSC_KEY_PASSWORD` = the export password
4. Push a new version tag. SmartScreen warnings disappear once the signed
   binary builds reputation.

## Auto-update distribution

`CLT-CLEVER-Player` is a private GitHub repository. Unauthenticated
`releases.atom` requests return 404, so installed players need one of:

1. A public repository (or a public releases-only repo) in `build.publish`, **or**
2. A read-only GitHub token available to the installed app as `GH_TOKEN` /
   `GITHUB_TOKEN` (contents: read). **Do not bake a token into the installer.**

Until a release tag is published, `Update failed` in the client is expected
and is handled without crashing.
