# HTML to Reader

A tiny client-side web app that turns pasted HTML/CSS/JS into a clean, copy- and print-friendly **reader view**, then exports it as a PDF.

## Features

- Three textareas for **HTML**, **CSS**, and **JavaScript** input
- Generates a stripped-down reader view (semantic HTML only: headings, paragraphs, lists, tables, figures, blockquotes, code blocks, links, images)
- Detects and removes copy/print/share blockers:
  - JS: `oncontextmenu`, `onselectstart`, `oncopy/cut/paste`, `onkeydown`, `window.print` overrides, devtools traps, etc.
  - CSS: `user-select: none`, `pointer-events: none`, hostile `@media print` rules
  - HTML inline event handlers
- **Dynamic content capture** — when JS is provided:
  - **Static extraction**: scans the JS source for inlined object-literal arrays (rating descriptions, FAQ entries, glossary, criteria, etc. — anything declared as `var X=[{...}, {...}, ...]` inside the bundle, which minifiers usually scope away from `window`)
  - **In-place injection**: for each button / tab / radio group in the pasted HTML, finds the best-matching extracted array (by overlap between button labels and item labels) and replaces the group's result-panel sibling with every variant stacked and labeled
  - **Sandbox fallback**: the JS is also loaded in a hidden sandboxed iframe (mount points like `#root` auto-injected, navigation/alert handlers neutralised, errors captured); if a button group has clickable handlers, its variants are walked there too
- Live preview of the reader output
- Reports every restriction it stripped
- One-click **Download as PDF** (via `html2pdf.js`, A4)

## How it works

All processing happens in the browser:

1. Source HTML is parsed with `DOMParser`.
2. Unsafe / non-content tags (`script`, `style`, `iframe`, forms, media wrappers, etc.) are removed.
3. Unknown tags are unwrapped (content kept, wrapper dropped).
4. Attributes are reduced to a safe allowlist (`href`, `src`, `alt`, `title`, `colspan`, `rowspan`, `datetime`).
5. `javascript:` URLs are stripped from `href`/`src`.
6. The provided CSS and JS are scanned for blocking patterns and **never injected** into the page — they're only used for the restriction report.
7. The cleaned DOM is rendered with a built-in reader stylesheet.

No data leaves the browser.

## Hosting

Deployed for **free** via **GitHub Pages**, built and published by GitHub Actions on every push to `main`. There is no server.

## Local preview

Open `index.html` directly in a browser, or serve the folder:

```sh
python3 -m http.server 8000
# then visit http://localhost:8000
```

## CI/CD

- `.github/workflows/ci.yml` — runs on PRs and feature branches: validates files, checks JS syntax with `node --check`, fails on stray `console.log`.
- `.github/workflows/deploy.yml` — runs on push to `main`: publishes the repo root to GitHub Pages.

To enable hosting, in the repo on GitHub: **Settings &rarr; Pages &rarr; Source = "GitHub Actions"**.

## Files

```
index.html          # markup + UI
style.css           # app + reader styles
app.js              # parsing, sanitization, blocker detection, PDF export
.github/workflows/  # CI + Pages deploy
```
