# Joplin Live Math

Joplin Live Math renders LaTeX math directly inside Joplin's CodeMirror 6 Markdown editor when the cursor or selection is not editing the expression. When the cursor enters the expression, the original Markdown source is shown again.

## Screenshots

Screenshots placeholder:

- Inline math rendered in the editor
- Display math rendered in the editor
- Source restored while editing

## Supported Syntax

Inline math:

```markdown
Let $X \sim N(0,1)$.
```

Display math:

```markdown
$$
E[X^2] = 1
$$
```

The display form is intentionally conservative in this first version: the opening and closing `$$` delimiters should be on their own lines.

## Behavior

- Math renders with KaTeX when the cursor and selection are outside the expression.
- The original `$...$` or `$$...$$` source is shown when the cursor or selection intersects the expression.
- Escaped dollars such as `\$` are ignored.
- Fenced code blocks and inline code spans are ignored.
- Malformed or incomplete math is left as source.
- The Markdown document is never modified by the preview.

## Installation

Build the plugin, then install the generated JPL from Joplin:

```bash
npm install
npm run dist
```

The archive is written to:

```text
publish/com.github.psark007.live-math-joplin.jpl
```

In Joplin desktop, open **Tools > Options > Plugins > Install from file** and select the `.jpl` file.

For development, you can also point Joplin's **Development plugins** setting at this repository after running `npm run dist`.

## Development

```bash
npm install
npm test
npm run dist
```

The build uses webpack and follows Joplin's current CodeMirror 6 content-script pattern:

- `src/index.ts` registers the plugin setting and the CodeMirror content script.
- `src/contentScript.ts` installs the CM6 extension and listens for setting updates.
- `src/mathDecorations.ts` provides a CM6 `StateField` of replacement decorations, using a Rich-Tables-style `RangeSetBuilder` decoration pipeline.
- `src/mathParser.ts` conservatively scans Markdown source for math while skipping code.
- `src/mathWidget.ts` renders KaTeX widgets.
- `src/styles.css` contains editor-only styling plus KaTeX CSS is copied from `katex`.

## Compatibility Notes

This plugin targets Joplin desktop with the CodeMirror 6 Markdown editor. It does not support the legacy CodeMirror 5 editor or the rich text editor.

The content script imports CodeMirror packages directly, and the webpack config externalizes `@codemirror/*` and `@lezer/*` packages. This follows the same pattern used by current CM6 Joplin plugins such as Rich Tables: Joplin's own editor packages are used at runtime, avoiding the duplicate-CodeMirror extension-instance problem described in the Joplin CM6 plugin documentation.

## Known Limitations

- Display math currently requires delimiter-only `$$` lines.
- Inline math does not span multiple lines.
- The parser is conservative around ordinary dollar signs and may leave unusual math-like text as source.
- Very large notes are rescanned after document or selection changes; this keeps the first version simple and correct.

## References And Licenses

The CM6 decoration architecture in `src/mathDecorations.ts` was adapted from the StateField/RangeSetBuilder pattern used by `bwat47/joplin-rich-tables`. See [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md).

- Joplin's official CodeMirror 6 Markdown editor plugin documentation.
- `bwat47/joplin-rich-tables`, MIT license, especially its use of CM6 content scripts and editor decorations for rendered source.
- `blueberrycongee/codemirror-live-markdown`, MIT license, especially its high-level live-preview pattern of switching between source and widgets based on selection.

This plugin is released under the MIT license.
