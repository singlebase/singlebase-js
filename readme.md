# Singlebase-js


## Setup 


### NPM Install
```
npm install @singlebase/singlebase-js 
```

#### Import

```
  import CreateClient from '@singlebase/singlebase-js'
```


### Module Install

```
<script type="module">

  import CreateClient from 'https://unpkg.com/@singlebase/singlebase-js'

</script>
```


## Usage 

```js

  // import the package
  import CreateClient from '@singlebase/singlebase-js'

  // set API URL and access key
  const API_URL = "https://api-svc.singlebasecloud.com/api"
  const ACCESS_KEY = "xxx-xxx-xx.xxx-xxxx-xxxx-xxxx"

  // create a new client with API_URL and ACCESS_KEY
  const singlebase = CreateClient(API_URL, ACCESS_KEY)


  const articles = singlebase.collection('articles')
  const {ok, data, error } = await articles.insert({
    title: "Hello world!",
    content: "This is a content..."
  })
  if (ok) {
    console.log("Article Key:", data?.[0]._key)
    console.log("Article Title:", data?.[0].title)
  } else {
    console.errro('Something went wrong')
  }


```