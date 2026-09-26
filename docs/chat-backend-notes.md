# Chat: backend notes

Two proposed changes to the `llm` service, and what `<singlebase-chat>` does
today without them. Neither is required; both make the chat more reliable.

---

## 1. A stable `sources` shape

### Today

When a turn has `retrieval`, the reply carries `message.sources: object[]`,
with no fixed shape. The chat guesses each field, first match wins:

| Shown as | Fields tried |
| --- | --- |
| Title | `title` → `name` → `filename` → `metadata.title` → `metadata.name` → "Source n" |
| Passage | `content` → `text` → `page_content` → `body` → `snippet` → `chunk` → `metadata.content` → the raw JSON |
| Path | `path` → `url` → `key` → `source` → `metadata.path` → `metadata.url` |
| Collection | `collection` → `namespace` → `dbname` → `metadata.collection` |
| Updated | `updated` → `_modified_at` → `metadata.updated` |
| Relevance bar | `score` → `relevance` → `_score` → `metadata.score` (clamped 0–1) |

Citations assume `[n]` in the reply means `sources[n-1]`.

### Proposal

Return this on assistant messages from `llm.chat`, `llm.ask` and `llm.get_chat`:

```ts
sources: Array<{
  n: number;            // 1-based: the number the model was told to cite as [n]
  type: string;         // kdb | vector | docs | json | csv | data | generate | s3
  collection?: string;  // namespace / dbname / bucket, or "uploads" for inline docs
  id?: string;          // stable document id
  title: string;        // document title; else filename, key, or "Source {n}"
  section?: string;     // heading or chunk label within the document
  content: string;      // the exact passage given to the model (≤ ~2,000 chars)
  path?: string;        // url, s3 key or doc path — never a signed URL
  score?: number;       // 0–1, only for ranked sources (kdb, vector)
  updated?: string;     // ISO date
}>
```

Rules:

1. **Numbering is the contract.** Build the model's context as a numbered list,
   `[n] {title} — {section}: {content}`, and return `sources` in the same order.
2. One entry per passage the model saw; chunks of one document share an `id`.
3. `score` only for ranked sources; omit it for docs, json, csv, data, generate, s3.
4. No vectors, embeddings, credentials, signed URLs or internal tokens.
5. No retrieval, or nothing matched → `sources: []`.

### Example

```jsonc
{
  "data": {
    "_id": "chat_8f2k1",
    "title": "One-time code limits",
    "message": {
      "_id": "msg_a91",
      "role": "assistant",
      "content": "A code is valid for **10 minutes** [1]. You can request 3 per minute [2].",
      "reply_to": "msg_u90",
      "sources": [
        {
          "n": 1, "type": "kdb", "collection": "help-center", "id": "doc_codes",
          "title": "One-time sign-in codes", "section": "How codes work",
          "content": "Codes expire after 10 minutes and can only be used once.",
          "path": "help/sign-in/one-time-codes", "score": 0.86, "updated": "2026-08-14"
        },
        {
          "n": 2, "type": "docs", "collection": "uploads",
          "title": "notes.md", "section": "Part 1",
          "content": "Code requests are limited to 3 per minute per email."
        }
      ]
    }
  }
}
```

### Chat changes once it ships

Read `n` directly instead of relying on array order, show `section` in the
source panel, and drop most of the field guessing.

---

## 2. Server-side follow-up questions

### Today

When a chat is created, the element adds this to `system_message`:

> After the answer, on a final line write FOLLOWUPS: followed by three short
> follow-up questions the user might ask next, separated by |.

It then strips the `FOLLOWUPS:` tail from every reply, including ones loaded
with `llm.get_chat`, and shows up to three questions under the latest reply.
This costs no extra model call, but:

- the stored reply text contains the `FOLLOWUPS:` line, so other clients see it;
- earlier replies' `FOLLOWUPS:` lines go back into the model's context;
- it depends on the model complying, and only works for chats the element creates;
- it can't be combined with `format: "json"`.

The spec's alternatives, an extra `llm.ask` or `llm.generate` per reply, keep
the history clean but add a billed call and a delay.

### Proposal

New optional payload field on `llm.chat` and `llm.ask`:

```ts
followups?: boolean | number   // true = 3; a number = that many (1–5); default false
```

New field on assistant messages (in replies and in `llm.get_chat`):

```ts
followups: string[]            // always present; [] when not requested or none parsed
```

Behaviour:

1. **Same call.** Append the FOLLOWUPS instruction to that turn's prompt (not to
   the stored system message).
2. **Strip before saving.** Parse the last `FOLLOWUPS:` (any case); everything
   before it is `content`, the questions go to `followups` (split on `|` or
   newlines, strip bullets and numbering, de-duplicate, ≤ 150 chars, at most n).
3. **Store clean.** Later turns send the model the clean `content` only.
4. **Per turn**, not remembered on the chat.
5. `format: "json"` ignores it and returns `[]`.
6. No marker → `[]`; never fail a turn over follow-ups.
7. Invalid values (`0`, `6`, `"yes"`) → `400 INVALID_PAYLOAD`.
8. Omitted → today's behaviour, plus `followups: []` on assistant messages.

### Chat changes once it ships

Send `followups: true` per turn instead of the system-message line, read
`message.followups`, and keep the current parsing as a fallback for older chats.
