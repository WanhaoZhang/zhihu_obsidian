import type { Element } from "hast";
import type { PhrasingContent, Table } from "mdast";
import { zhihuEquation } from "./math";

const TEXT_WIDTH = 28; // Roughly 14 CJK characters per column.
type Part = {
    tex: string;
    width: number;
    break?: boolean;
    text?: string;
    style?: Style;
};
type Style = { bold?: boolean; italic?: boolean; code?: boolean };

function textWidth(text: string): number {
    return Array.from(text).reduce(
        (width, char) => width + (/[^\u0000-\u00ff]/.test(char) ? 2 : 1),
        0,
    );
}

function textTex(text: string, style: Style): string {
    const symbols: Record<string, string> = {
        "\\": "\\backslash",
        "{": "\\{",
        "}": "\\}",
        "$": "\\$",
        "&": "\\&",
        "#": "\\#",
        "%": "\\%",
        "_": "\\_",
    };
    // Zhihu's equation server does not parse nested text macros or escaped
    // symbols inside \text. Emit those symbols in math mode between text runs.
    // Literal ^ and ~ are supported inside its text macros.
    return text.split(/([\\{}$&#%_])/g).map((part) => {
        if (!part) return "";
        if (symbols[part]) return `{${symbols[part]}}`;
        const command = style.code ? "texttt" : style.italic ? "textit" : style.bold ? "textbf" : "text";
        let tex = `\\${command}{${part}}`;
        if (style.bold && (style.code || style.italic)) tex = `\\boldsymbol{${tex}}`;
        if (style.italic && style.code) tex = `\\mathit{${tex}}`;
        return tex;
    }).join("");
}

function inlineParts(nodes: PhrasingContent[], style: Style = {}): Part[] | undefined {
    const parts: Part[] = [];
    for (const node of nodes) {
        switch (node.type) {
            case "text":
            case "inlineCode": {
                const currentStyle = {
                    ...style,
                    code: style.code || node.type === "inlineCode",
                };
                // Keep ordinary words together, but allow CJK text and very long
                // words to wrap. Math is always an indivisible part.
                const tokens = node.value.match(/[A-Za-z0-9][A-Za-z0-9_.:/+-]*|[^\S\n]+|\n|./gu) || [];
                for (const token of tokens) {
                    if (token === "\n") {
                        parts.push({ tex: "", width: 0, break: true });
                        continue;
                    }
                    const chunks = textWidth(token) > TEXT_WIDTH ? Array.from(token) : [token];
                    for (const chunk of chunks) {
                        parts.push({
                            tex: "",
                            text: chunk,
                            style: currentStyle,
                            width: textWidth(chunk),
                        });
                    }
                }
                break;
            }
            case "inlineMath":
                // Do not escape or wrap the user's LaTeX source.
                parts.push({
                    tex: `{${node.value}}`,
                    width: textWidth(node.value.replace(/\\[a-zA-Z]+/g, "x")),
                });
                break;
            case "strong":
            case "emphasis": {
                const children = inlineParts(node.children, {
                    ...style,
                    bold: style.bold || node.type === "strong",
                    italic: style.italic || node.type === "emphasis",
                });
                if (!children) return;
                parts.push(...children);
                break;
            }
            case "break":
                parts.push({ tex: "", width: 0, break: true });
                break;
            case "html":
                if (!/^<br\s*\/?\s*>$/i.test(node.value.trim())) return;
                parts.push({ tex: "", width: 0, break: true });
                break;
            default:
                // Links, images, footnotes, wiki links, and arbitrary HTML must
                // retain their behavior. Never silently discard them in TeX.
                return;
        }
    }
    return parts;
}

function renderLine(parts: Part[]): string {
    let output = "";
    let text = "";
    let style: Style = {};
    const flush = () => {
        if (text) output += textTex(text, style);
        text = "";
    };
    for (const part of parts) {
        if (part.text !== undefined) {
            const nextStyle = part.style || {};
            if (
                style.bold !== nextStyle.bold ||
                style.italic !== nextStyle.italic ||
                style.code !== nextStyle.code
            ) flush();
            style = nextStyle;
            text += part.text;
        } else {
            flush();
            output += part.tex;
        }
    }
    flush();
    return output || "\\text{ }";
}

function renderCell(parts: Part[], alignment: string): string {
    const lines: string[] = [];
    let line: Part[] = [];
    let width = 0;
    for (const part of parts) {
        if (part.break || (width > 0 && width + part.width > TEXT_WIDTH)) {
            lines.push(renderLine(line));
            line = [];
            width = 0;
        }
        if (!part.break) {
            if (width === 0 && part.text?.trim() === "" && !part.style?.code) continue;
            line.push(part);
            width += part.width;
        }
    }
    lines.push(renderLine(line));
    return lines.length === 1
        ? lines[0]
        : `\\begin{array}{${alignment}}${lines.join("\\\\")}\\end{array}`;
}

export function hasTableMath(node: Table): boolean {
    const hasMath = (nodes: PhrasingContent[]): boolean => nodes.some(
        (child) => child.type === "inlineMath" ||
            ("children" in child && hasMath(child.children)),
    );
    return node.children.some((row) => row.children.some((cell) => hasMath(cell.children)));
}

export function tableToLatex(node: Table): string | undefined {
    // Render the whole table as one equation to avoid Zhihu's native-cell
    // restriction. Array workaround suggested by 于连:
    // https://www.zhihu.com/question/1914425114503680325/answer/1935357755381753435
    if (!hasTableMath(node)) return;
    const columns = Math.max(...node.children.map((row) => row.children.length));
    const alignments = Array.from({ length: columns }, (_, col) => {
        const align = node.align?.[col];
        return align === "center" ? "c" : align === "right" ? "r" : "l";
    });
    const rows: string[] = [];
    for (const row of node.children) {
        const cells: string[] = [];
        for (let col = 0; col < columns; col++) {
            const parts = inlineParts(row.children[col]?.children || []);
            if (!parts) return;
            cells.push(renderCell(parts, alignments[col]));
        }
        rows.push(`${cells.join(" & ")} \\\\`);
    }
    return [
        "\\small",
        `\\begin{array}{|${alignments.join("|")}|}`,
        "\\hline",
        rows.join("\n\\hline\n"),
        "\\hline",
        "\\end{array}",
    ].join("\n");
}

export function renderZhihuTable(
    state: any,
    node: Table,
    onUnsupported?: () => void,
): Element {
    const latex = tableToLatex(node);
    if (latex !== undefined) return zhihuEquation(latex, true);
    if (hasTableMath(node)) onUnsupported?.();
    // Keep the original native-table output for ordinary or unsupported tables.
    return {
        type: "element",
        tagName: "table",
        properties: {
            "data-draft-node": "block",
            "data-draft-type": "table",
            "data-size": "normal",
        },
        children: [{
            type: "element",
            tagName: "tbody",
            properties: {},
            children: state.all(node),
        }],
    };
}
