import httpx from "./httpx";
import { AuthCredentialsInterface, ResponseType } from "./types";
import { parseXmlToJson, getKeyFromFilePath, isString, isPlainObject, isEmpty } from "./utils";


class BaseCollection {

  constructor (dispatch, collectionName:string, defaultMatches: object = {}) {
    this.collectionName = collectionName;
    this._dispatch = dispatch
    this._defaultMatches = defaultMatches
  }

  dispatch(action: String, opts: Object) {
    return this._dispatch({
      ...opts,
      action,
      collection: this.collectionName
    })
  }

  /**
   * to get multiple document
   * @param {Object} matches
   * @param {*} opts 
   * @returns Array
   */
  async fetch(criteria = {}) {
    const _payload = isPlainObject(criteria) ? criteria : {}
    if (isPlainObject(this._defaultMatches) && !isEmpty(this._defaultMatches)) {
      _payload.matches = this._defaultMatches
    }
    if (!_payload?.matches) {
      _payload.matches = {"**": true}
    }
    return await this.dispatch('doc_fetch', _payload)
  }

  /**
   * To get a single document based on _key or criteria
   * @param {*} _key 
   * @return Object
   */
  async fetchOne(criteria: object = {}) {
    const _payload = isPlainObject(criteria) ? criteria : {}
    if (isPlainObject(this._defaultMatches) && !isEmpty(this._defaultMatches)) {
      _payload.matches = this._defaultMatches
    }
    if (!isPlainObject(_payload?.matches)) {
      throw Error('SINGLEBASE:SDK-ERROR:Invalid matches for @fetchOne')
    }

    const res = await this.fetch({ ..._payload, limit: 1 })
    if (res.ok) {
      const data = res?.data?.[0]
      return {
        ...res,
        data
      }
    }
    return res
  }

  /**
   * 
   * @param criteria- the data to update, when in the closure
   * @returns 
   */
  async update(criteria: object) {
    let _payload = {}
    if (isPlainObject(this._defaultMatches) && !isEmpty(this._defaultMatches) && isPlainObject(criteria) && !isEmpty(criteria)) {
      _payload.matches = this._defaultMatches;
      _payload.data = criteria
    }
    if (!isPlainObject(_payload?.matches)) throw new Error("Missing criteria @matches")
    if (!isPlainObject(_payload?.data)) throw new Error("Missing @data")
    return await this.dispatch('doc_update', { ..._payload })
  }

  async upsert(criteria: object) {
    const _payload = isPlainObject(criteria) ? criteria : {}
    if (isPlainObject(this._defaultMatches) && !isEmpty(this._defaultMatches)) {
      _payload.matches = this._defaultMatches
    }
    if (!isPlainObject(_payload?.matches)) throw new Error("Missing criteria @matches")
    return await this.dispatch('doc_update', { ..._payload })
  }

  async delete(criteria: object) {
    const _payload = isPlainObject(criteria) ? criteria : {}
    if (isPlainObject(this._defaultMatches) && !isEmpty(this._defaultMatches)) {
      _payload.matches = this._defaultMatches
    }
    if (!isPlainObject(_payload?.matches)) throw new Error("Missing criteria @matches")
    return await this.dispatch('DOC_DELETE', { matches: _payload?.matches })
  }

  async archive(criteria: object) {
    const _payload = isPlainObject(criteria) ? criteria : {}
    if (isPlainObject(this._defaultMatches) && !isEmpty(this._defaultMatches)) {
      _payload.matches = this._defaultMatches
    }
    if (!isPlainObject(_payload?.matches)) throw new Error("Missing criteria @matches")
    return await this.dispatch('DOC_ARCHIVE', { matches: _payload?.matches })
  }

  async restore(criteria: object) {
    const _payload = isPlainObject(criteria) ? criteria : {}
    if (isPlainObject(this._defaultMatches) && !isEmpty(this._defaultMatches)) {
      _payload.matches = this._defaultMatches
    }
    if (!isPlainObject(_payload?.matches)) throw new Error("Missing criteria @matches")
    return await this.dispatch('DOC_RESTORE', { matches: _payload?.matches })
  }

  /**
   * Count the documents in th 
   * @param {*} opts 
   * @returns {int}
   */
  async count(criteria: object = {}) {
    const _payload = isPlainObject(criteria) ? criteria : {}
    if (isPlainObject(this._defaultMatches) && !isEmpty(this._defaultMatches)) {
      _payload.matches = this._defaultMatches
    }
    let matches = isPlainObject(_payload?.matches) ? _payload?.matches : {}
    const { data, error } = await this.dispatch('DOC_COUNT', { matches })
    if (data && data?.count) {
      return data?.count
    }
    return 0
  }
  
}

export default class extends BaseCollection{

  matches (matches:object) { 
    return new BaseCollection(this._dispatch, this.collectionName, matches)
  }

  async insert(data: object | [object]) {
    return await this.dispatch('doc_insert', { data })
  }

  async search(query: string, opts = {}) {
    return await this.dispatch('doc_search', { ...opts, query })
  }

  /** Single document read/write */
  async getDoc(_key: string) {
    return await this.matches({ _key }).fetchOne()
  }

  async setDoc(_key: string, data: object) {
    return await this.dispatch('doc_update', { data: {...data, _key} })
  }

  async deleteDoc(_key: string) {
    return await this.matches({ _key }).delete()
  }

  async archiveDoc(_key: string) {
    return await this.matches({ _key }).archive()
  }

  async restoreDoc(_key: string) {
    return await this.matches({ _key }).restore()
  }

  async updateMany(data:[object]) {
    if(!Array.isArray(data) || isEmpty(data)) {
      throw new Error("SinglebaseClient.collection#[updateMany] - requires Array of documents")
    } 
    for (const d of data) {
      if (!d?._key) {
        throw new Error("SinglebaseClient.collection#[updateMany] - one of more document is missing `_key`")
      }
    }
    return await this.dispatch('doc_update', {data})
  }
  
}