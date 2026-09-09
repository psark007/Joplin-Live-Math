# Changelog

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
