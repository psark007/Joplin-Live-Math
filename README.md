# Joplin-Live-Math

Live KaTeX previews in Joplin's Markdown editor. Equations render in place when you are not editing them; clicking a preview or moving the cursor into it reveals the original TeX. The preview never rewrites your note.

## Project Links

- [Source repository](https://git.pawelsarkowicz.xyz/ps/Joplin-Live-Math)
- [Releases](https://git.pawelsarkowicz.xyz/ps/Joplin-Live-Math/releases)
- [Issue tracker](https://git.pawelsarkowicz.xyz/ps/Joplin-Live-Math/issues)
- [Changelog](CHANGELOG.md)
- Clone: `ssh://git@git.pawelsarkowicz.xyz:2222/ps/Joplin-Live-Math.git`

## Requirements

- Joplin desktop 3.1 or newer, using the CodeMirror 6 Markdown editor.
- The legacy CodeMirror 5 editor, Rich Text editor, and mobile apps are not supported.
- Rich Markdown is optional. It enhances the Markdown editor; it is different from Joplin's Rich Text editor.

Earlier user verification was on Joplin 3.6.14 on Linux with Rich Markdown. Native Markdown table support is tested against Joplin 3.7.18's table widget. Automated browser tests exercise CodeMirror, simulated quote styles, and the upstream table widget with host shims, not the full Joplin application or every theme/plugin combination.

## Installation

Install a `.jpl` attached to a repository release, or build one locally as described below.

1. In Joplin, open **Tools > Options > Plugins** and choose **Install from file** from the plugin menu.
2. Select `Joplin-Live-Math.jpl`.
3. Fully quit Joplin, including the system tray instance, and restart it.
4. Use the Markdown editor. **Options > Joplin-Live-Math > Enable Live Math** controls the previews.

To update, install the newly built `.jpl` and restart again. Install the archive, not the companion `.json`, an individual JavaScript file, or the entire `publish` directory.

## Editing And Copying

- Click a rendered equation to reveal its source. The click position approximates a position within the TeX; it is not a mapping from individual rendered symbols to source characters.
- Move the cursor or selection outside the equation to render it again. Inline source also stays visible at its delimiter boundaries.
- During mouse-drag selection, previews and already-open source stay fixed until you release the button, so the text does not move under the pointer. Shift-click extends the selection normally.
- Select source and copy normally. Copying with a cursor inside an equation copies its delimited Markdown source; selected text is copied as stored in the note.
- Multiline equations use block widgets. They retain list indentation and Joplin's native left bar inside blockquotes. Same-line equations stay in the text flow.
- Rendering and fonts are local. The plugin does not send note content to a rendering service.

## Supported Syntax

Inline math:

```markdown
Let $X \sim N(0,1)$ and $x=y$.
```

Display math, including matrices and equation tags:

```markdown
$$
A = \begin{pmatrix}
a & b \\
c & d
\end{pmatrix}
\tag{1}
$$
```

Same-line `$$x+y$$` and multiline expressions with content beside their delimiters are also supported:

```markdown
$$L = \begin{pmatrix}
x & y
\end{pmatrix}$$
```

Quotes and lists:

```markdown
> An estimate:
>
> $$
> \delta \gtrsim \frac{c_\varepsilon-Cr}{C}.
> $$

- Inline math: $x^2$.
- $$
  x^2 + y^2 = 1
  $$
```

For existing notes, an inline code span containing just a math expression, such as `` `$x=y$` ``, is also rendered. Mixed code spans and fenced code blocks are kept literal, including fences inside lists and quotes.

Use ordinary TeX in the editor: `_` introduces a subscript, `\_` is a literal underscore, and `\\[2mm]` ends a matrix row with extra spacing. See [KaTeX's supported functions](https://katex.org/docs/supported.html) for available commands. Every `$$...$$` expression uses KaTeX display mode, independently of its editor layout.

## Native Markdown Tables

Live Math also renders equations inside Joplin's built-in interactive Markdown tables. Keep **Options > Editor > Markdown editor: Interactive table editing** enabled. Neither Rich Markdown nor Rich Tables is required. This integration targets the native table widgets in Joplin 3.7 and is verified against 3.7.18; it does not add support to the separate Rich Text editor.

```markdown
| Quantity | Value |
| --- | --- |
| Norm | $\lVert x\rVert$ |
| Two lines | $x=1$<br>$y=2$ |
| Matrix | $$\begin{pmatrix}a&b\\c&d\end{pmatrix}$$ |
```

- Click a preview to edit the cell's original Markdown. Tab and Shift+Tab use Joplin's native cell navigation; leaving the cell restores its math preview.
- To put multiple lines in one cell, type literal `<br>` between them. Joplin 3.7.18 blocks Shift+Enter in native Markdown table cells. Keep each table row on one Markdown line; use TeX `\\` for matrix rows within a same-line `$$...$$` expression.
- Prefer `\lvert`/`\rvert` or `\lVert`/`\rVert` for math bars. A literal pipe must be escaped in Markdown table source (`\|`) so it does not start another column.
- Select and copy raw cell source normally. Copying a selection contained in a rendered cell that includes math copies that whole cell's Markdown. Open the cell first when you need only part of its source.
- Previews support emphasis, bold, strikethrough, links, inline code, and `<br>`. Other raw HTML remains literal. Cells without math retain Joplin's native rendering.

The plugin never writes rendered math back into the note. Joplin itself may normalize table spacing when navigating or editing cells.

## Troubleshooting

If there is no preview, move the cursor and selection outside the expression, check **Enable Live Math**, and confirm that you are in the Markdown editor. After installing an update, check the version in Joplin's plugin list and fully restart the application.

KaTeX parse failures can appear as red TeX. Unmatched delimiters stay as source. Check the TeX separately from the surrounding Markdown; wrapping an equation in extra backslashes can change its meaning.

For native tables, check that Live Math is at least 0.1.22 and try the table example above. The integration depends on Joplin's native table DOM; if a future version changes it, unsupported tables are left untouched. Turning off interactive table editing exposes the underlying Markdown as a fallback.

For a rendering or interaction bug, include a minimal note in a fenced code block, your Joplin/plugin versions, theme, and relevant editor plugins in an [issue](https://git.pawelsarkowicz.xyz/ps/Joplin-Live-Math/issues). If the extension fails to load, **Help > Toggle Development Tools** may contain a relevant `Joplin-Live-Math` error.

## Known Limitations

- Single-dollar inline math does not span multiple lines. Use `$$` for multiline expressions.
- Dollar-sign detection uses heuristics to avoid currency. Some unusual delimiters, word-adjacent math, or complex Markdown nesting may remain as source.
- As a compatibility behavior, a standalone `\>` line inside display math is rendered as `>`. Standard TeX normally uses `\>` for spacing. Prefer `>` or `\gt` for comparisons.
- This plugin changes only the editor preview. Joplin's viewer, exports, and other clients use their own math handling, which may differ for compatibility syntax such as math in backticks.
- The whole note is parsed after document edits. Cursor-only updates reuse the parsed expressions, but still rebuild decorations. Very large notes may be slower.
- Wide equations scroll horizontally. Equation tags and sizing in particularly narrow editor panes may need more space.
- Native table integration is specific to Joplin's Markdown table widget, not third-party table replacements or the Rich Text editor.

## Development

Use Node.js 22.12+ in the 22.x line, or Node.js 24+, and npm. Node is needed only to build/test the plugin, not to install a `.jpl` in Joplin.

```bash
git clone ssh://git@git.pawelsarkowicz.xyz:2222/ps/Joplin-Live-Math.git
cd Joplin-Live-Math
npm ci
npm run typecheck
npm test
npm run dist
npm run check:package
```

Build outputs:

- `dist/`: compiled entry points, styles, embedded fonts, and license notices.
- `publish/Joplin-Live-Math.jpl`: installable plugin archive.
- `publish/Joplin-Live-Math.json`: manifest metadata and archive SHA-256 hash.

Generated build outputs are ignored by Git. For development loading, set Joplin's **Development plugins** path to this repository after building, then restart Joplin. Avoid loading both an installed and development copy simultaneously.

Browser tests:

```bash
npx playwright install chromium
npm run test:browser
```

An existing Chromium-compatible browser can be selected with `PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH`. The tests use a separate temporary browser profile and cover font loading, matrix brackets, quote borders, real mouse drags, copying, and click-position accuracy at desktop and narrow widths. Screenshots are written under `test-results/`.

To include the native-table regressions:

```bash
npm run test:tables
```

The first run downloads two checksum-pinned Joplin 3.7.18 source files into the ignored `.joplin-table-fixture/` directory. They are test-only AGPL source, never bundled in the plugin. Later runs reuse verified copies. Regular browser runs include the native-widget tests when verified fixtures are present, otherwise those tests are explicitly skipped. The fixture supplies Joplin's real table model, widget, focus handlers, keyboard handling, and save timers; editor services and sanitization are host shims. Tests cover cell editing, delayed saves, Tab navigation, bidirectional source selection, copying, structural changes, read-only mode, and source preservation.

### Implementation

- `src/index.ts`: plugin registration and the enable setting.
- `src/contentScript.ts`: CodeMirror extension installation and settings updates.
- `src/mathParser.ts`: delimiter scanning and source extraction; Lezer's Markdown parser identifies fenced-code boundaries.
- `src/mathDecorations.ts`: source/preview selection, copying, and sorted CodeMirror decorations.
- `src/mathWidget.ts` and `src/styles.css`: KaTeX widgets and editor layout.
- `src/nativeTableMath.ts`: separate cell previews beside Joplin's editable text, preserving native editing and saving.
- `src/tableMathRendering.ts`: Lezer-based table source mapping and safe inline Markdown/KaTeX rendering.
- `scripts/katexCss.js`: embeds WOFF2 fonts because Joplin injects CSS without preserving relative font URLs.
- `scripts/archive.js` and `scripts/checkPackage.js`: packaging and archive smoke checks.

CodeMirror and Lezer packages are externalized and supplied by Joplin at runtime. KaTeX is bundled. This avoids loading a second copy of CodeMirror into Joplin's editor.

## References And Licenses

This plugin is MIT-licensed. See [LICENSE](LICENSE) and [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md). The archive includes KaTeX's full license at `licenses/KaTeX-LICENSE.txt`.

- [Joplin's CodeMirror 6 plugin guide](https://joplinapp.org/help/api/tutorials/cm6_plugin/).
- [bwat47/joplin-rich-tables](https://github.com/bwat47/joplin-rich-tables), MIT: the StateField/decoration architecture informed this plugin's implementation.
- [blueberrycongee/codemirror-live-markdown](https://github.com/blueberrycongee/codemirror-live-markdown), MIT: a reference for switching source and previews based on selection.
- [KaTeX](https://github.com/KaTeX/KaTeX), MIT: math rendering and fonts.
- [Lezer Markdown](https://github.com/lezer-parser/markdown), MIT: fenced-code, table, and inline Markdown parsing.
- [Joplin 3.7.18 native table widget](https://github.com/laurent22/joplin/blob/v3.7.18/packages/editor/CodeMirror/extensions/rendering/renderTables.ts), AGPL-3.0: integration reference and separately downloaded browser-test fixture; not bundled.
