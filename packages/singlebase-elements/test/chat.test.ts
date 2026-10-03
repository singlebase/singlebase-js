import { fixture, html, expect, aTimeout } from "@open-wc/testing";
import "../src/elements/chat.js";
import "../src/elements/uploader.js";
import type { SinglebaseChat } from "../src/elements/chat.js";

type Call = { method: string; payload: any };

/**
 * An `llm` service that records every call. `handlers` overrides a method;
 * a handler that throws becomes a rejected call.
 */
function llmClient(handlers: Record<string, (payload: any, n: number) => any> = {}) {
  const calls: Call[] = [];
  let turns = 0;
  const defaults: Record<string, (payload: any) => any> = {
    chat: (payload) => {
      turns += 1;
      return {
        _id: payload._id ?? "c1",
        title: payload.title ?? null,
        bookmarked: false,
        message: {
          _id: `a${turns}`,
          role: "assistant",
          content: "Hello **there**.\n\nFOLLOWUPS: First? | Second? | Third?",
          reply_to: `u${turns}`,
          sources: []
        }
      };
    },
    list_chats: () => ({ items: [] }),
    generate: () => ({ result: '"A tidy title."' })
  };
  return {
    calls,
    llm: {
      async call(method: string, payload: any = {}) {
        calls.push({ method, payload });
        const handler = handlers[method] ?? defaults[method];
        return handler ? handler(payload, turns) : {};
      }
    }
  };
}

async function mount(template: unknown, client: unknown) {
  const el = await fixture<SinglebaseChat>(template as never);
  el.client = client as never;
  await el.updateComplete;
  return el;
}

async function until(check: () => boolean, ms = 3000) {
  const start = Date.now();
  while (!check()) {
    if (Date.now() - start > ms) throw new Error("timed out");
    await aTimeout(20);
  }
}

const $ = (el: SinglebaseChat, selector: string) =>
  el.shadowRoot!.querySelector<HTMLElement>(selector);
const $$ = (el: SinglebaseChat, selector: string) =>
  Array.from(el.shadowRoot!.querySelectorAll<HTMLElement>(selector));
const settled = (el: SinglebaseChat) => () => {
  const last = el.thread[el.thread.length - 1];
  return !!last && last.role === "assistant" && (last.phase === "done" || last.phase === "error");
};

describe("<singlebase-chat> conversation", () => {
  it("creates the chat on the first message, then continues it with _id", async () => {
    const client = llmClient();
    const el = await mount(html`<singlebase-chat></singlebase-chat>`, client);

    await el.send("How do refresh tokens work?");
    await until(settled(el));

    const first = client.calls.find((c) => c.method === "chat")!;
    expect(first.payload._id).to.equal(undefined);
    expect(first.payload.title).to.equal("How do refresh tokens work?");
    expect(first.payload.format).to.equal("markdown");
    expect(first.payload.system_message).to.contain("FOLLOWUPS:");
    expect(el.chatId).to.equal("c1");
    expect(el.thread[0].id).to.equal("u1");
    expect(el.thread[1].id).to.equal("a1");
    expect(el.thread[1].content).to.equal("Hello **there**.");
    expect(el.thread[1].followups).to.deep.equal(["First?", "Second?", "Third?"]);

    await el.send("And rotation?");
    await until(() => el.thread.length === 4 && settled(el)());
    const second = client.calls.filter((c) => c.method === "chat")[1];
    expect(second.payload._id).to.equal("c1");
    expect(second.payload.system_message).to.equal(undefined);
    expect(second.payload.title).to.equal(undefined);
  });

  it("renders the reply as markup-free blocks and shows follow-ups for the latest reply", async () => {
    const el = await mount(html`<singlebase-chat></singlebase-chat>`, llmClient());
    await el.send("Hi");
    await until(settled(el));
    await el.updateComplete;

    expect($(el, ".answer strong")!.textContent).to.equal("there");
    const followups = $$(el, ".followup span:last-child").map((b) => b.textContent);
    expect(followups).to.deep.equal(["First?", "Second?", "Third?"]);
  });

  it("retitles a new chat with llm.generate and saves it with llm.update_chat", async () => {
    const client = llmClient();
    const el = await mount(html`<singlebase-chat></singlebase-chat>`, client);
    const titles: any[] = [];
    el.addEventListener("singlebase-chat-title", (e) => titles.push((e as CustomEvent).detail));

    await el.send("Plan a budget");
    await until(() => client.calls.some((c) => c.method === "update_chat"));
    await el.updateComplete;

    // Helpers never add turns to the conversation.
    expect(client.calls.filter((c) => c.method === "chat")).to.have.length(1);
    const update = client.calls.find((c) => c.method === "update_chat")!;
    expect(update.payload).to.deep.equal({ _id: "c1", title: "A tidy title" });
    expect($(el, ".title")!.textContent!.trim()).to.equal("A tidy title");
    expect(titles[0]).to.deep.equal({ chatId: "c1", title: "A tidy title", auto: true });
  });

  it("drops a stale chat id on NOT_FOUND and offers a retry", async () => {
    let fail = false;
    const client = llmClient({
      chat: (payload, n) => {
        if (fail) throw Object.assign(new Error("NOT_FOUND"), { details: { status: 404 } });
        return {
          _id: payload._id ?? "c1",
          title: "t",
          message: { _id: `a${n}`, content: "ok", reply_to: `u${n}` }
        };
      }
    });
    const el = await mount(html`<singlebase-chat auto-title="false"></singlebase-chat>`, client);
    const errors: any[] = [];
    el.addEventListener("singlebase-chat-error", (e) => errors.push((e as CustomEvent).detail));

    await el.send("one");
    await until(settled(el));
    fail = true;
    await el.send("two");
    await until(settled(el));
    await el.updateComplete;

    expect(el.chatId).to.equal(null);
    expect($(el, ".error-card")).to.exist;
    expect(errors[0].code).to.equal("NOT_FOUND");

    fail = false;
    ($(el, ".error-card button") as HTMLButtonElement).click();
    await until(() => el.thread.length === 4 && settled(el)());
    const retried = client.calls.filter((c) => c.method === "chat").at(-1)!;
    expect(retried.payload.message).to.equal("two");
    expect(retried.payload._id).to.equal(undefined);
  });

  it("stops waiting on a reply", async () => {
    const el = await mount(
      html`<singlebase-chat></singlebase-chat>`,
      llmClient({ chat: () => new Promise(() => {}) })
    );
    void el.send("slow");
    await el.updateComplete;
    expect($(el, ".pill")).to.exist;

    ($(el, ".send.stop") as HTMLButtonElement).click();
    await el.updateComplete;

    const last = el.thread[el.thread.length - 1];
    expect(last.stopped).to.equal(true);
    expect($(el, ".send.stop")).to.equal(null);
    expect($(el, ".toolbar .note")!.textContent).to.equal("Stopped");
  });

  it("regenerates by deleting the last exchange and asking again", async () => {
    const client = llmClient();
    const el = await mount(html`<singlebase-chat auto-title="false"></singlebase-chat>`, client);
    await el.send("Question");
    await until(settled(el));
    await el.updateComplete;

    ($(el, 'button[aria-label="Regenerate"]') as HTMLButtonElement).click();
    await until(
      () => client.calls.filter((c) => c.method === "chat").length === 2 && settled(el)()
    );

    const deletes = client.calls
      .filter((c) => c.method === "delete_chat_message")
      .map((c) => c.payload);
    expect(deletes).to.deep.equal([
      { _id: "c1", message_id: "u1" },
      { _id: "c1", message_id: "a1" }
    ]);
    expect(el.thread).to.have.length(2);
    expect(el.thread[0].content).to.equal("Question");
  });
});

describe("<singlebase-chat> sources", () => {
  const sources = [
    {
      title: "One-time codes",
      content: "Codes expire after 10 minutes.",
      score: 0.86,
      path: "help/codes"
    },
    { name: "Rate limits", text: "Three per minute." }
  ];

  it("turns [n] into chips, drops unknown numbers and opens the source panel", async () => {
    const client = llmClient({
      chat: () => ({
        _id: "c1",
        title: "t",
        message: {
          _id: "a1",
          reply_to: "u1",
          content: "Codes expire [1]. Limits apply [2, 7].",
          sources
        }
      })
    });
    const el = await mount(
      html`<singlebase-chat mode="rag" auto-title="false"></singlebase-chat>`,
      client
    );
    await el.send("How long are codes valid?");
    await until(settled(el));
    await el.updateComplete;

    const chips = $$(el, ".cite");
    expect(chips.map((c) => c.textContent)).to.deep.equal(["1", "2"]);
    expect($$(el, ".source-card")).to.have.length(2);

    chips[0].click();
    await el.updateComplete;
    expect($(el, ".panel h3")!.textContent).to.equal("One-time codes");
    expect($(el, ".panel .path")!.textContent).to.equal("help/codes");
    expect($(el, ".panel .meta")!.textContent).to.contain("Relevance 0.86");
    expect($(el, ".chip")!.textContent).to.contain("Rate limits");
  });

  it("sends the retrieval attribute with every turn", async () => {
    const client = llmClient();
    const el = await mount(
      html`<singlebase-chat
        mode="rag"
        auto-title="false"
        retrieval='[{"type":"kdb","namespace":"docs"}]'
      ></singlebase-chat>`,
      client
    );
    await el.send("q");
    await until(settled(el));
    expect(client.calls.find((c) => c.method === "chat")!.payload.retrieval).to.deep.equal([
      { type: "kdb", namespace: "docs" }
    ]);
  });

  it("attaches text files as retrieval for that turn only", async () => {
    const client = llmClient();
    const el = await mount(
      html`<singlebase-chat attachments-mode="retrieval" auto-title="false"></singlebase-chat>`,
      client
    );
    await (el as any).addFiles([
      new File(["# Notes\nhello"], "notes.md", { type: "text/markdown" }),
      new File(["a,b\n1,2"], "data.csv", { type: "text/csv" }),
      new File([new Uint8Array(4)], "photo.png", { type: "image/png" })
    ]);
    await el.updateComplete;
    expect($$(el, ".pending-file")).to.have.length(2);

    await el.send("Use these");
    await until(settled(el));
    const payload = client.calls.find((c) => c.method === "chat")!.payload;
    expect(payload.retrieval).to.deep.equal([
      { source: "csv", data: "a,b\n1,2" },
      { source: "docs", payload: { documents: [{ title: "notes.md", content: "# Notes\nhello" }] } }
    ]);
    expect(payload.metadata).to.deep.equal({ attachments: ["notes.md", "data.csv"] });

    await el.send("Next");
    await until(() => el.thread.length === 4 && settled(el)());
    expect(client.calls.filter((c) => c.method === "chat")[1].payload.retrieval).to.equal(
      undefined
    );
  });
});

describe("<singlebase-chat> knowledge and service features", () => {
  const chatPayloads = (client: ReturnType<typeof llmClient>) =>
    client.calls.filter((c) => c.method === "chat").map((c) => c.payload);

  it("sends the mode on every turn; kb gets its own welcome and strict instructions", async () => {
    const client = llmClient();
    const el = await mount(
      html`<singlebase-chat mode="kb" auto-title="false"></singlebase-chat>`,
      client
    );
    expect($(el, ".welcome h2")!.textContent).to.equal("Ask the knowledge base");
    expect(($(el, "textarea.input") as HTMLTextAreaElement).placeholder).to.equal(
      "Ask the knowledge base…"
    );

    await el.send("Where is the refund policy?");
    await until(settled(el));
    await el.send("And for annual plans?");
    await until(() => el.thread.length === 4 && settled(el)());
    const [first, second] = chatPayloads(client);
    expect(first.mode).to.equal("kb");
    expect(second.mode).to.equal("kb");
    expect(first.system_message).to.contain("Do not use outside knowledge");
  });

  it("explains a kb chat with no knowledge source", async () => {
    const client = llmClient({
      chat: () => {
        throw Object.assign(new Error("KB_SOURCE_REQUIRED"), {
          code: "KB_SOURCE_REQUIRED",
          status: 422
        });
      }
    });
    const el = await mount(html`<singlebase-chat mode="kb"></singlebase-chat>`, client);
    const errors: any[] = [];
    el.addEventListener("singlebase-chat-error", (e) => errors.push((e as CustomEvent).detail));
    await el.send("hello");
    await until(settled(el));
    await el.updateComplete;
    expect($(el, ".error-card")!.textContent).to.contain("No knowledge base is set up");
    expect(errors[0].code).to.equal("KB_SOURCE_REQUIRED");
  });

  it("docsets become a docset retrieval source, ahead of the retrieval option", async () => {
    const client = llmClient();
    const el = await mount(
      html`<singlebase-chat
        docsets="support, billing support"
        retrieval='[{"type":"kdb","namespace":"faq"}]'
        auto-title="false"
      ></singlebase-chat>`,
      client
    );
    await el.send("q");
    await until(settled(el));
    expect(chatPayloads(client)[0].retrieval).to.deep.equal([
      { source: "docset", ids: ["support", "billing"] },
      { type: "kdb", namespace: "faq" }
    ]);

    el.configure({ docsets: ["one"] });
    await el.send("again");
    await until(() => el.thread.length === 4 && settled(el)());
    expect(chatPayloads(client)[1].retrieval[0]).to.deep.equal({ source: "docset", ids: ["one"] });
  });

  it("uses the service's source numbers and sections", async () => {
    const client = llmClient({
      chat: () => ({
        _id: "c1",
        message: {
          _id: "a1",
          reply_to: "u1",
          content: "Codes last 10 minutes [2].",
          sources: [
            {
              n: 2,
              source: "kdb",
              type: "kdb",
              title: "Codes",
              section: "Expiry",
              content: "Ten minutes.",
              collection: "help"
            }
          ]
        }
      })
    });
    const el = await mount(
      html`<singlebase-chat mode="rag" auto-title="false"></singlebase-chat>`,
      client
    );
    await el.send("q");
    await until(settled(el));
    await el.updateComplete;
    const chip = $(el, ".cite") as HTMLButtonElement;
    expect(chip.textContent).to.equal("2");
    expect($(el, ".source-card .t")!.textContent).to.equal("Codes · Expiry");
    chip.click();
    await el.updateComplete;
    expect($(el, ".panel h3")!.textContent).to.equal("Codes");
    expect($(el, ".panel .meta")!.textContent).to.equal("Expiry");
    expect($(el, ".panel .path")).to.equal(null); // "kdb" is the kind, not a path
  });

  it("attachments-mode=payload sends files as attachments and shows what the chat keeps", async () => {
    const client = llmClient({
      chat: (p) => ({
        _id: "c1",
        message: { _id: "a1", reply_to: "u1", content: "ok" },
        attachments: (p.attachments ?? []).map((a: any, i: number) =>
          a.name === "bad.txt"
            ? {
                type: "content",
                name: a.name,
                saved: false,
                status: "failed",
                error: "ATTACHMENT_TOO_LARGE"
              }
            : { _id: `f${i}`, type: "content", name: a.name, saved: true, status: "ready" }
        )
      }),
      get_chat: () => ({
        _id: "c1",
        title: "t",
        messages: [],
        attachments: [
          { _id: "f0", type: "content", name: "notes.md", saved: true, status: "ready" }
        ]
      })
    });
    const el = await mount(
      html`<singlebase-chat attachments-mode="payload" auto-title="false"></singlebase-chat>`,
      client
    );
    await (el as any).addFiles([
      new File(["# hi"], "notes.md", { type: "text/markdown" }),
      new File(["x"], "bad.txt", { type: "text/plain" })
    ]);
    await el.send("Read these");
    await until(settled(el));
    await el.updateComplete;

    const payload = chatPayloads(client)[0];
    expect(payload.retrieval).to.equal(undefined);
    expect(payload.metadata).to.equal(undefined);
    expect(payload.attachments).to.deep.equal([
      {
        type: "content",
        content: "# hi",
        name: "notes.md",
        mime: "text/markdown",
        size: 4,
        save_attachment: true
      },
      {
        type: "content",
        content: "x",
        name: "bad.txt",
        mime: "text/plain",
        size: 1,
        save_attachment: true
      }
    ]);
    expect(el.attachments.map((a) => a.name)).to.deep.equal(["notes.md"]);
    expect($(el, ".pending-file.kept .size")!.textContent).to.equal("In this chat");
    expect($(el, ".toast")!.textContent).to.contain("Couldn't read bad.txt");

    // later turns don't resend the file
    await el.send("And then?");
    await until(() => el.thread.length === 4 && settled(el)());
    expect(chatPayloads(client)[1].attachments).to.equal(undefined);

    // removing asks the service
    ($(el, 'button[aria-label="Remove from this chat"]') as HTMLButtonElement).click();
    await el.updateComplete;
    expect(el.attachments).to.have.length(0);
    expect(client.calls.find((c) => c.method === "remove_chat_attachment")!.payload).to.deep.equal({
      _id: "c1",
      attachment_id: "f0"
    });

    // reopening a chat lists what it keeps; a new chat starts empty
    await el.openChat("c1");
    await el.updateComplete;
    expect(el.attachments.map((a) => a.id)).to.deep.equal(["f0"]);
    el.newChat();
    expect(el.attachments).to.have.length(0);
  });

  it("save-attachments=false sends files for this turn only", async () => {
    const client = llmClient();
    const el = await mount(
      html`<singlebase-chat
        attachments-mode="payload"
        save-attachments="false"
        auto-title="false"
      ></singlebase-chat>`,
      client
    );
    await (el as any).addFiles([new File(["x"], "a.txt", { type: "text/plain" })]);
    await el.send("q");
    await until(settled(el));
    expect(chatPayloads(client)[0].attachments[0].save_attachment).to.equal(false);
  });
});

describe("<singlebase-chat> format levels", () => {
  const reply = [
    "Lead.",
    '```chart\n{"type":"bar","title":"Share","labels":["A","B"],"series":[{"name":"n","values":[3,1]}]}\n```',
    "> [!TIP]\n> Sort by clicking a header.",
    "| Name | Qty |\n|---|---|\n| b | 10 |\n| a | 9 |",
    '```json\n{"ok":true}\n```',
    '```svg\n<svg viewBox="0 0 10 10"><circle cx="5" cy="5" r="4"/></svg>\n```',
    '```order\n{"id":"A-1"}\n```'
  ].join("\n\n");
  const client = () =>
    llmClient({
      chat: () => ({ _id: "c1", message: { _id: "a1", reply_to: "u1", content: reply } })
    });
  const open = async (level?: string) => {
    const el = await mount(
      level
        ? html`<singlebase-chat format=${level} auto-title="false"></singlebase-chat>`
        : html`<singlebase-chat auto-title="false"></singlebase-chat>`,
      client()
    );
    el.renderers = { order: (source) => html`<b class="order">Order ${JSON.parse(source).id}</b>` };
    await el.send("show me");
    await until(settled(el));
    await el.updateComplete;
    return el;
  };

  it("rich draws everything, including the host's own blocks", async () => {
    const el = await open("rich");
    expect($$(el, ".bar-row")).to.have.length(2);
    expect($(el, ".callout.tip .callout-title")!.textContent!.trim()).to.equal("Tip");
    expect($(el, ".jtree")).to.exist;
    expect($(el, "figure.svg img")!.getAttribute("src")!.startsWith("data:image/svg+xml")).to.equal(
      true
    );
    expect($(el, ".custom-block .order")!.textContent).to.equal("Order A-1");
  });

  it("advanced (the default) keeps tables, json and svg, but not charts, callouts or host blocks", async () => {
    const el = await open();
    expect(el.format).to.equal("advanced");
    expect($(el, ".bar-row")).to.equal(null);
    expect($(el, ".callout")).to.equal(null);
    expect($(el, ".quote")!.textContent).to.contain("Tip");
    expect($(el, ".jtree")).to.exist;
    expect($(el, "figure.svg")).to.exist;
    expect($(el, ".custom-block")).to.equal(null);
    expect($$(el, ".code .label").map((l) => l.textContent)).to.include("order");
  });

  it("plain shows text only", async () => {
    const el = await open("plain");
    expect($(el, "table")).to.equal(null);
    expect($(el, ".jtree")).to.equal(null);
    expect($(el, "figure.svg")).to.equal(null);
    expect($(el, ".answer .raw")!.textContent).to.contain("A  ·  3");
  });

  it("allow-raw adds a per-reply toggle to the text as written", async () => {
    const c = llmClient({
      chat: () => ({ _id: "c1", message: { _id: "a1", reply_to: "u1", content: "Hi **there**" } })
    });
    const plain = await mount(html`<singlebase-chat auto-title="false"></singlebase-chat>`, c);
    await plain.send("x");
    await until(settled(plain));
    await plain.updateComplete;
    expect($(plain, 'button[aria-label="View raw"]')).to.equal(null); // off by default

    const el = await mount(
      html`<singlebase-chat allow-raw auto-title="false"></singlebase-chat>`,
      c
    );
    await el.send("x");
    await until(settled(el));
    await el.updateComplete;
    const toggle = $(el, 'button[aria-label="View raw"]') as HTMLButtonElement;
    toggle.click();
    await el.updateComplete;
    expect($(el, ".answer .raw")!.textContent).to.equal("Hi **there**");
    expect(toggle.getAttribute("aria-pressed")).to.equal("true");
    toggle.click();
    await el.updateComplete;
    expect($(el, ".answer strong")!.textContent).to.equal("there");
  });

  it("raw shows the reply exactly as written", async () => {
    const el = await open("raw");
    const raw = $(el, ".answer .raw")!.textContent!;
    expect(raw).to.contain("```chart");
    expect(raw).to.contain("> [!TIP]");
    expect($(el, "table")).to.equal(null);
    expect($(el, ".cite")).to.equal(null);
  });

  it("sorts a table by a column, then reverses, then restores", async () => {
    const el = await open("advanced");
    const table = $$(el, ".table").find((t) => t.textContent!.includes("Qty"))!;
    const first = () => table.querySelector("tbody td")!.textContent!.trim();
    const header = () => table.querySelectorAll<HTMLButtonElement>("th button.sort")[1];

    expect(first()).to.equal("b");
    header().click();
    await el.updateComplete;
    expect(first()).to.equal("a"); // 9 before 10: numeric, not text
    header().click();
    await el.updateComplete;
    expect(first()).to.equal("b");
    header().click();
    await el.updateComplete;
    expect(first()).to.equal("b");
    expect(table.querySelector("th[aria-sort=ascending], th[aria-sort=descending]")).to.equal(null);
    // numbers right-align on their own
    expect(table.querySelectorAll("td")[1].getAttribute("style")).to.contain("right");
  });

  it("tells the model what it may write, per level", async () => {
    const payloads: any[] = [];
    for (const level of ["plain", "rich"]) {
      const c = llmClient();
      const el = await mount(
        html`<singlebase-chat format=${level} auto-title="false"></singlebase-chat>`,
        c
      );
      await el.send("hi");
      await until(settled(el));
      payloads.push(c.calls.find((x) => x.method === "chat")!.payload.system_message);
    }
    expect(payloads[0]).to.contain("Don't use tables, charts");
    expect(payloads[1]).to.contain('fenced "chart" block');
    expect(payloads[1]).to.contain("[!NOTE]");
  });
});

describe("<singlebase-chat> history", () => {
  it("lists chats in the sidebar with bookmarked ones pinned", async () => {
    const now = new Date().toISOString();
    const client = llmClient({
      list_chats: () => ({
        items: [
          { _id: "c1", title: "Recent", _modified_at: now },
          { _id: "c2", title: "Pinned", bookmarked: true, _modified_at: now }
        ]
      })
    });
    const el = await mount(html`<singlebase-chat sidebar></singlebase-chat>`, client);
    await until(() => $$(el, ".thread-title").length === 2);

    expect($$(el, ".group").map((g) => g.textContent)).to.deep.equal(["Bookmarked", "Today"]);
    expect($$(el, ".thread-title").map((t) => t.textContent)).to.deep.equal(["Pinned", "Recent"]);
    expect(client.calls.find((c) => c.method === "list_chats")!.payload).to.deep.equal({
      limit: 100
    });
  });

  it("opening or messaging a chat never reorders the list", async () => {
    const old = new Date(Date.now() - 3 * 86_400_000).toISOString();
    const client = llmClient({
      list_chats: () => ({
        items: [
          { _id: "c1", title: "First", _modified_at: old },
          { _id: "c2", title: "Second", _modified_at: old },
          { _id: "c3", title: "Third", _modified_at: old }
        ]
      }),
      get_chat: (p) => ({
        _id: p._id,
        title: "Third",
        _modified_at: new Date().toISOString(),
        messages: []
      }),
      chat: (p) => ({ _id: p._id, message: { _id: "a1", reply_to: "u1", content: "ok" } })
    });
    const el = await mount(
      html`<singlebase-chat sidebar auto-title="false"></singlebase-chat>`,
      client
    );
    const order = () => $$(el, ".thread-title").map((t) => t.textContent);
    await until(() => order().length === 3);

    await el.openChat("c3");
    await el.send("hello");
    await until(settled(el));
    await el.updateComplete;
    // opening a chat closes a drawer-style list; open it again to look
    ($(el, 'button[aria-label="Show chats"]') as HTMLButtonElement | null)?.click();
    await el.updateComplete;
    expect(el.chats.map((c) => c.title)).to.deep.equal(["First", "Second", "Third"]);
    expect(order()).to.deep.equal(["First", "Second", "Third"]);
    expect($$(el, ".group").map((g) => g.textContent)).to.deep.equal(["Previous 7 days"]);
  });

  it("opens a saved chat and hides system messages", async () => {
    const client = llmClient({
      get_chat: () => ({
        _id: "c9",
        title: "Saved",
        bookmarked: true,
        messages: [
          { _id: "s", role: "system", content: "secret instructions" },
          { _id: "u", role: "user", content: "Hi" },
          { _id: "a", role: "assistant", content: "Hello\n\nFOLLOWUPS: More?" }
        ]
      })
    });
    const el = await mount(html`<singlebase-chat></singlebase-chat>`, client);
    await el.openChat("c9");
    await el.updateComplete;

    expect(el.chatId).to.equal("c9");
    expect(el.thread.map((m) => m.role)).to.deep.equal(["user", "assistant"]);
    expect(el.shadowRoot!.textContent).not.to.contain("secret instructions");
    expect($(el, ".title")!.textContent!.trim()).to.equal("Saved");
    expect(el.thread[1].followups).to.deep.equal(["More?"]);
  });

  it("renames from the header", async () => {
    const client = llmClient({
      get_chat: () => ({ _id: "c9", title: "Old", messages: [] })
    });
    const el = await mount(html`<singlebase-chat></singlebase-chat>`, client);
    await el.openChat("c9");
    await el.updateComplete;

    ($(el, ".title") as HTMLButtonElement).click();
    await el.updateComplete;
    const input = $(el, ".title-input") as HTMLInputElement;
    input.value = "New name";
    input.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter" }));
    await el.updateComplete;

    expect(client.calls.find((c) => c.method === "update_chat")!.payload).to.deep.equal({
      _id: "c9",
      title: "New name"
    });
    expect($(el, ".title")!.textContent!.trim()).to.equal("New name");
  });

  it("deletes a message with undo, and only calls the server once the toast ends", async () => {
    const client = llmClient();
    const el = await mount(html`<singlebase-chat auto-title="false"></singlebase-chat>`, client);
    await el.send("keep me");
    await until(settled(el));
    await el.updateComplete;

    ($$(el, 'button[aria-label="Delete message"]')[0] as HTMLButtonElement).click();
    await el.updateComplete;
    expect(el.thread).to.have.length(1);
    ($(el, ".toast button") as HTMLButtonElement).click();
    await el.updateComplete;
    expect(el.thread).to.have.length(2);
    expect(client.calls.some((c) => c.method === "delete_chat_message")).to.equal(false);

    ($$(el, 'button[aria-label="Delete message"]')[0] as HTMLButtonElement).click();
    await el.updateComplete;
    el.remove(); // leaving the page commits the pending delete
    expect(client.calls.find((c) => c.method === "delete_chat_message")!.payload).to.deep.equal({
      _id: "c1",
      message_id: "u1"
    });
  });

  it("bookmarks a message through llm.bookmark_chat_message", async () => {
    const client = llmClient();
    const el = await mount(html`<singlebase-chat auto-title="false"></singlebase-chat>`, client);
    await el.send("save this");
    await until(settled(el));
    await el.updateComplete;

    ($$(el, 'button[aria-label="Bookmark message"]')[1] as HTMLButtonElement).click();
    await el.updateComplete;
    expect(client.calls.find((c) => c.method === "bookmark_chat_message")!.payload).to.deep.equal({
      _id: "c1",
      message_id: "a1",
      bookmarked: true
    });
    expect($(el, ".saved")).to.exist;
  });
});

describe("<singlebase-chat> sidebar and radius", () => {
  it('sidebar="none" removes the list, its toggle and the list call', async () => {
    const client = llmClient();
    const el = await mount(
      html`<singlebase-chat sidebar="none" auto-title="false"></singlebase-chat>`,
      client
    );
    await aTimeout(50);
    await el.updateComplete;

    expect($(el, ".sidebar")).to.equal(null);
    expect($(el, 'button[aria-label="Show chats"]')).to.equal(null);
    expect(client.calls.some((c) => c.method === "list_chats")).to.equal(false);

    // With no list, the header carries New chat.
    await el.send("hi");
    await until(settled(el));
    await el.updateComplete;
    ($(el, 'button[aria-label="New chat"]') as HTMLButtonElement).click();
    await el.updateComplete;
    expect(el.chatId).to.equal(null);
    expect(el.thread).to.have.length(0);
  });

  it('sidebar="closed" starts closed but keeps the toggle', async () => {
    const el = await mount(html`<singlebase-chat sidebar="closed"></singlebase-chat>`, llmClient());
    await aTimeout(50);
    await el.updateComplete;
    expect($(el, ".sidebar")).to.equal(null);
    ($(el, 'button[aria-label="Show chats"]') as HTMLButtonElement).click();
    await el.updateComplete;
    expect($(el, ".sidebar")).to.exist;
  });

  it("radius scales only the element that carries it", async () => {
    const wrap = await fixture<HTMLDivElement>(
      html`<div>
        <singlebase-chat radius="round"></singlebase-chat>
        <singlebase-uploader></singlebase-uploader>
      </div>`
    );
    const chat = wrap.querySelector("singlebase-chat")!;
    const uploader = wrap.querySelector("singlebase-uploader")!;
    await chat.updateComplete;
    const scale = (el: Element) =>
      getComputedStyle(el).getPropertyValue("--sb-radius-scale").trim();
    expect(scale(chat)).to.equal("1.8");
    expect(scale(uploader)).to.equal("");
    const composer = chat.shadowRoot!.querySelector(".composer")!;
    // 4px × 1.8 × 2.25
    expect(getComputedStyle(composer).borderTopLeftRadius).to.equal("16.2px");
  });

  it("a page-wide scale reaches every element without the attribute", async () => {
    const wrap = await fixture<HTMLDivElement>(
      html`<div style="--sb-radius-scale: 0.35">
        <singlebase-chat></singlebase-chat>
        <singlebase-chat radius="default"></singlebase-chat>
      </div>`
    );
    const [inherits, own] = Array.from(wrap.querySelectorAll("singlebase-chat"));
    await (inherits as any).updateComplete;
    await (own as any).updateComplete;
    const corner = (el: Element) =>
      getComputedStyle(el.shadowRoot!.querySelector(".composer")!).borderTopLeftRadius;
    expect(corner(inherits)).to.equal("3.15px");
    expect(corner(own)).to.equal("9px");
  });
});

describe("<singlebase-chat> embeds and config", () => {
  it("launcher opens and closes a dialog panel", async () => {
    const el = await mount(
      html`<singlebase-chat embed="launcher" unread-badge></singlebase-chat>`,
      llmClient()
    );
    expect($(el, '[role="dialog"]')).to.equal(null);
    expect($(el, ".badge")).to.exist;

    ($(el, ".launcher-btn") as HTMLButtonElement).click();
    await el.updateComplete;
    expect($(el, '[role="dialog"]')).to.exist;
    expect($(el, ".badge")).to.equal(null);

    ($(el, 'button[aria-label="Minimize chat"]') as HTMLButtonElement).click();
    await el.updateComplete;
    expect($(el, '[role="dialog"]')).to.equal(null);
  });

  it("shows the greeting bubble after a moment", async () => {
    const el = await mount(
      html`<singlebase-chat
        embed="launcher"
        greeting-bubble
        bubble-text="Need help?"
      ></singlebase-chat>`,
      llmClient()
    );
    expect($(el, ".bubble")).to.equal(null);
    await aTimeout(1300);
    await el.updateComplete;
    expect($(el, ".bubble-text")!.textContent!.trim()).to.equal("Need help?");
  });

  it("inline expands to fill the window", async () => {
    const el = await mount(html`<singlebase-chat embed="inline"></singlebase-chat>`, llmClient());
    ($(el, 'button[aria-label="Expand"]') as HTMLButtonElement).click();
    await el.updateComplete;
    expect($(el, ".frame")!.classList.contains("expanded")).to.equal(true);
  });

  it("applies a config object and uses custom prompts", async () => {
    const el = await mount(html`<singlebase-chat></singlebase-chat>`, llmClient());
    el.config = {
      mode: "rag",
      prompts: ["Chart my sales"],
      assistantName: "Ada",
      branding: false
    };
    await el.updateComplete;

    expect(el.mode).to.equal("rag");
    expect($$(el, ".prompt-text").map((p) => p.textContent)).to.deep.equal(["Chart my sales"]);
    expect($(el, ".branding")).to.equal(null);
    expect(el.config.assistantName).to.equal("Ada");
  });

  it("takes the client and a chat to open through config", async () => {
    const client = llmClient({
      get_chat: () => ({ _id: "c7", title: "From config", messages: [] })
    });
    const el = await fixture<SinglebaseChat>(html`<singlebase-chat></singlebase-chat>`);
    el.config = {
      client,
      chatId: "c7",
      format: "rich",
      allowRaw: true,
      sidebar: "none",
      radius: "round"
    };
    await until(() => el.chatId === "c7" && !!$(el, ".title"));
    await el.updateComplete;
    expect($(el, ".title")!.textContent!.trim()).to.equal("From config");
    expect(el.config).to.include({
      chatId: "c7",
      format: "rich",
      allowRaw: true,
      sidebar: "none",
      radius: "round"
    });
    expect(el.config.client).to.equal(client);
  });

  it("configure() changes settings on the fly and keeps the conversation", async () => {
    const el = await mount(
      html`<singlebase-chat auto-title="false"></singlebase-chat>`,
      llmClient()
    );
    await el.send("keep this");
    await until(settled(el));

    const returned = el.configure({ theme: "dark", format: "plain", sidebar: "none" });
    await el.updateComplete;

    expect(returned).to.equal(el);
    expect(el.getAttribute("theme")).to.equal("dark");
    expect(el.format).to.equal("plain");
    expect($(el, 'button[aria-label="Show chats"]')).to.equal(null);
    expect(el.thread[0].content).to.equal("keep this");
    expect(el.mode).to.equal("chat"); // untouched keys stay
  });

  it("flags hide bookmark, delete, rename, feedback and times", async () => {
    const el = await mount(
      html`<singlebase-chat
        auto-title="false"
        allow-bookmark="false"
        allow-delete="false"
        allow-rename="false"
        allow-feedback="false"
        show-time="false"
      ></singlebase-chat>`,
      llmClient()
    );
    await el.send("hello");
    await until(settled(el));
    await el.updateComplete;

    for (const label of [
      "Bookmark chat",
      "Delete chat",
      "Bookmark message",
      "Delete message",
      "Helpful",
      "Not helpful"
    ]) {
      expect($(el, `button[aria-label="${label}"]`), label).to.equal(null);
    }
    expect($(el, ".time")).to.equal(null);
    expect(($(el, ".title") as HTMLButtonElement).disabled).to.equal(true);
    // what's left still works
    expect($(el, 'button[aria-label="Copy"]')).to.exist;
  });

  it("allow-copy and allow-regenerate hide their buttons", async () => {
    const el = await mount(
      html`<singlebase-chat
        auto-title="false"
        allow-copy="false"
        allow-regenerate="false"
      ></singlebase-chat>`,
      llmClient()
    );
    await el.send("hello");
    await until(settled(el));
    await el.updateComplete;
    expect($(el, 'button[aria-label="Copy"]')).to.equal(null);
    expect($(el, 'button[aria-label="Regenerate"]')).to.equal(null);
    expect($(el, 'button[aria-label="Bookmark message"]')).to.exist;
  });

  it("footnote takes custom text, and an empty string hides it", async () => {
    const el = await mount(
      html`<singlebase-chat footnote="Answers come from our docs."></singlebase-chat>`,
      llmClient()
    );
    expect($(el, ".footnote")!.textContent!.trim()).to.equal("Answers come from our docs.");
    el.configure({ footnote: "" });
    await el.updateComplete;
    expect($(el, ".footnote")).to.equal(null);
    el.configure({ footnote: undefined as never });
    await el.updateComplete;
    expect($(el, ".footnote")!.textContent).to.contain("can make mistakes");
  });

  it("welcome: prompts none or [] hide the cards; eyebrow is custom or hidden", async () => {
    const el = await mount(
      html`<singlebase-chat prompts="none" eyebrow="Support"></singlebase-chat>`,
      llmClient()
    );
    expect($(el, ".prompts")).to.equal(null);
    expect($(el, ".welcome-head .label")!.textContent).to.equal("Support");

    el.configure({ prompts: [], eyebrow: "" });
    await el.updateComplete;
    expect($(el, ".prompts")).to.equal(null);
    expect($(el, ".welcome-head .label")).to.equal(null);

    el.configure({ prompts: "", eyebrow: undefined as never });
    await el.updateComplete;
    expect($$(el, ".prompt")).to.have.length(4); // back to the mode's defaults
    expect($(el, ".welcome-head .label")!.textContent).to.equal("Chat");
  });

  it("a welcome slot replaces the whole welcome screen", async () => {
    const el = await mount(
      html`<singlebase-chat
        ><div slot="welcome"><h1>Hello from the page</h1></div></singlebase-chat
      >`,
      llmClient()
    );
    const slot = $(el, 'slot[name="welcome"]') as HTMLSlotElement;
    expect(slot.assignedElements().map((e) => e.textContent)).to.deep.equal([
      "Hello from the page"
    ]);
    // the built-in welcome is only fallback content, so it isn't shown
    expect((slot.querySelector(".welcome") as HTMLElement).getClientRects().length).to.equal(0);

    await el.send("hi");
    await until(settled(el));
    await el.updateComplete;
    expect($(el, 'slot[name="welcome"]')).to.equal(null); // gone once the chat starts
  });

  it("show-composer=false shows a saved chat read-only", async () => {
    const client = llmClient({
      get_chat: () => ({
        _id: "c9",
        title: "Saved",
        messages: [
          { _id: "u", role: "user", content: "Hi" },
          { _id: "a", role: "assistant", content: "Hello **there**" }
        ]
      })
    });
    const el = await mount(
      html`<singlebase-chat chat-id="c9" show-composer="false"></singlebase-chat>`,
      client
    );
    await until(() => el.thread.length === 2);
    await el.updateComplete;
    expect($(el, "textarea.input")).to.equal(null);
    expect($(el, 'button[aria-label="Attach files"]')).to.equal(null);
    expect($(el, ".answer strong")!.textContent).to.equal("there");
    expect($(el, ".footnote")).to.exist;

    el.configure({ showComposer: true });
    await el.updateComplete;
    expect($(el, "textarea.input")).to.exist;
  });

  it("followups asks the model; show-followups decides whether they're shown", async () => {
    const c = llmClient();
    const hidden = await mount(
      html`<singlebase-chat show-followups="false" auto-title="false"></singlebase-chat>`,
      c
    );
    await hidden.send("hi");
    await until(settled(hidden));
    await hidden.updateComplete;
    expect(c.calls.find((x) => x.method === "chat")!.payload.system_message).to.contain(
      "FOLLOWUPS:"
    );
    expect($(hidden, ".followups")).to.equal(null);
    expect($(hidden, ".answer")!.textContent).not.to.contain("FOLLOWUPS"); // still stripped

    hidden.configure({ showFollowups: true });
    await hidden.updateComplete;
    expect($$(hidden, ".followup")).to.have.length(3);

    const c2 = llmClient();
    const off = await mount(
      html`<singlebase-chat followups="false" auto-title="false"></singlebase-chat>`,
      c2
    );
    await off.send("hi");
    await until(settled(off));
    expect(c2.calls.find((x) => x.method === "chat")!.payload.system_message).not.to.contain(
      "FOLLOWUPS:"
    );
  });

  it("allow-search=false removes the chat list's search box", async () => {
    const el = await mount(
      html`<singlebase-chat sidebar allow-search="false"></singlebase-chat>`,
      llmClient()
    );
    await aTimeout(50);
    await el.updateComplete;
    expect($(el, ".sidebar")).to.exist;
    expect($(el, "input.search")).to.equal(null);
  });

  it("a sidebar slot adds your own content to the chat list", async () => {
    const el = await mount(
      html`<singlebase-chat sidebar
        ><div slot="sidebar">Plan: Pro · <a href="/usage">Usage</a></div></singlebase-chat
      >`,
      llmClient()
    );
    await aTimeout(50);
    await el.updateComplete;
    const box = $(el, ".side-extra")!;
    expect(box.classList.contains("filled")).to.equal(true);
    const slot = box.querySelector("slot") as HTMLSlotElement;
    expect(slot.assignedElements()[0].textContent).to.contain("Plan: Pro");

    const bare = await mount(html`<singlebase-chat sidebar></singlebase-chat>`, llmClient());
    await aTimeout(50);
    await bare.updateComplete;
    expect(getComputedStyle($(bare, ".side-extra")!).display).to.equal("none");
  });

  it("show-sources, show-new-chat and show-bookmarked hide their parts", async () => {
    const now = new Date().toISOString();
    const client = llmClient({
      list_chats: () => ({
        items: [{ _id: "c2", title: "Pinned", bookmarked: true, _modified_at: now }]
      }),
      chat: () => ({
        _id: "c1",
        message: {
          _id: "a1",
          reply_to: "u1",
          content: "Fact [1].",
          sources: [{ title: "Doc", content: "The fact." }]
        }
      })
    });
    const el = await mount(
      html`<singlebase-chat
        sidebar
        auto-title="false"
        show-sources="false"
        show-new-chat="false"
        show-bookmarked="false"
      ></singlebase-chat>`,
      client
    );
    await until(() => $$(el, ".thread-title").length === 1);
    expect($(el, ".new-chat")).to.equal(null);
    expect($$(el, ".group").map((g) => g.textContent)).to.deep.equal(["Today"]);

    await el.send("q");
    await until(settled(el));
    await el.updateComplete;
    expect($(el, ".source-card")).to.equal(null);
    expect($(el, ".retrieval")).to.equal(null);
    expect($(el, ".cite")).to.exist; // chips in the text stay

    el.configure({ showSources: true, showNewChat: true, showBookmarked: true });
    await el.updateComplete;
    expect($(el, ".source-card")).to.exist;
    expect($(el, ".new-chat")).to.exist;
    expect($$(el, ".group").map((g) => g.textContent)[0]).to.equal("Bookmarked");
  });

  it("beforeSend can change the request, asynchronously", async () => {
    const client = llmClient();
    const el = await mount(html`<singlebase-chat auto-title="false"></singlebase-chat>`, client);
    el.beforeSend = async (payload, { isNew }) => {
      await aTimeout(5);
      payload.metadata = { page: "/billing", isNew };
      return { ...payload, message: String(payload.message).replace(/\d{4}-\d{4}/g, "[redacted]") };
    };
    await el.send("My card is 1234-5678");
    await until(settled(el));
    const sent = client.calls.find((c) => c.method === "chat")!.payload;
    expect(sent.message).to.equal("My card is [redacted]");
    expect(sent.metadata).to.deep.equal({ page: "/billing", isNew: true });
  });

  it("beforeSend returning false cancels and gives the text back", async () => {
    const client = llmClient();
    const el = await mount(html`<singlebase-chat></singlebase-chat>`, client);
    el.beforeSend = () => false;
    await el.send("never mind");
    await el.updateComplete;
    expect(client.calls.some((c) => c.method === "chat")).to.equal(false);
    expect(el.thread).to.have.length(0);
    expect(($(el, "textarea.input") as HTMLTextAreaElement).value).to.equal("never mind");
  });

  it("beforeSend that forgets to return never sends the original", async () => {
    const client = llmClient();
    const el = await mount(html`<singlebase-chat></singlebase-chat>`, client);
    const errors: any[] = [];
    el.addEventListener("singlebase-chat-error", (e) => errors.push((e as CustomEvent).detail));
    el.beforeSend = ((payload: any) => {
      delete payload.metadata; // mutates, but no return
    }) as never;
    await el.send("secret");
    await el.updateComplete;
    expect(client.calls.some((c) => c.method === "chat")).to.equal(false);
    expect(errors[0].code).to.equal("BEFORE_SEND_INVALID");
    expect($(el, ".error-card")).to.exist;
  });

  it("afterParse rewrites the parsed blocks before drawing", async () => {
    const client = llmClient({
      chat: () => ({
        _id: "c1",
        message: {
          _id: "a1",
          reply_to: "u1",
          content: "Intro.\n\n```sql\nDROP TABLE x;\n```\n\nOutro."
        }
      })
    });
    const el = await mount(html`<singlebase-chat auto-title="false"></singlebase-chat>`, client);
    el.afterParse = (blocks) =>
      blocks
        .filter((b) => !(b.type === "code" && b.lang === "sql"))
        .map((b) => (b.type === "p" ? { ...b, text: b.text.toUpperCase() } : b));
    await el.send("x");
    await until(settled(el));
    await el.updateComplete;
    expect($(el, ".code")).to.equal(null);
    expect($$(el, ".answer p").map((p) => p.textContent)).to.deep.equal(["INTRO.", "OUTRO."]);

    el.afterParse = (() => "oops") as never; // not an array: falls back to the original
    await el.updateComplete;
    el.requestUpdate();
    await el.updateComplete;
    expect($(el, ".code")).to.exist;
  });

  it("explains itself when there is no client", async () => {
    const el = await fixture<SinglebaseChat>(html`<singlebase-chat></singlebase-chat>`);
    await el.send("hello");
    await el.updateComplete;
    expect($(el, ".error-card")!.textContent).to.contain("isn't connected");
  });
});
