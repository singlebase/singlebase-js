# Advanced

Settings most apps never need. They apply to every web component.

**Contents:** [The Singlebase credit](#the-singlebase-credit)

---

## The Singlebase credit

Each element ends with a small credit that links to
[singlebase.io](https://singlebase.io):

| Element | Credit |
| --- | --- |
| `<singlebase-authui>` | Auth by Singlebase |
| `<singlebase-uploader>` | Files by Singlebase |
| `<singlebase-chat>` | Chat by Singlebase |

It's a plain link: no image, script or request of any kind, so it adds nothing
to your page's network traffic or privacy footprint.

The text and link are fixed. The only option is to hide it with
`branding="false"`:

```html
<singlebase-authui branding="false"></singlebase-authui>
<singlebase-uploader branding="false"></singlebase-uploader>
<singlebase-chat branding="false"></singlebase-chat>
```

From script:

```js
uploader.configure({ branding: false });
chat.configure({ branding: false });

// Every auth element on the page
SinglebaseClient({ apiKey: "wk_YOUR_WEB_KEY", authui: { branding: false } });
```

It looks the same in every element and follows your theme's `--sb-mono` and
`--sb-muted-ink`. Target it with `::part(branding)` if you need to adjust its
spacing.
