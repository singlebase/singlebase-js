# Singlebase-js


`singlebase-js` is the Javascript SDK for SinglebaseCloud API. 

---

Site: https://singlebase.cloud 

Documentation: https://docs.singlebasecloud.com

Javascript SDK Documentation: https://docs.singlebasecloud.com/sdk/javascript

---

### About SinglebaseCloud

SinglebaseCloud is the next generation backend-as-a-service platform and the ultimate Firebase alternative, that provides a NoSQL Datastore, Authentication, File Storage, Search, Images, Analytics. 

It provisions the backend in 30 seconds and you get access via an easy and simple API, using GraphQL, SQL and REST.

Visit https://singlebase.cloud 

---

## Install 


### NPM/Yarn Install

```
# npm
npm install @singlebase/singlebase-js 

# yarn
yarn add @singlebase/singlebase-js 
```


### JS Module Install

```
<script type="module">

  import createClient  from 'https://cdn.jsdelivr.net/npm/@singlebase/singlebase-js/+esm'

</script>
```


## Quick example 

```js

// 1. import the package
import createClient from '@singlebase/singlebase-js'

/** 
 * 2. create the client config
 * 
 * CreateClientConfigType:
 *    api_url:str     // the api url 
 *    api_key:str     // your api key
 *    config?:object  // extra config
 */
const createClientConfig = {
  api_url: "https://xxx-xxx.singlebasecloud.com/api",
  api_key: "[[API-KEY]]"
}

/**
 * 3. create the client
 */
const singlebase = createClient(createClientConfig)


/**
 * 4. use the services
 */

- singlebase.useDatastore()
- singlebase.useAuth()
- singlebase.useFilestore()
- singlebase.LLM()


// 4.1

//-- Datastore
const datastore = singlebase.useDatastore()

// methods
- datastore.list
- datastore.set
- datastore.get
- datastore.update
- datastore.delete
- datastore.upsert
- datastore.query
- datastore.search 
- datastore.count

// example
const articles = await datastore.list('articles')
if (articles.ok) {
  for (const article in articles?.data) {
    console.log(article._key, article.title)
  }
}

---

// -- Filestore
const filestore = singlebase.useFilestore()

// methods
- filestore.upload
- filestore.get
- filestore.getURL
- filestore.makePublic
- filestore.setMetadata
- filestore.delete

// example
// html: <input id="myInputFile" type="file" name="uploadFile" required />
let fileInput = document.querySelector("#myInputFile").files[0]
const res = await filestore.upload(fileInput)
if (res.ok) {
  console.log('File URL', res?.data.url)
}

// -- Authentication

const auth = singlebase.useAuth()

// -- LLM

const llm = singlebase.useLLM()


```


## Full SDK Reference

Refer to the doc site for more details, please visit https://docs.singlebasecloud.com/sdk/javascript 

