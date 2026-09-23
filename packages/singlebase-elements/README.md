# @singlebase/elements

Singlebase web components, framework-free:

- `<singlebase-authui>` and friends — sign-in, sign-up, codes, OAuth and the account view
- `<singlebase-uploader>` — pick, check and upload files straight to storage

```bash
npm install @singlebase/elements @singlebase/singlebase-sdk
```

```js
import "@singlebase/elements";            // everything
import "@singlebase/elements/authui";     // auth elements only
import "@singlebase/elements/uploader";   // uploader only
```

Or with no build step:

```html
<script type="module"
  src="https://cdn.jsdelivr.net/npm/@singlebase/elements/dist/singlebase-elements.min.js"
  data-singlebase-url-access-key="YOUR_PROJECT_KEY"
  data-singlebase-api-key="wk_YOUR_WEB_KEY"></script>

<singlebase-authui></singlebase-authui>
```

Documentation: https://github.com/singlebase/singlebase-js
