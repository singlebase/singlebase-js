import { fixture, html, expect, aTimeout } from "@open-wc/testing";
import "../src/elements/chat.js";
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
    const el = await mount(html`<singlebase-chat auto-title="false"></singlebase-chat>`, client);
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
      { type: "csv", data: "a,b\n1,2" },
      { type: "docs", payload: { documents: [{ title: "notes.md", content: "# Notes\nhello" }] } }
    ]);
    expect(payload.metadata).to.deep.equal({ attachments: ["notes.md", "data.csv"] });

    await el.send("Next");
    await until(() => el.thread.length === 4 && settled(el)());
    expect(client.calls.filter((c) => c.method === "chat")[1].payload.retrieval).to.equal(
      undefined
    );
  });
});

describe("<singlebase-chat> render-as", () => {
  const reply =
    'Lead.\n\n```chart\n{"type":"bar","title":"Share","labels":["A","B"],"series":[{"name":"n","values":[3,1]}]}\n```';
  const client = () =>
    llmClient({
      chat: () => ({ _id: "c1", message: { _id: "a1", reply_to: "u1", content: reply } })
    });

  it("rich draws the chart", async () => {
    const el = await mount(html`<singlebase-chat auto-title="false"></singlebase-chat>`, client());
    await el.send("chart");
    await until(settled(el));
    await el.updateComplete;
    expect($$(el, ".bar-row")).to.have.length(2);
  });

  it("markdown shows the chart as a table", async () => {
    const el = await mount(
      html`<singlebase-chat render-as="markdown" auto-title="false"></singlebase-chat>`,
      client()
    );
    await el.send("chart");
    await until(settled(el));
    await el.updateComplete;
    expect($(el, ".bar-row")).to.equal(null);
    expect($$(el, ".answer td").map((td) => td.textContent)).to.deep.equal(["A", "3", "B", "1"]);
  });

  it("text shows one plain block", async () => {
    const el = await mount(
      html`<singlebase-chat render-as="text" auto-title="false"></singlebase-chat>`,
      client()
    );
    await el.send("chart");
    await until(settled(el));
    await el.updateComplete;
    expect($(el, ".answer .raw")!.textContent).to.contain("A  ·  3");
    expect($(el, ".chart")).to.equal(null);
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
      mode: "rich",
      prompts: ["Chart my sales"],
      assistantName: "Ada",
      branding: false
    };
    await el.updateComplete;

    expect(el.mode).to.equal("rich");
    expect($$(el, ".prompt-text").map((p) => p.textContent)).to.deep.equal(["Chart my sales"]);
    expect($(el, ".branding")).to.equal(null);
    expect(el.config.assistantName).to.equal("Ada");
  });

  it("explains itself when there is no client", async () => {
    const el = await fixture<SinglebaseChat>(html`<singlebase-chat></singlebase-chat>`);
    await el.send("hello");
    await el.updateComplete;
    expect($(el, ".error-card")!.textContent).to.contain("isn't connected");
  });
});
