# Audio Tab Closer

A lightweight Chrome extension that helps you quickly find, open, or close tabs currently producing audio.

## Features

- Automatically opens the only audible tab.
- Lists audible tabs when several are producing sound.
- Lets you switch to or close a selected audio tab.
- Returns to the originating tab after closing a selected destination.
- Updates the list when tabs are closed elsewhere.

## Requirements

- Google Chrome 127 or newer.

## Install locally

1. Download or clone this repository.
2. Open `chrome://extensions`.
3. Enable **Developer mode**.
4. Select **Load unpacked**.
5. Choose the extension directory.

## Privacy

Audio Tab Closer processes tab titles and URLs locally only to identify audible tabs. It makes no external network requests and uses no analytics, tracking, remote code, or host permissions.

Permissions:

- `tabs` — identifies and manages audible tabs selected by the user.
- `storage` — temporarily retains tab IDs required for the return flow.

[Privacy Policy](#) — link will be added after GitHub Pages is configured.

## License

No license has been selected.
