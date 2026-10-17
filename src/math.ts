import type { Element } from "hast";
import { mathFromMarkdown, mathToMarkdown } from "mdast-util-math";
import { math } from "micromark-extension-math";

// Shared by the publisher and its regression tests, including the fork's
// support for inline $$...$$ expressions.
export function mathPlugin(this: any) {
    const data = this.data();
    (data.micromarkExtensions ||= []).push(math(this || {}));
    (data.fromMarkdownExtensions ||= []).push(mathFromMarkdown());
    (data.toMarkdownExtensions ||= []).push(mathToMarkdown(this || {}));
}

export function zhihuEquation(eq: string, display: boolean): Element {
    const image: Element = {
        type: "element",
        tagName: "img",
        properties: {
            eeimg: display ? "2" : "1",
            // array uses &, and equations may contain +, #, or %. Each must
            // remain part of the tex parameter rather than the surrounding URL.
            src: `//www.zhihu.com/equation?tex=${encodeURIComponent(eq)}`,
            alt: eq.replace(/[\n\r]/g, " "),
        },
        children: [],
    };
    return display
        ? { type: "element", tagName: "p", properties: {}, children: [image] }
        : image;
}
