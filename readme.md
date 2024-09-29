# singlebase-js

`singlebase-js` : Javascript/Typescript SDK for Singlebase's API. 

Javascript SDK Documentation: https://docs.singlebasecloud.com/sdk/javascript 

API Documentation: https://docs.singlebasecloud.com

Website: https://singlebase.cloud 

---

### About SinglebaseCloud

SinglebaseCloud is an all-in-one backend-as-a-service (BaaS) platform that provides 
a developer friendly API to access and manage application data, using REST API, GraphQL, or SQL.

**Features**:

- LLM & AI functionalities
- VectorDB: Vector Database for AI and LLM apps
- Datastore: NoSQL Document Database
- Authentication: For authentication
- Filestore: For file storage
- Search: For text search and vector search
- Images: Image service to manipulate image

Learn more: https://singlebase.cloud 

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
 */
const createClientConfig = {
  api_url: "https://cloud.singlebaseapis.com/api",
  api_key: "your-api-key"
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
- singlebase.useLLM()


// 
//-- Datastore
// Datastore is a NoSQL document datastore
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

// methods
- auth.signinWithPassword
- auth.signUpWithPassword
- auth.updateAccount // change email, password, username
- auth.updateProfile // change display_name, photo, metadata, etc..
- auth.getUser
- auth.onAuthStateChanged

// example
const email = "x@y.com"
const password = "**********"
const res = await auth.signinWithPassword({email, password})
if (res.ok) {
  console.log(`Welcome ${res?.data?.display_name}`)
}

// -- LLM
const llm = singlebase.useLLM()
// WIP

```


## Full SDK Reference

Refer to the doc site for more details, please visit https://docs.singlebasecloud.com/sdk/javascript 

