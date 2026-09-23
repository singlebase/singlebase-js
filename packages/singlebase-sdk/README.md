# @singlebase/singlebase-sdk

The Singlebase JavaScript client: authentication, data, files, the current
user, LLM and any other service, over one connection.

```bash
npm install @singlebase/singlebase-sdk
```

```js
import { SinglebaseClient } from "@singlebase/singlebase-sdk";

const sbc = SinglebaseClient({
  apiKey: "wk_YOUR_WEB_KEY",        // optional
  urlAccessKey: "YOUR_PROJECT_KEY"  // optional
});

await sbc.auth.signIn({ email, password });
const notes = await sbc.data.query({ collection: "notes", limit: 10 });
```

Documentation: https://github.com/singlebase/singlebase-js
