# Math table screenshots

Both screenshots use the MoE table in [`test/fixtures/moe-math-table.md`](../../test/fixtures/moe-math-table.md).

- `before-zhihu-editor.jpg`: an actual Zhihu editor screenshot of the native table. The cells display source such as `X_e`, `V_{t,e}` and `dp=\langle dY,V\rangle` instead of formatted math.
- `after-zhihu-equation.jpg`: the same table converted by `tableToLatex` and rendered by Zhihu's equation service. This verifies the generated TeX against the service used by the plugin; it is not a screenshot of a newly published article.

The captures were taken on 2026-10-17 and cropped to the table area. They contain no account controls or login data.

The workaround of rendering an entire table with LaTeX `array` was suggested by [于连 in this Zhihu answer](https://www.zhihu.com/question/1914425114503680325/answer/1935357755381753435). The implementation adds automatic Markdown AST conversion, text wrapping, escaping, and safe fallback for unsupported cell contents.
