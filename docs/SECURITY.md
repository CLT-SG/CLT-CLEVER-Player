# Security notes

- `contextIsolation` is enabled and `nodeIntegration` is disabled in the
  player window. A preload bridge exposes the `window.ipcRenderer` and
  `window.remote.getCurrentWindow().setBounds()` APIs that CLEVER web
  relies on.
- Pepper Flash has been removed (unsupported in modern Chromium).
- Certificate errors are accepted for private/local HTTPS and WSS hosts, including `.local` names. ScreencastApp websockify uses a local self-signed cert on `wss://<ip>:8840/screenN`; Video Wall / Console webview partitions must complete that handshake. The player also enables Chromium `ignore-certificate-errors` so guest-webview WebSocket upgrades are not rejected after `/probe` already reported HTTPS `/status` PASS.
- Webview guests cannot enable Node integration.
- Guest webviews allow mixed content so that third-party WebCast URLs
  (for example Google Slides) can load.
- Credentials, tokens, serial keys, and private keys are redacted from
  logs.
