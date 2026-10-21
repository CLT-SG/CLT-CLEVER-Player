# Office Tools (Player notes)

CLEVER-Player does **not** implement the Office Tools document renderer itself. Video Wall and Console load CLEVER-Service preview pages, which mount `SlotOfficePlayback` for `mode=office` (including remapped legacy `liveoffice` rows).

## What the player provides

- Hosts the Service UI that embeds the document editor DocsAPI (read-only on walls).
- Applies HTTP `content_update` / soft_reload payloads so a document revision change remounts only the affected slot.
- Allows navigation to the CLEVER controller host (and optional dedicated document-engine host).

## Configuration

When the document engine is proxied at `https://<CLEVER-HOST>/onlyoffice/` (recommended), no player change is required — the controller host is already allowlisted.

If the document engine is on a **separate** hostname, set:

```ini
[SERVER]
ONLYOFFICE_HOST=docs.example.com
```

(`ONLYOFFICE_HOST` is an internal config key for allowlisting; it is not a user-facing product name.)

Self-signed LAN TLS for the document engine follows the existing certificate policy for private hosts.

## Related

Service-side architecture, Docker, JWT, routing, and APIs: `clever-service/docs/onlyoffice-live-document.md`.
