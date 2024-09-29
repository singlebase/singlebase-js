// tests/datatsore.test.ts

import Collection from "../src/Datastore";
import { ResultType, QueryCriteriaType, MutationCriteriaType, SearchCriteriaType } from "../src/types";

describe('Collection Class', () => {
  let dispatchMock: jest.Mock<Promise<ResultType>, [Record<string, any>]>;
  let collection: Collection;
  const collectionName = 'users';

  beforeEach(() => {
    dispatchMock = jest.fn();
    collection = new Collection(dispatchMock);
  });

  /**
   * Helper function to create successful ResultType responses
   */
  const createSuccessResponse = (data: any, meta: any = null): ResultType => ({
    ok: true,
    data,
    meta,
    error: null,
  });

  /**
   * Helper function to create error ResultType responses
   */
  const createErrorResponse = (message: string): ResultType => ({
    ok: false,
    data: null,
    meta: null,
    error: { message },
  });

  describe('set', () => {
    it('should perform insert when _key is not present', async () => {
      const data = { name: 'Bob', age: 25 };
      const expectedPayload = { action: 'insert', collection: collectionName, data };
      const mockResponse = createSuccessResponse(data);

      dispatchMock.mockResolvedValueOnce(mockResponse);

      const result = await collection.set(collectionName, data);

      expect(dispatchMock).toHaveBeenCalledWith(expectedPayload);
      expect(result).toEqual(mockResponse);
    });

    it('should perform update when _key is present', async () => {
      const data = { _key: 'user123', name: 'Charlie', age: 28 };
      const expectedPayload = {
        action: 'update',
        collection: collectionName,
        filters: { _key: data._key },
        data,
      };
      const mockResponse = createSuccessResponse(data);

      dispatchMock.mockResolvedValueOnce(mockResponse);

      const result = await collection.set(collectionName, data);

      expect(dispatchMock).toHaveBeenCalledWith(expectedPayload);
      expect(result).toEqual(mockResponse);
    });

    it('should return error when collectionName is not a string', async () => {
      // TypeScript prevents passing non-string, but simulate runtime behavior
      const data = { name: 'Bob', age: 25 };
      // @ts-expect-error Testing runtime behavior
      const result = await collection.set(123 as unknown as string, data);
      
      expect(result).toEqual(createErrorResponse("Collection.set: Collection name must be a string."));
      expect(dispatchMock).not.toHaveBeenCalled();
    });

    it('should return error when data is not a plain object', async () => {
      // @ts-expect-error Testing runtime behavior
      const result = await collection.set(collectionName, "not-an-object");
      
      expect(result).toEqual(createErrorResponse("Collection.set: Data must be a plain object."));
      expect(dispatchMock).not.toHaveBeenCalled();
    });

    it('should return error when _key is not a string', async () => {
      const data = { _key: 123, name: 'Charlie', age: 28 };
      
      const result = await collection.set(collectionName, data);
      
      expect(result).toEqual(createErrorResponse("Collection.set: The `_key` must be a string."));
      expect(dispatchMock).not.toHaveBeenCalled();
    });
  });

  describe('get', () => {
    it('should fetch a document successfully', async () => {
      const recordKey = 'user123';
      const fetchedData = { _key: recordKey, name: 'Alice', age: 30 };
      const expectedPayload = { action: 'fetch', collection: collectionName, recordKey };
      const mockResponse = createSuccessResponse(fetchedData);

      dispatchMock.mockResolvedValueOnce(mockResponse);

      const result = await collection.get(collectionName, recordKey);

      expect(dispatchMock).toHaveBeenCalledWith(expectedPayload);
      expect(result).toEqual(mockResponse);
    });

    it('should return error when collectionName is not a string', async () => {
      const recordKey = 'user123';
      // @ts-expect-error Testing runtime behavior
      const result = await collection.get(123 as unknown as string, recordKey);
      
      expect(result).toEqual(createErrorResponse("Collection.get: Collection name must be a string."));
      expect(dispatchMock).not.toHaveBeenCalled();
    });

    it('should return error when recordKey is not a string', async () => {
      // @ts-expect-error Testing runtime behavior
      const result = await collection.get(collectionName, 456 as unknown as string);
      
      expect(result).toEqual(createErrorResponse("Collection.get: Record key must be a string."));
      expect(dispatchMock).not.toHaveBeenCalled();
    });
  });

  describe('delete', () => {
    it('should delete a document by _key successfully', async () => {
      const identifier = 'user123';
      const expectedPayload = { action: 'delete', collection: collectionName, identifier };
      const mockResponse = createSuccessResponse(null);

      dispatchMock.mockResolvedValueOnce(mockResponse);

      const result = await collection.delete(collectionName, identifier);

      expect(dispatchMock).toHaveBeenCalledWith(expectedPayload);
      expect(result).toEqual(mockResponse);
    });

    it('should delete documents based on criteria successfully', async () => {
      const identifier: QueryCriteriaType = {
        filters: { age: { $lt: 20 } },
        sort: null,
        limit: 0,
        offset: 0,
        page: 0,
        per_page: 0,
      };
      const expectedPayload = { action: 'delete', collection: collectionName, ...identifier };
      const mockResponse = createSuccessResponse(null);

      dispatchMock.mockResolvedValueOnce(mockResponse);

      const result = await collection.delete(collectionName, identifier);

      expect(dispatchMock).toHaveBeenCalledWith(expectedPayload);
      expect(result).toEqual(mockResponse);
    });

    it('should return error when collectionName is not a string', async () => {
      const identifier = 'user123';
      // @ts-expect-error Testing runtime behavior
      const result = await collection.delete(123 as unknown as string, identifier);
      
      expect(result).toEqual(createErrorResponse("Collection.delete: Collection name must be a string."));
      expect(dispatchMock).not.toHaveBeenCalled();
    });

    it('should return error when identifier is neither string nor plain object', async () => {
      // @ts-expect-error Testing runtime behavior
      const result = await collection.delete(collectionName, 789);
      
      expect(result).toEqual(createErrorResponse("Collection.delete: Identifier must be a string or a QueryCriteriaType object."));
      expect(dispatchMock).not.toHaveBeenCalled();
    });
  });

  describe('list', () => {
    it('should fetch documents successfully', async () => {
      const criteria: QueryCriteriaType = {
        filters: { isActive: true },
        sort: { age: -1 },
        limit: 10,
        offset: 0,
        page: 1,
        per_page: 10,
      };
      const expectedPayload = { action: 'fetch', collection: collectionName, ...criteria };
      const fetchedData = [{ _key: 'user123', name: 'Alice', age: 30 }];
      const mockResponse = createSuccessResponse(fetchedData);

      dispatchMock.mockResolvedValueOnce(mockResponse);

      const result = await collection.list(collectionName, criteria);

      expect(dispatchMock).toHaveBeenCalledWith(expectedPayload);
      expect(result).toEqual(mockResponse);
    });

    it('should return error when collectionName is not a string', async () => {
      const criteria: QueryCriteriaType = {
        filters: { isActive: true },
        sort: { age: -1 },
        limit: 10,
        offset: 0,
        page: 1,
        per_page: 10,
      };
      // @ts-expect-error Testing runtime behavior
      const result = await collection.list(123 as unknown as string, criteria);
      
      expect(result).toEqual(createErrorResponse("Collection.list: Collection name must be a string."));
      expect(dispatchMock).not.toHaveBeenCalled();
    });

    it('should return error when criteria does not have filters', async () => {
      const invalidCriteria = {
        sort: { age: -1 },
        limit: 10,
        offset: 0,
        page: 1,
        per_page: 10,
      };
      // @ts-expect-error Testing runtime behavior
      const result = await collection.list(collectionName, invalidCriteria);
      
      expect(result).toEqual(createErrorResponse("Collection.list: Criteria must be a QueryCriteriaType object with `filters`."));
      expect(dispatchMock).not.toHaveBeenCalled();
    });
  });

  describe('update', () => {
    it('should update a single document successfully', async () => {
      const criteria: MutationCriteriaType = {
        filters: { _key: 'user123' },
        data: { age: 31 },
      };
      const expectedPayload = { action: 'update', collection: collectionName, ...criteria };
      const mockResponse = createSuccessResponse(criteria.data);

      dispatchMock.mockResolvedValueOnce(mockResponse);

      const result = await collection.update(collectionName, criteria);

      expect(dispatchMock).toHaveBeenCalledWith(expectedPayload);
      expect(result).toEqual(mockResponse);
    });

    it('should update multiple documents successfully', async () => {
      const criteria: MutationCriteriaType = {
        filters: { isActive: false },
        data: [
          { _key: 'user124', age: 22 },
          { _key: 'user125', age: 23 },
        ],
      };
      const expectedPayload = { action: 'update', collection: collectionName, ...criteria };
      const mockResponse = createSuccessResponse(criteria.data);

      dispatchMock.mockResolvedValueOnce(mockResponse);

      const result = await collection.update(collectionName, criteria);

      expect(dispatchMock).toHaveBeenCalledWith(expectedPayload);
      expect(result).toEqual(mockResponse);
    });

    it('should return error when collectionName is not a string', async () => {
      const criteria: MutationCriteriaType = {
        filters: { _key: 'user123' },
        data: { age: 31 },
      };
      // @ts-expect-error Testing runtime behavior
      const result = await collection.update(123 as unknown as string, criteria);
      
      expect(result).toEqual(createErrorResponse("Collection.update: Collection name must be a string."));
      expect(dispatchMock).not.toHaveBeenCalled();
    });

    it('should return error when criteria is invalid', async () => {
      const invalidCriteria = {
        filters: { _key: 'user123' },
        // Missing 'data'
      };
      // @ts-expect-error Testing runtime behavior
      const result = await collection.update(collectionName, invalidCriteria);
      
      expect(result).toEqual(createErrorResponse("Collection.update: Criteria must be a MutationCriteriaType object with `filters` and `data`."));
      expect(dispatchMock).not.toHaveBeenCalled();
    });

    it('should return error when data array is empty', async () => {
      const criteria: MutationCriteriaType = {
        filters: { isActive: false },
        data: [],
      };
      
      const result = await collection.update(collectionName, criteria);
      
      expect(result).toEqual(createErrorResponse("Collection.update: Data array cannot be empty."));
      expect(dispatchMock).not.toHaveBeenCalled();
    });

    it('should return error when an item in data array lacks _key', async () => {
      const criteria: MutationCriteriaType = {
        filters: { isActive: false },
        data: [
          { age: 22 }, // Missing _key
          { _key: 'user125', age: 23 },
        ],
      };
      
      const result = await collection.update(collectionName, criteria);
      
      expect(result).toEqual(createErrorResponse("Collection.update: Each item must be a plain object with a valid `_key` string."));
      expect(dispatchMock).not.toHaveBeenCalled();
    });

    it('should return error when data has invalid _key type', async () => {
      const criteria: MutationCriteriaType = {
        filters: { _key: 'user123' },
        data: { _key: 456, age: 31 }, // _key should be string
      };
      
      const result = await collection.update(collectionName, criteria);
      
      expect(result).toEqual(createErrorResponse("Collection.update: Data must be a plain object with a valid `_key` string."));
      expect(dispatchMock).not.toHaveBeenCalled();
    });
  });

  describe('search', () => {
    it('should search documents successfully', async () => {
      const criteria: SearchCriteriaType = {
        query: { name: 'Alice' },
        limit: 5,
      };
      const expectedPayload = { action: 'search', collection: collectionName, ...criteria };
      const searchResults = [{ _key: 'user123', name: 'Alice', age: 30 }];
      const mockResponse = createSuccessResponse(searchResults);

      dispatchMock.mockResolvedValueOnce(mockResponse);

      const result = await collection.search(collectionName, criteria);

      expect(dispatchMock).toHaveBeenCalledWith(expectedPayload);
      expect(result).toEqual(mockResponse);
    });

    it('should return error when collectionName is not a string', async () => {
      const criteria: SearchCriteriaType = {
        query: { name: 'Alice' },
        limit: 5,
      };
      // @ts-expect-error Testing runtime behavior
      const result = await collection.search(123 as unknown as string, criteria);
      
      expect(result).toEqual(createErrorResponse("Collection.search: Collection name must be a string."));
      expect(dispatchMock).not.toHaveBeenCalled();
    });

    it('should return error when criteria does not have query', async () => {
      const invalidCriteria = {
        limit: 5,
      };
      // @ts-expect-error Testing runtime behavior
      const result = await collection.search(collectionName, invalidCriteria);
      
      expect(result).toEqual(createErrorResponse("Collection.search: Criteria must be a SearchCriteriaType object with `query`."));
      expect(dispatchMock).not.toHaveBeenCalled();
    });
  });

  describe('count', () => {
    it('should count documents successfully with criteria', async () => {
      const criteria: QueryCriteriaType = {
        filters: { isActive: true },
        sort: null,
        limit: 0,
        offset: 0,
        page: 0,
        per_page: 0,
      };
      const expectedPayload = { action: 'count', collection: collectionName, ...criteria };
      const mockResponse = createSuccessResponse({ count: 10 });

      dispatchMock.mockResolvedValueOnce(mockResponse);

      const result = await collection.count(collectionName, criteria);

      expect(dispatchMock).toHaveBeenCalledWith(expectedPayload);
      expect(result).toEqual(mockResponse);
    });

    it('should count documents successfully without criteria', async () => {
      const expectedPayload = { action: 'count', collection: collectionName, ...{} };
      const mockResponse = createSuccessResponse({ count: 100 });

      dispatchMock.mockResolvedValueOnce(mockResponse);

      const result = await collection.count(collectionName);

      expect(dispatchMock).toHaveBeenCalledWith(expectedPayload);
      expect(result).toEqual(mockResponse);
    });

    it('should return error when collectionName is not a string', async () => {
      const criteria: QueryCriteriaType = {
        filters: { isActive: true },
        sort: null,
        limit: 0,
        offset: 0,
        page: 0,
        per_page: 0,
      };
      // @ts-expect-error Testing runtime behavior
      const result = await collection.count(123 as unknown as string, criteria);
      
      expect(result).toEqual(createErrorResponse("Collection.count: Collection name must be a string."));
      expect(dispatchMock).not.toHaveBeenCalled();
    });

    it('should return error when criteria is invalid', async () => {
      const invalidCriteria = {
        sort: null,
        limit: 0,
        offset: 0,
        page: 0,
        per_page: 0,
      };
      // @ts-expect-error Testing runtime behavior
      const result = await collection.count(collectionName, invalidCriteria);
      
      expect(result).toEqual(createErrorResponse("Collection.count: Criteria must be a QueryCriteriaType object or null."));
      expect(dispatchMock).not.toHaveBeenCalled();
    });
  });

  describe('archive', () => {
    it('should archive a document by _key successfully', async () => {
      const identifier = 'user123';
      const expectedPayload = { action: 'archive', collection: collectionName, identifier };
      const mockResponse = createSuccessResponse(null);

      dispatchMock.mockResolvedValueOnce(mockResponse);

      const result = await collection.archive(collectionName, identifier);

      expect(dispatchMock).toHaveBeenCalledWith(expectedPayload);
      expect(result).toEqual(mockResponse);
    });

    it('should archive documents based on criteria successfully', async () => {
      const identifier: QueryCriteriaType = {
        filters: { age: { $lt: 20 } },
        sort: null,
        limit: 0,
        offset: 0,
        page: 0,
        per_page: 0,
      };
      const expectedPayload = { action: 'archive', collection: collectionName, ...identifier };
      const mockResponse = createSuccessResponse(null);

      dispatchMock.mockResolvedValueOnce(mockResponse);

      const result = await collection.archive(collectionName, identifier);

      expect(dispatchMock).toHaveBeenCalledWith(expectedPayload);
      expect(result).toEqual(mockResponse);
    });

    it('should return error when collectionName is not a string', async () => {
      const identifier = 'user123';
      // @ts-expect-error Testing runtime behavior
      const result = await collection.archive(123 as unknown as string, identifier);
      
      expect(result).toEqual(createErrorResponse("Collection.archive: Collection name must be a string."));
      expect(dispatchMock).not.toHaveBeenCalled();
    });

    it('should return error when identifier is neither string nor plain object', async () => {
      // @ts-expect-error Testing runtime behavior
      const result = await collection.archive(collectionName, 456);
      
      expect(result).toEqual(createErrorResponse("Collection.archive: Identifier must be a string or a QueryCriteriaType object."));
      expect(dispatchMock).not.toHaveBeenCalled();
    });
  });

  describe('restore', () => {
    it('should restore a document successfully', async () => {
      const archiveKey = 'archiveKey123';
      const expectedPayload = { action: 'restore', archiveKey };
      const restoredData = { _key: 'user123', name: 'Alice', age: 30 };
      const mockResponse = createSuccessResponse(restoredData);

      dispatchMock.mockResolvedValueOnce(mockResponse);

      const result = await collection.restore(archiveKey);

      expect(dispatchMock).toHaveBeenCalledWith(expectedPayload);
      expect(result).toEqual(mockResponse);
    });

    it('should return error when archiveKey is not a string', async () => {
      // @ts-expect-error Testing runtime behavior
      const result = await collection.restore(789);
      
      expect(result).toEqual(createErrorResponse("Collection.restore: Archive key must be a string."));
      expect(dispatchMock).not.toHaveBeenCalled();
    });
  });
});
