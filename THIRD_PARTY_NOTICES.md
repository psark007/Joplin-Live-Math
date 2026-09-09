# Third Party Notices

## KaTeX

KaTeX, its CSS, and its WOFF2 fonts are bundled in the plugin. Font files are embedded unchanged as data URLs in the generated stylesheet.

Repository: https://github.com/KaTeX/KaTeX

License: MIT, Copyright (c) 2013-2020 Khan Academy and other contributors.

The full license from the installed KaTeX package is included in every `.jpl` archive as `licenses/KaTeX-LICENSE.txt`.

## CodeMirror And Lezer

CodeMirror and Lezer modules, including `@lezer/markdown` for fenced-code boundaries, are supplied by Joplin at runtime. They are externalized from the plugin's content script, not bundled in the `.jpl`.

Repositories: https://github.com/codemirror and https://github.com/lezer-parser/markdown

## Design References

The live-preview behavior was also informed by https://github.com/blueberrycongee/codemirror-live-markdown. That library is not bundled with this plugin.

## joplin-rich-tables

This plugin adapts the CodeMirror 6 `StateField`/`RangeSetBuilder` decoration architecture used by `bwat47/joplin-rich-tables`.

Repository: https://github.com/bwat47/joplin-rich-tables

License: MIT

```text
MIT License

Copyright (c) 2025 bwat47

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.
```
