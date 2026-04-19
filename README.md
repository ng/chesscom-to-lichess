# Chess.com → Lichess Importer

Chrome extension that imports the chess.com game you're currently viewing into [lichess.org](https://lichess.org) with a single click. No logins, no API keys.

## How it works

1. Open any finished chess.com game page (live or daily).
2. Click the extension icon → **Import current game to Lichess**.
3. The extension automates the chess.com share modal to grab the PGN, then POSTs it to `https://lichess.org/api/import`.
4. A new tab opens on lichess with your imported game.

## Install (unpacked)

1. Clone this repo.
2. Visit `chrome://extensions`.
3. Toggle on **Developer mode** (top right).
4. Click **Load unpacked** and pick this folder.
5. Pin the extension for easy access.

## Permissions

- `activeTab` + `scripting` — to read the PGN from the chess.com tab you're currently on.
- Host access to `https://www.chess.com/*` and `https://lichess.org/*`.

The extension does not send data anywhere else, does not track you, and has no background/service-worker processes.

## Caveats

- Chess.com's DOM changes occasionally. If extraction breaks, open an issue with the page you tried.
- Lichess rate-limits imports — if you see `429`, wait a bit before retrying.
- The share button only appears on finished games.

## License

MIT
