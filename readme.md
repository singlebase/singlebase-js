# Singlebase-js


`singlebase-js` is the Javascript SDK for SinglebaseCloud API. 

---

Service: https://singlebase.cloud 

Documentation: https://docs.singlebasecloud.com

### About SinglebaseCloud

SinglebaseCloud is the next generation backend-as-a-service platform and the ultimate Firebase alternative, that provides a NoSQL Datastore, Authentication, Storage, Search, Images, Analytics. 
It provisions the backend in 30 seconds and you get access via an easy and simple API, using GraphQL, SQL and REST.

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

  import createClient from 'https://unpkg.com/@singlebase/singlebase-js'

</script>
```


## Usage 

```js

// import the package
import createClient from '@singlebase/singlebase-js'

// set API URL and access key
const API_URL = "https://api-svc.singlebasecloud.com/api"
const ACCESS_KEY = "xxx-xxx-xx.xxx-xxxx-xxxx-xxxx"

// create a new client with API_URL and ACCESS_KEY
const singlebase = createClient(API_URL, ACCESS_KEY)

// insert data in the 'articles' collection
const { data, error } = await articles
    .collection('articles')
    .insert({
      title: "Hello world!",
      content: "This is a content..."
    })

if (error) {
  console.error('Something went wrong')
} else {
  // #insert return an array of data, get the first one
  const article = data?.[0]
  const articleKey = article?._key
  const articleTitle = article?.title

  console.log("Article Key:", articleKey, articleTitle)

}


```


## Methods

### Collection/Datastore


```
 const singlebase = createClient(API_URL, ACCESS_KEY)

 const collection = singlebase.collection(collectionName)

```

Methods:

- `fetch(criterias)` 
- `fetchOne(_key:str)`
- `insert`
- `update`
- `updateOne(_key:str, data:object)`
- `delete`
- `deleteOne(_key:str)`
- `archive`
- `archiveOne(_key:str)`
- `count() -> int`


### Auth
```
 const singlebase = createClient(API_URL, ACCESS_KEY)

 const auth = singlebase.auth

```

Methods:

- `signup`
- `signin`
- `signout`
- `updateProfile`
- `updateAccount`
- `sendOTP`
- `verifyIDToken`
- `authConnect`

### Storage

```
 const singlebase = createClient(API_URL, ACCESS_KEY)

 const storage = singlebase.storage

```

Methods:

- `get`
- `upload`
- `update`
- `delete`
- `query`
