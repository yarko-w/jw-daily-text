# JW Daily Text — Obsidian Plugin (TypeScript + Rollup)

This repository contains a minimal Obsidian plugin that fetches the JW.org "Daily Text" JSON endpoint and writes a markdown block into a note in your vault.

Highlights
- Uses `requestUrl` to avoid CORS in desktop Obsidian.
- TypeScript source in `src/main.ts`.
- Build with Rollup to produce `main.js` (CJS) that Obsidian loads.
- Simple settings UI: target path template, append vs overwrite, auto-fetch daily.

Quick start (local testing)
1. Clone this repository locally.
2. Install dev dependencies:
   - npm install
3. Build the plugin:
   - npm run build
   This produces `main.js` in the repo root (Rollup output).
4. Copy plugin files to your vault plugin folder:
   - Create folder: <your-vault>/.obsidian/plugins/jw-daily-text/
   - Copy `manifest.json` and `main.js` into that folder. You may also include the README if you like.
5. In Obsidian:
   - Settings → Community plugins → enable if needed.
   - Enable the "JW Daily Text" plugin.
   - Open the command palette and run "Fetch JW Daily Text".
   - The plugin will create/append a note according to the configured template (default: `Daily/JW Daily Text - {YYYY}-{MM}-{DD}.md`).

Development notes
- During development you can run `npm run watch` to rebuild on file changes.
- The project includes minimal local typings (src/types/obsidian.d.ts) so TypeScript can compile. These are intentionally minimal; for more accurate typing you can replace them with community-maintained Obsidian type definitions.
- The produced `main.js` is CommonJS and should be placed directly in the plugin folder for Obsidian to load.

Mobile / Web considerations
- `requestUrl` is available in desktop Obsidian (Electron). Mobile/web builds may behave differently. If you need mobile support and `requestUrl` is unavailable, you'll need an alternative (server-side proxy, user-provided proxy URL setting, or manual copy/paste workflow).

Next steps I can help with
- Add CI to automatically build releases (GitHub Actions).
- Add integration with Obsidian's Daily Notes / Templates (insert into today's note).
- Improve the HTML → Markdown conversion (preserve emphasis, links, lists).
- Add a setting for a custom proxy or fallback fetch method.

If you want, I can produce a ready GitHub repo (I can draft the issue or PR contents) or produce the compiled `main.js` for immediate drop-in. Tell me which you prefer.