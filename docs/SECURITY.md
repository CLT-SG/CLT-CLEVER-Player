# Security notes

- `contextIsolation` is enabled and `nodeIntegration` is disabled in the
  player window. A preload bridge exposes the `window.ipcRenderer` and
  `window.remote.getCurrentWindow().setBounds()` APIs that CLEVER web
  relies on.
- Pepper Flash has been removed (unsupported in modern Chromium).
- Certificate errors are accepted only for private/local HTTPS and WSS hosts, including `.local` names. ScreencastApp websockify uses `wss://` on the LAN, and Video Wall / Console webviews must be allowed to complete that handshake.
- Webview guests cannot enable Node integration.
- Guest webviews allow mixed content so that third-party WebCast URLs
  (for example Google Slides) can load.
- Credentials, tokens, serial keys, and private keys are redacted from
  logs.
