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

// import the package
import createClient from '@singlebase/singlebase-js'

/**
 * CreateClientConfigType:
 *    api_url:str     // the api url 
 *    api_key:str     // your api key
 *    config?:object  // extra config
 */
const SBC_CONFIG = {
  api_url: "https://xxx-xxx.singlebasecloud.com/api",
  api_key: "[[API-KEY]]"
}

// create a new client with API_URL and API_KEY
const singlebase = createClient(SBC_CONFIG)

// get 5 items from the articles collection
const { data, error, ok } = await singlebase
    .collection('articles')
    .fetch({limit: 5})

if (ok) {
  for (const article of data) {
    console.log(article?.title)
  }
} else {
  console.error('Something wrong!')
}

```


## Quick Reference

Refer to the doc site for more details please visit https://docs.singlebasecloud.com/sdk/javascript 

