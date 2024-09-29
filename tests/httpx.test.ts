import httpx, { buildURL } from '../src/httpx';

// Mock the global fetch function
global.fetch = jest.fn();

describe('HTTPX Library', () => {
  afterEach(() => {
    jest.clearAllMocks();
  });

  it('should make a GET request successfully', async () => {
    const mockResponse = { data: { message: 'Success' }, ok: true };
    (fetch as jest.Mock).mockResolvedValueOnce({
      ok: true,
      status: 200,
      statusText: 'OK',
      headers: { get: jest.fn().mockReturnValue('application/json') },
      json: jest.fn().mockResolvedValueOnce(mockResponse),
    });

    const options = { url: 'https://api.example.com/data', method: 'GET' };
    const response = await httpx(options);

    expect(fetch).toHaveBeenCalledWith('https://api.example.com/data', {
      method: 'GET',
      headers: {},
    });
    expect(response.ok).toBe(true);
    expect(response.data).toEqual(mockResponse);
  });

  it('should make a POST request with JSON data', async () => {
    const mockResponse = { data: { message: 'Created' }, ok: true };
    (fetch as jest.Mock).mockResolvedValueOnce({
      ok: true,
      status: 201,
      statusText: 'Created',
      headers: { get: jest.fn().mockReturnValue('application/json') },
      json: jest.fn().mockResolvedValueOnce(mockResponse),
    });

    const options = {
      url: 'https://api.example.com/data',
      method: 'POST',
      data: { name: 'New Item' },
    };
    const response = await httpx(options);

    expect(fetch).toHaveBeenCalledWith('https://api.example.com/data', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(options.data),
    });
    expect(response.ok).toBe(true);
    expect(response.data).toEqual(mockResponse);
  });

  it('should handle errors from the server', async () => {
    (fetch as jest.Mock).mockResolvedValueOnce({
      ok: false,
      status: 404,
      statusText: 'Not Found',
      headers: { get: jest.fn().mockReturnValue('application/json') },
      json: jest.fn().mockResolvedValueOnce({ error: 'Not Found' }),
    });

    const options = { url: 'https://api.example.com/data', method: 'GET' };
    const response = await httpx(options);

    expect(fetch).toHaveBeenCalledWith('https://api.example.com/data', {
      method: 'GET',
      headers: {},
    });
    expect(response.ok).toBe(false);
    expect(response.error).toBe('Error 404: Not Found');
  });

  it('should build URL with query parameters', () => {
    const url = buildURL('https://api.example.com/data', { search: 'test' });
    expect(url).toBe('https://api.example.com/data?search=test');
  });

  it('should append query parameters to existing URL', () => {
    const url = buildURL('https://api.example.com/data?sort=asc', { search: 'test' });
    expect(url).toBe('https://api.example.com/data?sort=asc&search=test');
  });

  it('should handle base URLs', () => {
    const url = buildURL('/data', { search: 'test' }, 'https://api.example.com');
    expect(url).toBe('https://api.example.com/data?search=test');
  });
});
