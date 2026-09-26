import { expect } from "@open-wc/testing";
import {
  adaptBlocks,
  citedNumbers,
  cleanTitle,
  isSafeUrl,
  parseChart,
  parseDelimited,
  parseInline,
  parseMarkdown,
  plainText,
  provisionalTitle,
  settleStreaming,
  splitFollowups
} from "../src/utils/markdown.js";
import { svgDataUrl } from "../src/utils/svg.js";

const CHART =
  '```chart\n{"type":"bar","title":"Sign-ins","unit":"%","labels":["A","B"],"series":[{"name":"Rate","values":[1.5,2]}]}\n```';

describe("parseMarkdown", () => {
  it("splits paragraphs, headings, lists, quotes and tables", () => {
    const blocks = parseMarkdown(
      "## Title\nIntro line\n\n- one\n- two\n\n1. first\n2. second\n\n> a note\n\n| A | B |\n|---|---|\n| 1 | 2 |"
    );
    expect(blocks.map((b) => b.type)).to.deep.equal(["h", "p", "list", "list", "quote", "table"]);
    expect(blocks[0]).to.deep.equal({ type: "h", level: 2, text: "Title" });
    expect((blocks[3] as any).ordered).to.equal(true);
    expect(blocks[5]).to.deep.equal({
      type: "table",
      head: ["A", "B"],
      rows: [["1", "2"]],
      align: [null, null]
    });
  });

  it("reads fenced code and chart blocks", () => {
    const blocks = parseMarkdown("```js\nconst a = 1;\n```\n\n" + CHART);
    expect(blocks[0]).to.deep.equal({ type: "code", lang: "js", text: "const a = 1;" });
    expect(blocks[1].type).to.equal("chart");
    expect((blocks[1] as any).spec.series[0].values).to.deep.equal([1.5, 2]);
  });

  it("shows a placeholder while a chart is still streaming", () => {
    const blocks = parseMarkdown('Look:\n\n```chart\n{"type":"bar","lab');
    expect(blocks.map((b) => b.type)).to.deep.equal(["p", "pending"]);
  });

  it("reads nested lists, task lists and wrapped lines", () => {
    const [list] = parseMarkdown(
      "- [x] done\n- [ ] todo\n  - child item\n    continues here"
    ) as any[];
    expect(list.items).to.deep.equal([
      { text: "done", depth: 0, checked: true },
      { text: "todo", depth: 0, checked: false },
      { text: "child item continues here", depth: 1, checked: null }
    ]);
  });

  it("reads rules, table alignment and GitHub callouts", () => {
    const blocks = parseMarkdown(
      "---\n\n| L | C | R |\n|:--|:-:|--:|\n| a | b | c |\n\n> [!WARNING] Heads up\n> Tokens expire."
    ) as any[];
    expect(blocks[0]).to.deep.equal({ type: "hr" });
    expect(blocks[1].align).to.deep.equal(["left", "center", "right"]);
    expect(blocks[2]).to.deep.equal({
      type: "callout",
      kind: "warning",
      title: "Heads up",
      text: "Tokens expire."
    });
  });

  it("turns csv, json, callout and svg fences into their blocks", () => {
    const blocks = parseMarkdown(
      '```csv\nname,note\nAda,"likes, commas"\n```\n\n```json\n{"a":[1,2]}\n```\n\n```callout tip Pro tip\nUse keys.\n```\n\n```svg\n<svg viewBox="0 0 10 10"></svg>\n```'
    ) as any[];
    expect(blocks[0]).to.deep.equal({
      type: "table",
      head: ["name", "note"],
      rows: [["Ada", "likes, commas"]],
      align: [null, null]
    });
    expect(blocks[1].value).to.deep.equal({ a: [1, 2] });
    expect(blocks[2]).to.deep.equal({
      type: "callout",
      kind: "tip",
      title: "Pro tip",
      text: "Use keys."
    });
    expect(blocks[3].type).to.equal("svg");
  });

  it("keeps invalid json and unknown fences as code", () => {
    const blocks = parseMarkdown("```json\n{nope\n```\n\n```order\n{}\n```") as any[];
    expect(blocks.map((b) => [b.type, b.lang])).to.deep.equal([
      ["code", "json"],
      ["code", "order"]
    ]);
  });

  it("groups image lines", () => {
    const [block] = parseMarkdown("![One](https://x.test/1.png)\n![Two]()");
    expect(block).to.deep.equal({
      type: "img",
      images: [
        { alt: "One", src: "https://x.test/1.png" },
        { alt: "Two", src: "" }
      ]
    });
  });
});

describe("parseChart", () => {
  it("rejects anything without a usable series", () => {
    expect(parseChart("not json")).to.equal(null);
    expect(parseChart('{"type":"bar","series":[]}')).to.equal(null);
  });

  it("defaults labels and type", () => {
    const spec = parseChart('{"series":[{"values":[3,4]}]}')!;
    expect(spec.type).to.equal("bar");
    expect(spec.labels).to.deep.equal(["1", "2"]);
    expect(spec.series[0].name).to.equal("Series 1");
  });
});

describe("parseInline", () => {
  it("reads italic, strikethrough and bare links", () => {
    expect(parseInline("*a* _b_ ~~c~~ https://x.test/p.")).to.deep.equal([
      { type: "italic", text: "a" },
      { type: "text", text: " " },
      { type: "italic", text: "b" },
      { type: "text", text: " " },
      { type: "strike", text: "c" },
      { type: "text", text: " " },
      { type: "link", text: "https://x.test/p", href: "https://x.test/p" },
      { type: "text", text: "." }
    ]);
    expect(parseInline("snake_case_name and 2 * 3 * 4")).to.deep.equal([
      { type: "text", text: "snake_case_name and 2 * 3 * 4" }
    ]);
  });

  it("reads bold, code and https links", () => {
    expect(parseInline("A **b** `c` [d](https://e.test)")).to.deep.equal([
      { type: "text", text: "A " },
      { type: "bold", text: "b" },
      { type: "text", text: " " },
      { type: "code", text: "c" },
      { type: "text", text: " " },
      { type: "link", text: "d", href: "https://e.test" }
    ]);
  });

  it("never links a javascript: URL", () => {
    const segments = parseInline("[x](javascript:alert(1))");
    expect(segments.some((s) => s.type === "link")).to.equal(false);
  });

  it("maps citations and drops out-of-range numbers", () => {
    const segments = parseInline("Claim [1, 3] more [9].", 2);
    expect(segments.filter((s) => s.type === "cite")).to.deep.equal([{ type: "cite", n: 1 }]);
  });

  it("keeps citations literal when there are no sources", () => {
    expect(parseInline("Claim [1].", 0)).to.deep.equal([{ type: "text", text: "Claim [1]." }]);
  });

  it("collects every cited number", () => {
    expect([...citedNumbers("a [1] b [2, 3] c [1]")]).to.deep.equal([1, 2, 3]);
  });
});

describe("adaptBlocks (format levels)", () => {
  const blocks = parseMarkdown(
    "Lead **bold**.\n\n" +
      CHART +
      '\n\n![Pic](https://x.test/p.png)\n\n> [!NOTE]\n> Remember.\n\n| A | B |\n|---|---|\n| 1 | 2 |\n\n```json\n{"a":1}\n```\n\n```svg\n<svg viewBox="0 0 1 1"></svg>\n```'
  );
  const types = (level: any) => adaptBlocks(blocks, level).map((b) => b.type);

  it("rich keeps everything", () => {
    expect(adaptBlocks(blocks, "rich")).to.equal(blocks);
  });

  it("advanced keeps tables, json and svg; charts become tables", () => {
    expect(types("advanced")).to.deep.equal(["p", "table", "p", "quote", "table", "json", "svg"]);
    const out = adaptBlocks(blocks, "advanced") as any[];
    expect(out[1].head).to.deep.equal(["Sign-ins", "Rate"]);
    expect(out[1].rows).to.deep.equal([
      ["A", "1.5%"],
      ["B", "2%"]
    ]);
    expect(out[2].text).to.equal("Image: Pic");
    expect(out[3].text).to.equal("**Note** Remember.");
  });

  it("plain is text: tables become rows, data and svg become code", () => {
    expect(types("plain")).to.deep.equal(["p", "raw", "p", "quote", "raw", "code", "code"]);
    const out = adaptBlocks(blocks, "plain") as any[];
    expect(out[1].text).to.contain("A  ·  1.5%");
    expect(out[4].text).to.equal("A  ·  B\n1  ·  2");
  });
});

describe("settleStreaming", () => {
  it("holds back an unfinished table row, link and marker", () => {
    expect(settleStreaming("| a | b |\n| 1 | 2")).to.equal("| a | b |");
    expect(settleStreaming("See [the docs](https://x.te")).to.equal("See ");
    expect(settleStreaming("This is **bol")).to.equal("This is bol");
    expect(settleStreaming("Done **here**.")).to.equal("Done **here**.");
  });

  it("leaves an open code fence alone", () => {
    expect(settleStreaming("```js\nconst a = `x")).to.equal("```js\nconst a = `x");
  });
});

describe("parseDelimited", () => {
  it("handles quotes, escaped quotes, tabs and short rows", () => {
    expect(parseDelimited('a,b\n"x, y","say ""hi"""\n3')).to.deep.equal([
      ["a", "b"],
      ["x, y", 'say "hi"'],
      ["3", ""]
    ]);
    expect(parseDelimited("a\tb\n1\t2", "\t")).to.deep.equal([
      ["a", "b"],
      ["1", "2"]
    ]);
  });
});

describe("svgDataUrl", () => {
  const decode = (url: string) => decodeURIComponent(url.split(",")[1]);

  it("strips scripts, handlers, embedded html and outside references", () => {
    const url = svgDataUrl(
      '<svg viewBox="0 0 10 10" onload="x()"><script>alert(1)</script><foreignObject><div>hi</div></foreignObject>' +
        '<a href="https://evil.test"><rect width="5" height="5" fill="url(https://evil.test/p)" onclick="y()"/></a>' +
        '<image href="https://evil.test/i.png"/><use href="#r"/><style>@import url(https://evil.test/c.css); .a{fill:red}</style></svg>'
    )!;
    const svg = decode(url);
    expect(url.startsWith("data:image/svg+xml")).to.equal(true);
    expect(svg).not.to.match(/script|onload|onclick|foreignObject|evil\.test|@import/i);
    expect(svg).to.contain("<rect");
    expect(svg).to.contain('href="#r"');
    expect(svg).to.contain(".a{fill:red}");
  });

  it("refuses markup that isn't an svg", () => {
    expect(svgDataUrl("<div>no</div>")).to.equal(null);
    expect(svgDataUrl("<svg><unclosed></svg>")).to.equal(null);
  });
});

describe("splitFollowups", () => {
  it("strips a |-separated tail", () => {
    expect(splitFollowups("Answer.\n\nFOLLOWUPS: One? | Two? | Three? | Four?")).to.deep.equal({
      text: "Answer.",
      followups: ["One?", "Two?", "Three?"]
    });
  });

  it("reads one per line with bullets", () => {
    expect(splitFollowups("Answer.\nFollowups:\n- One?\n2. Two?").followups).to.deep.equal([
      "One?",
      "Two?"
    ]);
  });

  it("leaves text without a tail alone", () => {
    expect(splitFollowups(" Just this. ")).to.deep.equal({ text: "Just this.", followups: [] });
  });
});

describe("titles and plain text", () => {
  it("cuts a provisional title at a word boundary", () => {
    const title = provisionalTitle(
      "How do I rotate refresh tokens safely in a browser application today?"
    );
    expect(title.length).to.be.at.most(48);
    expect(title.endsWith(" ")).to.equal(false);
    expect(title).to.equal("How do I rotate refresh tokens safely in a");
  });

  it("cleans a model-written title", () => {
    expect(cleanTitle('"Rotating refresh tokens."\nmore')).to.equal("Rotating refresh tokens");
    expect(cleanTitle("Title: Budget plan")).to.equal("Budget plan");
  });

  it("flattens markdown for snippets", () => {
    expect(plainText("**Hi** [1] `x`\n\n```chart\n{}\n```")).to.equal("Hi x [Chart]");
  });

  it("allows only safe URL schemes", () => {
    expect(isSafeUrl("https://a.test")).to.equal(true);
    expect(isSafeUrl("javascript:alert(1)")).to.equal(false);
    expect(isSafeUrl("data:image/png;base64,AA")).to.equal(false);
    expect(isSafeUrl("data:image/png;base64,AA", true)).to.equal(true);
  });
});
