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

## Preview failures (“file content does not match the file extension”)

Video Wall / Console preview uses the **same** CLEVER-Service document URL and DocsAPI config as `/office/editor`. A content-mismatch error is almost always a Service-side byte/download problem, not a player renderer bug.

Checklist:

1. Confirm the Service document download returns ZIP bytes (`PK` / `50 4b`) from inside the document-engine container (`http://nginx/api/onlyoffice/document/...`).
2. Inspect Service `storage/logs/office-tools-*.log` for `office.document_served` / `editor.callback.reject_invalid_bytes`.
3. Recreate blank documents created before Service bundled templates.
4. Ensure `ONLYOFFICE_HOST` is set only when the engine is on a separate host; leave empty when using same-origin `/onlyoffice/`.

A failed Office Tools slot must not reload the entire wall — Service soft_reload targets office slots only.

## Related

Service-side architecture, Docker, JWT, routing, format validation, and APIs: `clever-service/docs/onlyoffice-live-document.md`.
