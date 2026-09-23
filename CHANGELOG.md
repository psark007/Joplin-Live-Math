# Changelog

## 0.1.22

- Render inline and same-line display math inside Joplin's native interactive Markdown table cells, independently of Rich Markdown and Rich Tables.
- Keep KaTeX previews separate from native editable text to preserve cell editing, Tab navigation, delayed saves, and table actions.
- Preserve ordinary inline formatting and `<br>` in math cells; document multiline table entries and escaped pipes.
- Copy a rendered math cell as Markdown and keep raw cell source selectable in either direction.
- Add browser regressions against checksum-pinned Joplin 3.7.18 table source at desktop and narrow widths. Upstream fixture code is not included in the plugin.

## 0.1.21

- Keep previews and already-open TeX stationary while dragging a mouse selection; update rendering after release.
- Preserve drag selections and Shift-click selection extension instead of treating them as equation-editing clicks.
- Replace vertical display-widget margins with padding so CodeMirror correctly maps clicks to text below equations.
- Add real mouse-drag regressions for forward/backward selection, partial source copying, list/quote layouts, and interrupted gestures.

## 0.1.20

- Preserve literal comparison operators in indented and blockquoted display math.
- Respect fenced-code boundaries inside Markdown containers and prevent overlapping display matches.
- Keep code spans with prose between multiple equations as literal code.
- Fix decoration ordering when revealing multiline math after inline math on the same line.
- Check all cursors when deciding whether to reveal display source.
- Prevent delayed startup settings from overwriting newer enable/disable commands.
- Include KaTeX's full license in the archive and add package smoke checks.
- Update development dependencies, verification commands, and documentation.

## 0.1.19

- Preserve Joplin's quote bar through rendered display equations.
- Add CodeMirror browser tests for quote borders and source editing in light and dark themes.

## 0.1.18

- Embed KaTeX fonts in the stylesheet so Joplin can load matrix bracket fonts correctly.
- Improve math source copying and pointer selection at expression boundaries.
- Use KaTeX display mode for all double-dollar expressions, including tagged matrices.
- Add browser rendering tests for font and SVG matrix brackets.
