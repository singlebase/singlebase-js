import Filestore from '../src/Filestore';
import httpx from '../src/httpx';
import { getKeyFromFilePath } from '../src/lib';
import { ResponseType } from '../src/types';

jest.mock('./httpx');
jest.mock('./lib', () => ({
  getKeyFromFilePath: jest.fn(),
  parseXmlToJson: jest.fn(),
}));

describe('Filestore', () => {
  let dispatchMock: jest.Mock;
  let filestore: Filestore;

  beforeEach(() => {
    dispatchMock = jest.fn();
    filestore = new Filestore(dispatchMock);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('getInfo', () => {
    it('should call dispatch with the correct action and key', async () => {
      const mockKey = 'mock-key';
      const mockResponse: ResponseType = { ok: true, data: {} };

      (getKeyFromFilePath as jest.Mock).mockReturnValue(mockKey);
      dispatchMock.mockResolvedValue(mockResponse);

      const result = await filestore.getInfo('mock/path');

      expect(getKeyFromFilePath).toHaveBeenCalledWith('mock/path');
      expect(dispatchMock).toHaveBeenCalledWith({ action: 'file.info', _key: mockKey });
      expect(result).toEqual(mockResponse);
    });
  });

  describe('getDownloadURL', () => {
    it('should return the download URL if available', async () => {
      const mockKey = 'mock-key';
      const mockResponse: ResponseType = { ok: true, data: { url: 'http://download.url' } };

      (getKeyFromFilePath as jest.Mock).mockReturnValue(mockKey);
      dispatchMock.mockResolvedValue(mockResponse);

      const result = await filestore.getDownloadURL('mock/path');

      expect(result).toEqual('http://download.url');
    });

    it('should return null if the response is not ok', async () => {
      const mockKey = 'mock-key';
      const mockResponse: ResponseType = { ok: false, data: {} };

      (getKeyFromFilePath as jest.Mock).mockReturnValue(mockKey);
      dispatchMock.mockResolvedValue(mockResponse);

      const result = await filestore.getDownloadURL('mock/path');

      expect(result).toBeNull();
    });
  });

  describe('upload', () => {
    it('should return file info on successful upload', async () => {
      const file = new File(['content'], 'filename.png', { type: 'image/png' });
      const mockPresignedResponse: ResponseType = {
        ok: true,
        data: {
          presigned_data: { url: 'http://upload.url', fields: { key: 'value' } },
          info: { id: '123', name: 'filename.png' }
        }
      };

      dispatchMock.mockResolvedValue(mockPresignedResponse);
      (httpx as jest.Mock).mockResolvedValue({});

      const [fileInfo, error] = await filestore.upload(file);

      expect(fileInfo).toEqual(mockPresignedResponse.data.info);
      expect(error).toBeNull();
    });

    it('should return error if presigned post fails', async () => {
      const file = new File(['content'], 'filename.png', { type: 'image/png' });
      const mockPresignedResponse: ResponseType = { ok: false, error: { message: 'Failed' } };

      dispatchMock.mockResolvedValue(mockPresignedResponse);

      const [fileInfo, error] = await filestore.upload(file);

      expect(fileInfo).toBeNull();
      expect(error).toEqual({ message: 'Failed' });
    });

    it('should handle upload error and return it', async () => {
      const file = new File(['content'], 'filename.png', { type: 'image/png' });
      const mockPresignedResponse: ResponseType = {
        ok: true,
        data: {
          presigned_data: { url: 'http://upload.url', fields: { key: 'value' } },
          info: {}
        }
      };

      dispatchMock.mockResolvedValue(mockPresignedResponse);
      (httpx as jest.Mock).mockRejectedValue({ response: { data: '<Error>Upload Failed</Error>' } });

      const [fileInfo, error] = await filestore.upload(file);

      expect(fileInfo).toBeNull();
      expect(error).toEqual({ error: 'Upload Failed' });
    });
  });

  describe('delete', () => {
    it('should return true if delete is successful', async () => {
      const mockKey = 'mock-key';
      const mockResponse: ResponseType = { ok: true, data: {} };

      (getKeyFromFilePath as jest.Mock).mockReturnValue(mockKey);
      dispatchMock.mockResolvedValue(mockResponse);

      const result = await filestore.delete('mock/path');

      expect(getKeyFromFilePath).toHaveBeenCalledWith('mock/path');
      expect(dispatchMock).toHaveBeenCalledWith({ action: 'file.delete', _key: mockKey });
      expect(result).toBe(true);
    });

    it('should return false if delete is not successful', async () => {
      const mockKey = 'mock-key';
      const mockResponse: ResponseType = { ok: false, data: {} };

      (getKeyFromFilePath as jest.Mock).mockReturnValue(mockKey);
      dispatchMock.mockResolvedValue(mockResponse);

      const result = await filestore.delete('mock/path');

      expect(result).toBe(false);
    });
  });

  describe('query', () => {
    it('should throw an error if filters are not provided', async () => {
      await expect(filestore.query({})).rejects.toThrow("Filestore: 'filters' parameter is required for storage.query.");
    });

    it('should call dispatch with the correct action and params', async () => {
      const params = { filters: { someFilter: true } };
      await filestore.query(params);

      expect(dispatchMock).toHaveBeenCalledWith({ ...params, action: 'storage.query' });
    });
  });
});
