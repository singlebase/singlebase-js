import { expect } from "@open-wc/testing";
import {
  adaptBlocks,
  citedNumbers,
  cleanTitle,
  isSafeUrl,
  parseChart,
  parseInline,
  parseMarkdown,
  plainText,
  provisionalTitle,
  splitFollowups
} from "../src/utils/markdown.js";

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
    expect(blocks[5]).to.deep.equal({ type: "table", head: ["A", "B"], rows: [["1", "2"]] });
  });

  it("reads fenced code and chart blocks", () => {
    const blocks = parseMarkdown("```js\nconst a = 1;\n```\n\n" + CHART);
    expect(blocks[0]).to.deep.equal({ type: "code", lang: "js", text: "const a = 1;" });
    expect(blocks[1].type).to.equal("chart");
    expect((blocks[1] as any).spec.series[0].values).to.deep.equal([1.5, 2]);
  });

  it("shows a placeholder while a chart is still streaming", () => {
    const blocks = parseMarkdown('Look:\n\n```chart\n{"type":"bar","lab');
    expect(blocks.map((b) => b.type)).to.deep.equal(["p", "chartPending"]);
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

describe("adaptBlocks (render-as)", () => {
  const blocks = parseMarkdown("Lead **bold**.\n\n" + CHART + "\n\n![Pic](https://x.test/p.png)");

  it("rich keeps everything", () => {
    expect(adaptBlocks(blocks, "rich")).to.equal(blocks);
  });

  it("markdown turns charts into tables and images into text", () => {
    const out = adaptBlocks(blocks, "markdown");
    expect(out.map((b) => b.type)).to.deep.equal(["p", "p", "table", "p"]);
    expect((out[1] as any).text).to.equal("**Sign-ins**");
    expect((out[2] as any).rows).to.deep.equal([
      ["A", "1.5%"],
      ["B", "2%"]
    ]);
    expect((out[3] as any).text).to.equal("Image: Pic");
  });

  it("text flattens to one plain block", () => {
    const [out] = adaptBlocks(blocks, "text") as any[];
    expect(out.type).to.equal("raw");
    expect(out.text).to.contain("Lead bold.");
    expect(out.text).to.contain("A  ·  1.5%");
    expect(out.text).to.contain("Image: Pic");
    expect(out.text).not.to.contain("**");
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
