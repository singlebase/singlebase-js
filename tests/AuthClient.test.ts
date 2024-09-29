import AuthClient from '../src/AuthClient';
import { AuthResultOk, AuthResultErr } from '../src/lib';

// Mock the dependencies
jest.mock('./lib', () => ({
  copy: jest.fn((data) => data), // Mock copy to return the data as is
  useReactiveState: jest.fn(() => ({
    subscribe: jest.fn(),
    __patch__: null,
  })),
  AuthResultOk: jest.fn((data) => ({ ok: true, data })),
  AuthResultErr: jest.fn((error) => ({ ok: false, error })),
  useStorage: jest.fn(() => ({
    get: jest.fn(),
    set: jest.fn(),
    remove: jest.fn(),
    namespace: 'test:namespace',
    parseData: jest.fn((data) => (data ? JSON.parse(data) : {})),
  })),
}));

describe('AuthClient', () => {
  let dispatch;
  let storage;
  let authClient;

  beforeEach(() => {
    dispatch = jest.fn();
    storage = {
      get: jest.fn(),
      set: jest.fn(),
      remove: jest.fn(),
      namespace: 'test:namespace',
      parseData: jest.fn(),
    };

    authClient = new AuthClient(dispatch, storage);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  test('should initialize the AuthClient', async () => {
    await authClient.initialize();
    expect(authClient._initialized).toBe(true);
    expect(authClient._addStorageEventListener).toHaveBeenCalled();
    expect(authClient.loadSettings).toHaveBeenCalled();
  });

  test('should sign up with password', async () => {
    const credentials = { email: 'test@example.com', password: 'password123' };
    dispatch.mockResolvedValueOnce({ ok: true, data: { user_profile: { user_key: '123' } } });

    const result = await authClient.signUpWithPassword(credentials);
    expect(dispatch).toHaveBeenCalledWith({
      action: 'auth.signup',
      ...credentials,
    });
    expect(result).toEqual(AuthResultOk({ user_profile: { user_key: '123' } }));
  });

  test('should handle sign-in with password', async () => {
    const credentials = { email: 'test@example.com', password: 'password123' };
    dispatch.mockResolvedValueOnce({ ok: true, data: { user_profile: { user_key: '123' } } });

    const result = await authClient.signInWithPassword(credentials);
    expect(dispatch).toHaveBeenCalledWith({
      action: 'auth.signin',
      grant_type: 'password',
      ...credentials,
    });
    expect(result).toEqual(AuthResultOk({ user_profile: { user_key: '123' } }));
  });

  test('should return AuthResultErr on sign-in failure', async () => {
    const credentials = { email: 'test@example.com', password: 'wrongpassword' };
    dispatch.mockResolvedValueOnce({ ok: false, error: 'Invalid credentials' });

    const result = await authClient.signInWithPassword(credentials);
    expect(result).toEqual(AuthResultErr('Invalid credentials'));
  });

  test('should update user profile', async () => {
    const data = { display_name: 'New Name' };
    dispatch.mockResolvedValueOnce({ ok: true, data: { user_profile: { display_name: 'New Name' } } });
    authClient._state.user_profile = { user_key: '123', display_name: 'Old Name' };
    authClient._state.token = { id_token: 'some_token', refresh_token: 'some_refresh_token' };

    const result = await authClient.updateProfile(data);
    expect(dispatch).toHaveBeenCalledWith({
      action: 'auth.update_profile',
      id_token: 'some_token',
      refresh_token: 'some_refresh_token',
      data,
    });
    expect(result).toEqual(AuthResultOk({ display_name: 'New Name' }));
  });

  test('should sign out user', async () => {
    dispatch.mockResolvedValueOnce({ ok: true });
    authClient._state.token = { id_token: 'some_token', aud: 'some_audience' };

    const result = await authClient.signOut();
    expect(dispatch).toHaveBeenCalledWith({
      action: 'auth.signout',
      id_token: 'some_token',
      aud: 'some_audience',
    });
    expect(result).toBe(true);
  });

  test('should handle sign-out failure', async () => {
    dispatch.mockResolvedValueOnce({ ok: false });
    authClient._state.token = { id_token: 'some_token', aud: 'some_audience' };

    const result = await authClient.signOut();
    expect(result).toBe(true); // should return true if the sign out action doesn't fail
  });

  test('should get user profile', async () => {
    authClient._state.user_profile = { user_key: '123', display_name: 'Test User' };
    authClient._state.token = { id_token: 'valid_token' };

    const userProfile = await authClient.getUser();
    expect(userProfile).toEqual({ user_key: '123', display_name: 'Test User' });
  });

  test('should return null for user profile if not authenticated', async () => {
    authClient._state.token = null;

    const userProfile = await authClient.getUser();
    expect(userProfile).toBeNull();
  });
});
