const fs = require("fs");
const vm = require("vm");
const assert = require("assert");

function createElement() {
  return {
    addEventListener() {},
    appendChild() {},
    querySelectorAll() {
      return [];
    },
    set innerHTML(value) {
      this.html = value;
    },
    get innerHTML() {
      return this.html || "";
    },
    textContent: "",
    hidden: false,
    className: "",
    href: "",
  };
}

const elements = new Map();
const sandbox = {
  console,
  fetch: async () => ({ ok: false, status: 404, text: async () => "" }),
  window: { print() {} },
  document: {
    getElementById(id) {
      if (!elements.has(id)) elements.set(id, createElement());
      return elements.get(id);
    },
    createElement,
  },
};

vm.createContext(sandbox);
vm.runInContext(fs.readFileSync("app.js", "utf8"), sandbox);

const inline = sandbox.parseInline("`分层考试说明.pdf`：官方考察重点与题型结构");
assert.strictEqual(inline, "<code>分层考试说明.pdf</code>：官方考察重点与题型结构");
assert(!inline.includes("MDPLACEHOLDER"), "placeholder text leaked into inline output");

const documentHtml = sandbox.parseMarkdown([
  "# 标题",
  "",
  "| 项目 | 内容 |",
  "|------|------|",
  "| **基础理论** | AI概念 |",
  "",
  "- 一级",
  "  - **二级**",
  "",
  "```python",
  "print('ok')",
  "```",
].join("\n"));

assert(documentHtml.includes("<h1"));
assert(documentHtml.includes("<table>"));
assert(documentHtml.includes("<strong>基础理论</strong>"));
assert(documentHtml.includes("<ul><li>一级<ul><li><strong>二级</strong></li></ul></li></ul>"));
assert(documentHtml.includes("<pre><code class=\"language-python\">print(&#39;ok&#39;)</code></pre>"));

console.log("parser tests passed");
