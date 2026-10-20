# ONLYOFFICE Live Document (Player notes)

CLEVER-Player does **not** implement the Live Document renderer itself. Video Wall and Console load CLEVER-Service preview pages, which mount `SlotLiveOfficePlayback` for `mode=liveoffice`.

## What the player provides

- Hosts the Service UI that embeds ONLYOFFICE DocsAPI (read-only).
- Applies HTTP `content_update` / soft_reload payloads so a document revision change remounts only the affected slot.
- Allows navigation to the CLEVER controller host (and optional dedicated Document Server host).

## Configuration

When Document Server is proxied at `https://<CLEVER-HOST>/onlyoffice/` (recommended), no player change is required — the controller host is already allowlisted.

If Document Server is on a **separate** hostname, set:

```ini
[SERVER]
ONLYOFFICE_HOST=docs.example.com
```

Self-signed LAN TLS for Document Server follows the existing certificate policy for private hosts.

## Related

Service-side architecture, Docker, JWT, and APIs: `clever-service/docs/onlyoffice-live-document.md`.
