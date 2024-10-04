// Datastore.ts
import { 
  ResultType, 
  DSQueryCriteriaType, 
  DSMutationCriteriaType, 
  DSSearchCriteriaType, 
  DSUpsertCriteriaType 
} from "./types";

import { 
  isString, 
  isPlainObject, 
  isEmpty, 
  startsWithAny 
} from "./lib";

/**
 * Check if the action is a valid one 
 * @param value 
 * @returns {boolean}
 */
const isValidActionName = (value) => startsWithAny(value, ["db.", "collection."])

/**
 * Datastore
 */

export default class Datastore {
  
  private readonly _dispatch: (payload: Record<string, any>) => Promise<ResultType>;

  /**
   * Constructs the Datastore instance with a dispatch function.
   * @param _dispatch A function that performs datastore actions and returns a ResponseType.
   */
  constructor(_dispatch: (payload: Record<string, any>) => Promise<ResultType>) {
    this._dispatch = _dispatch;
  }

  /**
   * Creates an ErrorObject adhering to ResultType.
   * @param message The error message.
   * @returns An object representing the error.
   */
  private _createError(message: string): ResultType {
    return {
      ok: false,
      data: null,
      meta: null,
      error: { message }
    };
  }

  /**
   * Performs the specified action using the datastore.
   * @param action The action to perform (e.g., 'insert', 'fetch', 'delete', etc.).
   * @param collectionName The name of the collection. Can be null for actions like 'restore'.
   * @param criteria The criteria or identifier for the action.
   * @returns A Promise resolving to ResultType.
   */
  private async _performAction(action: string, collectionName: string | null, criteria: Record<string, any> = {}): Promise<ResultType> {

    // invalid action name
    if (!isValidActionName(action)) {
      return this._createError(`Invalid action name in the datastore: ${action}`);
    }

    // Construct the payload based on the action
    let payload: Record<string, any> = { ...criteria };

    // Include action and collectionName if applicable
    payload.action = action;
    if (collectionName) {
      payload.collection = collectionName;
    }

    try {
      // Call the dispatch function with the constructed payload
      // Ensure the response conforms to ResultType
      const response = await this._dispatch(payload);
      return response as ResultType;
    } catch (error: any) { // using 'any' to access error.message
      return this._createError(error.message || `Unknown error in Datastore._performAction: ${action}.`);
    }
  }

  /**
   * Dispatch other actions that may not 
   * Performs the specified action using the datastore.
   * @param action The action to perform
   * @param criteria The criteria or identifier for the action.
   * @returns A Promise resolving to ResultType.
   */
  public async dispatch(action:string, criteria: Record<string, any> = {}): Promise<ResultType> {

    let collectionName = null
    if (criteria?.collectionName) {
      collectionName = criteria?.collectionName
      delete criteria.collectionName;
    }
    return await this._performAction(action, collectionName, criteria)
  }

  /**
   * Dispatch other actions that may not 
   * Performs the specified action using the datastore.
   * @param action The action to perform
   * @param criteria The criteria or identifier for the action.
   * @returns A Promise resolving to ResultType.
   */
  public async query(query:string, criteria: Record<string, any> = {}): Promise<ResultType> {
    
    let collectionName = null
    let _criteria:Record<string, any> = {}
    if (isPlainObject(criteria)) {
      _criteria = {..._criteria, criteria}
    }
    if (_criteria?.collectionName) {
      collectionName = _criteria?.collectionName
      delete _criteria.collectionName;
    }
    _criteria["query"] = query
    return await this._performAction("db.fetch", collectionName, _criteria)
  }

  /**
   * Sets a document in the datastore.
   * @param collectionName The name of the collection.
   * @param keyOrDataRecord  a _key string or an object containing at least the _key.
   * @param dataRecord  an object containing the data when keyOrDataRecord exists
   * @returns ResultType indicating the operation's success or failure.
   * 
   * Example
   * 
   * set(collectionName, data={_key:str, ...{}})
   * set(collectionName, _key:str, data:object)
   * 
   */
  public async set(collectionName: string, keyOrDataRecord: Record<string, any>, dataRecord:Record<string, any>={}): Promise<ResultType> {
    
    let data:Record<string, any> = {}

    if (!isString(collectionName)) {
      return this._createError("Datatsore.set: Collection name must be a string.");
    }
    
    // keyOrData is string, dataMabe
    if (isString(keyOrDataRecord)) {
      if(!isPlainObject(dataRecord)) {
        return this._createError("Datatsore.set(collectionName:str, _key:str, data:{}): #data must be a plain object");
      }
      if (dataRecord?._key) {
        return this._createError("Datatsore.set: _key conflict. Ensure sure data._key doesn't exists ");
      }
      data = {_key: keyOrDataRecord, ...dataRecord } 
    } else {
      data = keyOrDataRecord
    }

    if (!isPlainObject(data)) {
      return this._createError("Datastore.set: Data must be a plain object.");
    }

    if (data._key) {
      if (!isString(data._key)) {
        return this._createError("Datastore.set: The `_key` must be a string.");
      }
      // If _key exists, perform an update
      const updateCriteria: DSMutationCriteriaType = {
        filters: { _key: data._key },
        data: data
      };
      return await this._performAction('db.update', collectionName, updateCriteria);
    } else {
      // If _key does not exist, perform an insert
      return await this._performAction('db.insert', collectionName, { data });
    }
  }

  /**
   * Retrieves a document by its _key.
   * @param collectionName The name of the collection.
   * @param recordKey The unique key of the document.
   * @param returnFields - Array of fields to return.
   * @returns ResultType containing the retrieved document or an error.
   */
  public async get(collectionName: string, recordKey: string, returnFields=[]): Promise<ResultType> {
    if (!isString(collectionName)) {
      return this._createError("Datastore.get: Collection name must be a string.");
    }
    if (!isString(recordKey)) {
      return this._createError("Datastore.get: Record key must be a string.");
    }

    const res = await this._performAction('db.fetch', collectionName, { _key: recordKey, return_fields:returnFields });

    // fetch always return an array, we will extract the first value, and put it in data
    if (res.ok) {
      const _data = res.data?.[0]
      res.data = _data
    }
    return res 
  }

  /**
   * Deletes a document by its _key or based on criteria.
   * @param collectionName The name of the collection.
   * @param keyOrCriteria A string _key or a DSQueryCriteriaType object.
   * @returns ResultType indicating the operation's success or failure.
   */
  public async delete(collectionName: string, keyOrCriteria: string | DSQueryCriteriaType): Promise<ResultType> {
    if (!isString(collectionName)) {
      return this._createError("Datastore.delete: Collection name must be a string.");
    }
    if (typeof keyOrCriteria !== 'string' && !isPlainObject(keyOrCriteria)) {
      return this._createError("Datastore.delete: keyOrCriteria must be a string or a DSQueryCriteriaType object.");
    }

    let _criteria: Record<string, any> = {};
    if (typeof keyOrCriteria === 'string') {
      _criteria = {
        filters: {
          _key: keyOrCriteria 
        }
      }
    } else {
      _criteria = keyOrCriteria;
    }
    if (!isPlainObject(_criteria) || !isPlainObject(_criteria?.filters)) {
      return this._createError("Datastore.delete: Criteria must be a DSQueryCriteriaType object with `filters`.");
    }
    return await this._performAction('db.delete', collectionName, _criteria);
  }

  /**
   * Lists documents based on the provided DSQueryCriteriaType.
   * @param collectionName The name of the collection.
   * @param criteria DSQueryCriteriaType object.
   * @returns ResultType containing the list of documents or an error.
   */
  public async list(collectionName: string, criteria: DSQueryCriteriaType): Promise<ResultType> {
    if (!isString(collectionName)) {
      return this._createError("Datastore.list: Collection name must be a string.");
    }
    let _criteria = {
      limit: 10
    }
    if (!isEmpty(criteria) && isPlainObject(criteria)) {
      _criteria = {..._criteria, ...criteria}
    }
    // filters
    if(!_criteria?.filters) {
      _criteria.filters = { "**": true }
    }

    if (!isPlainObject(_criteria) || !isPlainObject(_criteria?.filters)) {
      return this._createError("Datastore.list: Criteria must be a DSQueryCriteriaType object with `filters`.");
    }
    return await this._performAction('db.fetch', collectionName, _criteria);
  }

  /**
   * Updates one or multiple documents based on DSMutationCriteriaType.
   * @param collectionName The name of the collection.
   * @param criteria DSMutationCriteriaType object.
   * @returns ResultType indicating the operation's success or failure.
   */
  public async update(collectionName: string, criteria: DSMutationCriteriaType): Promise<ResultType> {
    if (!isString(collectionName)) {
      return this._createError("Datastore.update: Collection name must be a string.");
    }

    if (!isPlainObject(criteria) || !criteria.data) {
      return this._createError("Datastore.update: Criteria must be a DSMutationCriteriaType object with `filters` and `data`.");
    }

    const filters = criteria?.filters

    // Validate data
    if (Array.isArray(criteria?.data)) {
      if (criteria.data.length === 0) {
        return this._createError("Datastore.update: Data array cannot be empty.");
      }
      // if no filters, it will check to see if every element has _key
      if (!isPlainObject(filters)) {
        for (const item of criteria.data) {
          if (!isPlainObject(item) || !item._key || !isString(item._key)) {
            return this._createError("Datastore.update: Each item must be a plain object with a valid `_key` string.");
          }
        }
      }
    } else {
      if (!isPlainObject(filters)) {
        if (!isPlainObject(criteria.data) || !criteria.data._key || !isString(criteria.data._key)) {
          return this._createError("Datastore.update: Data must be a plain object with a valid `_key` string.");
        }
      }
    }

    return await this._performAction('db.update', collectionName, criteria);
  }

  /**
   * Performs an upsert operation based on the provided criteria.
   * 
   * @param collectionName The name of the collection.
   * @param criteria The criteria for the upsert operation.
   * @returns A promise resolving to the result of the upsert operation.
   * @throws Error if the collection name is not a string or if criteria are invalid.
   */
  public async upsert(collectionName: string, criteria: DSUpsertCriteriaType): Promise<ResultType> {
    
    if (!isString(collectionName)) {
      throw new Error("Datastore.upsert: Collection name must be a string.");
    }
    if (!isPlainObject(criteria.filters) || !isPlainObject(criteria.insertData) || !isPlainObject(criteria.updateData)) {
      throw new Error("Datastore.upsert: Criteria must be valid objects.");
    }
    
    criteria.update = criteria?.updateData
    criteria.insert = criteria?.insertData
    delete criteria.updateData
    delete criteria.insertData

    return await this._performAction('db.upsert', collectionName, criteria);

  }

  /**
   * Searches documents based on DSSearchCriteriaType.
   * @param collectionName The name of the collection.
   * @param criteria DSSearchCriteriaType object.
   * @returns ResultType containing the search results or an error.
   */
  public async search(collectionName: string, criteria: DSSearchCriteriaType): Promise<ResultType> {
    if (!isString(collectionName)) {
      return this._createError("Datastore.search: Collection name must be a string.");
    }
    if (!isPlainObject(criteria) || !isPlainObject(criteria.query)) {
      return this._createError("Datastore.search: Criteria must be a DSSearchCriteriaType object with `query`.");
    }
    return await this._performAction('db.search', collectionName, criteria);
  }

  /**
   * Counts the number of documents matching the DSQueryCriteriaType.
   * @param collectionName The name of the collection.
   * @param criteria DSQueryCriteriaType object or null.
   * @returns ResultType containing the count or an error.
   */
  public async count(collectionName: string, criteria: DSQueryCriteriaType | null = null): Promise<ResultType> {
    if (!isString(collectionName)) {
      return this._createError("Datastore.count: Collection name must be a string.");
    }

    let _criteria = { }

    if (!isEmpty(criteria) && isPlainObject(criteria)) {
      _criteria = {..._criteria, ...criteria}
    }
    // filters
    if(!_criteria?.filters) {
      _criteria.filters = { "**": true }
    }

    if (_criteria !== null && (!isPlainObject(_criteria) || !isPlainObject(_criteria.filters))) {
      return this._createError("Datastore.count: Criteria must be a DSQueryCriteriaType object or null.");
    }
    return await this._performAction('db.count', collectionName, _criteria || {});
  }

  /**
   * Archives a document by its _key or based on criteria.
   * @param collectionName The name of the collection.
   * @param keyOrCriteria A string _key or a DSQueryCriteriaType object.
   * @returns ResultType indicating the operation's success or failure.
   */
  public async archive(collectionName: string, keyOrCriteria: string | DSQueryCriteriaType): Promise<ResultType> {
    if (!isString(collectionName)) {
      return this._createError("Datastore.archive: Collection name must be a string.");
    }
    if (typeof keyOrCriteria !== 'string' && !isPlainObject(keyOrCriteria)) {
      return this._createError("Datastore.archive: keyOrCriteria must be a string or a DSQueryCriteriaType object.");
    }

    let _criteria: Record<string, any> = {};
    if (typeof keyOrCriteria === 'string') {
      _criteria = {
        filters: {
          _key: keyOrCriteria 
        }
      }
    } else {
      _criteria = keyOrCriteria;
    }
    if (!isPlainObject(_criteria) || !isPlainObject(_criteria?.filters)) {
      return this._createError("Datastore.archive: Criteria must be a DSQueryCriteriaType object with `filters`.");
    }
    return await this._performAction('db.archive', collectionName, _criteria);
  }

  /**
   * Restores a document from the archive using the archiveKey.
   * @param archiveKey The unique key of the archived document.
   * @returns ResultType indicating the operation's success or failure.
   */
  public async restore(archiveKey: string): Promise<ResultType> {
    if (!isString(archiveKey)) {
      return this._createError("Datastore.restore: Archive key must be a string.");
    }
    return await this._performAction('db.restore', null, { archiveKey });
  }
}
