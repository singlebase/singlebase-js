// AuthClient.ts

import {
  copy,
  useReactiveState,
  splitFullName,
  AuthResultOk,
  AuthResultErr,
  useStorage,
} from './lib';

import {
  CredentialsInterface,
  AuthStateType,
  AuthResultInterface,
  IOResponseType,
  UserInterface,
  DispatchType,
  UpdateAccountInterface,
  UpdateProfileInterface,
  SendOTPInterface,
} from './types';

/** Storage key for the authentication token */
const STORAGE_TOKEN_KEY = 'token';
/** Storage key for the nonce */
const STORAGE_NONCE_KEY = 'nonce';

/** Interval duration (in milliseconds) to check and refresh the current session */
const AUTO_REFRESH_TICK_DURATION = 60 * 1000; // Changed to 60 seconds
/** Margin (in seconds) before token expiry to attempt refresh */
const EXPIRY_MARGIN = 60;

/** Maximum number of retries for network requests */
const MAX_RETRIES = 10;
/** Interval (in deciseconds) between retry attempts */
const RETRY_INTERVAL = 2;

/**
 * AuthClient handles user authentication, including sign-up, sign-in, token management, and OAuth flows.
 */
class AuthClient {
  /** Dispatcher function for handling authentication actions */
  private readonly _dispatch: DispatchType;
  /** Storage utility for persisting authentication data */
  private readonly _storage: ReturnType<typeof useStorage>;
  /** Reactive state holding authentication data */
  private readonly _state: AuthStateType;
  /** Application settings fetched from the server */
  public settings: object | null;
  /** Timer identifier for the token auto-refresh mechanism */
  private _autoRefreshTicker: number | null;
  /** Flag indicating whether auto-refresh is enabled */
  private readonly _autoRefreshToken: boolean;
  /** Flag indicating whether it's initialized */
  private _initialized: boolean;
  /** Flag indicating whether a refresh is in progress */
  private _refreshInProgress: boolean;
  /** Flag indicating whether the token refresh has failed */
  private _refreshFailed: boolean;
  /** Number of retry attempts */
  private _retryCount: number;

  /**
   * Initializes a new instance of AuthClient.
   *
   * @param dispatch - The dispatch function for handling authentication actions.
   * @param storage - The storage utility for persisting authentication data.
   * @param autoRefreshToken - Flag to enable or disable automatic token refreshing.
   */
  constructor(dispatch: DispatchType, storage: ReturnType<typeof useStorage>, autoRefreshToken = true) {
    this._dispatch = dispatch;
    this._storage = storage;
    this._autoRefreshToken = autoRefreshToken;
    this.settings = null;
    this._autoRefreshTicker = null;
    this._initialized = false;

    this._refreshInProgress = false;
    this._refreshFailed = false;
    this._retryCount = 0;

    this._state = useReactiveState({
      user_profile: null,
      token: null,
    });

    // Initialize authentication client
    this.initialize();
  }

  /**
   * Initializes the authentication client by loading settings, adding storage event listeners,
   * loading cached authentication data, and starting the auto-refresh mechanism.
   */
  public async initialize(): Promise<void> {
    if (this._initialized) {
      return;
    }

    await this.loadSettings();
    this._addStorageEventListener();
    await this._loadFromCache();
    if (this._autoRefreshToken) {
      this._startAutoRefreshToken();
    }
    this._initialized = true;
  }

  /** 
   * Retrieves the user's unique key.
   *
   * @returns The user key or null if not available.
   */
  public get userKey(): string | null {
    return this._state?.user_profile?.user_key || null;
  }

  /** 
   * Retrieves a copy of the user's profile.
   *
   * @returns The user profile object or null if not available.
   */
  public get userProfile(): UserInterface | null {
    return copy(this._state?.user_profile);
  }

  /** 
   * Retrieves the user's full name split into components.
   *
   * @returns An object containing the split full name or undefined if not available.
   */
  public get fullName() {
    return splitFullName(this.userProfile?.display_name);
  }

  /** 
   * Retrieves the user's email address.
   *
   * @returns The user's email or undefined if not available.
   */
  public get email(): string | undefined {
    return this._state?.user_profile?.email;
  }

  /** 
   * Checks if the user is authenticated based on the presence and validity of the token.
   *
   * @returns True if authenticated, false otherwise.
   */
  public get isAuthenticated(): boolean {
    return !!(this._state?.token?.id_token && this._isTokenValid(this._state.token));
  }

  /** 
   * Retrieves the current ID token (JWT) if authenticated.
   *
   * @returns The ID token string or null if not authenticated.
   */
  public get idToken(): string | null {
    return this.isAuthenticated ? this._state?.token?.id_token || null : null;
  }

  /**
   * Updates the user's account information, such as email, password, or username.
   * Requires an OTP for verification.
   *
   * @param data - The account update data.
   * @returns A promise resolving to the authentication result.
   */
  public async updateAccount(data: UpdateAccountInterface): Promise<AuthResultInterface> {
    try {
      const resp = await this._dispatch({
        action: 'auth.update_account',
        ...data,
      });

      if (resp.ok) {
        this._setAuthData(resp.data);
        const userProfile = resp.data?.user_profile;
        return AuthResultOk(userProfile);
      }

      return AuthResultErr(resp.error);
    } catch (error) {
      return AuthResultErr(error);
    }
  }

  /**
   * Updates the user's profile information, such as display name, phone number, photo URL, or metadata.
   *
   * @param data - The profile update data.
   * @returns A promise resolving to the authentication result.
   */
  public async updateProfile(data: UpdateProfileInterface): Promise<AuthResultInterface> {
    try {
      const idToken = await this.getIdToken();
      if (!idToken) {
        return AuthResultErr('Invalid or missing ID token.');
      }

      const token = this._getToken();
      if (!token) {
        return AuthResultErr('Missing token.');
      }

      const { aud, id_token, refresh_token } = token;
      const resp = await this._dispatch({
        action: 'auth.update_profile',
        aud,
        id_token,
        refresh_token,
        data,
      });

      if (resp.ok) {
        this._setAuthData(resp.data);
        const userProfile = resp.data?.user_profile;
        return AuthResultOk(userProfile);
      }

      return AuthResultErr(resp.error);
    } catch (error) {
      return AuthResultErr(error);
    }
  }

  /**
   * Sends a One-Time Password (OTP) for verification purposes.
   *
   * @param data - The OTP sending data, including email and intent.
   * @returns A promise resolving to the authentication result.
   */
  public async sendOTP(data: SendOTPInterface): Promise<AuthResultInterface> {
    try {
      const resp = await this._dispatch({
        action: 'auth.send_otp',
        ...data,
      });

      if (resp.ok) {
        return AuthResultOk(true);
      }

      return AuthResultErr(resp.error);
    } catch (error) {
      return AuthResultErr(error);
    }
  }

  /**
   * Registers a new user using email and password credentials.
   *
   * @param credentials - The user's credentials.
   * @returns A promise resolving to the authentication result.
   */
  public async signUpWithPassword(credentials: CredentialsInterface): Promise<AuthResultInterface> {
    try {
      this._clearState();
      const resp = await this._dispatch({
        ...credentials,
        action: 'auth.signup',
      });

      if (resp.ok) {
        return AuthResultOk(resp.data);
      }

      return AuthResultErr(resp.error);
    } catch (error) {
      return AuthResultErr(error);
    } finally {
      this._clearState();
      this._purgeCache();
    }
  }

  /**
   * Signs in a user using email and password credentials.
   *
   * @param credentials - The user's credentials.
   * @returns A promise resolving to the authentication result.
   */
  public async signInWithPassword(credentials: CredentialsInterface): Promise<AuthResultInterface> {
    try {
      this._clearState();
      const resp = await this._dispatch({
        grant_type: 'password',
        ...credentials,
        action: 'auth.signin',
      });

      if (resp.ok) {
        this._setAuthData(resp.data);
        const userProfile = resp.data?.user_profile;
        return AuthResultOk(userProfile);
      }

      this._clearState();
      this._purgeCache();
      return AuthResultErr(resp.error);
    } catch (error) {
      this._clearState();
      this._purgeCache();
      return AuthResultErr(error);
    }
  }

  /**
   * Initiates the OAuth sign-in process by obtaining a nonce and redirecting the user to the provider.
   *
   * @param provider - The OAuth provider (e.g., 'google', 'facebook').
   * @returns A promise resolving to the authentication result containing the redirect URL and provider.
   */
  public async signInWithOAuth(provider: string): Promise<AuthResultInterface> {
    try {
      this._clearState();
      const nonce = await this.getNonce();

      if (!nonce) {
        this._clearState();
        this._purgeCache();
        return AuthResultErr('Failed to obtain nonce.');
      }

      this._storage.set(STORAGE_NONCE_KEY, nonce);
      const resp = await this._dispatch({
        action: 'auth.oauth_connect',
        intent: 'signup', // Can be 'signup' or 'signin'
        provider,
        nonce,
      });

      if (resp.ok) {
        const data = resp.data;
        return AuthResultOk({
          redirectURL: data?.oauth_redirect_url,
          provider: data?.oauth_provider,
          action: 'REDIRECT',
        });
      }

      return AuthResultErr(resp.error);
    } catch (error) {
      this._clearState();
      this._purgeCache();
      return AuthResultErr(error);
    }
  }

  /**
   * Completes the OAuth sign-in process by exchanging the access code and nonce for authentication tokens.
   *
   * @param accessCode - The access code received from the OAuth provider.
   * @param nonce - The nonce used during the OAuth initiation. If not provided, it will be retrieved from storage.
   * @returns A promise resolving to the authentication result.
   */
  public async signInWithOAuthAccessCode(
    accessCode: string | null,
    nonce: string | null = null
  ): Promise<AuthResultInterface> {
    try {
      this._stopAutoRefreshToken();

      if (!nonce) {
        nonce = this._storage.get(STORAGE_NONCE_KEY);
      }

      if (!nonce) {
        this._clearState();
        this._purgeCache();
        return AuthResultErr('Missing nonce.');
      }

      const token = this._getToken();
      if (!token) {
        this._clearState();
        this._purgeCache();
        return AuthResultErr('Missing token.');
      }

      const { aud, id_token, refresh_token } = token;
      const resp = await this._dispatch({
        action: 'auth.signin',
        grant_type: 'access_code',
        access_code: accessCode,
        nonce,
        id_token,
        refresh_token,
      });

      if (resp.ok) {
        this._setAuthData(resp.data);
        const userProfile = resp.data?.user_profile;
        return AuthResultOk(userProfile);
      }

      this._clearState();
      this._purgeCache();
      return AuthResultErr(resp.error || 'OAuth access code sign-in failed.');
    } catch (error) {
      this._clearState();
      this._purgeCache();
      return AuthResultErr(error);
    }
  }

  /**
   * Signs out the current user by invalidating the token and clearing authentication data.
   *
   * @returns A promise resolving to a boolean indicating the success of the sign-out operation.
   */
  public async signOut(): Promise<boolean> {
    try {
      const idToken = await this.getIdToken(false);
      if (idToken) {
        const token = this._getToken();
        if (!token) {
          return false;
        }

        const resp = await this._dispatch({
          action: 'auth.signout',
          id_token: token.id_token,
          aud: token.aud,
        });

        return resp.ok;
      }
      return true;
    } catch (error) {
      return false;
    } finally {
      this._clearState();
      this._purgeCache();
    }
  }

  /**
   * Retrieves the authenticated user's profile information.
   *
   * @returns A promise resolving to the user profile object or null if not authenticated.
   */
  public async getUser(): Promise<UserInterface | null> {
    if (await this.getIdToken()) {
      return this._state?.user_profile || null;
    }
    return null;
  }

  /**
   * Obtains a nonce value used for OAuth flows. The nonce is time-based and must be used promptly.
   *
   * @returns A promise resolving to the nonce string or null if retrieval fails.
   */
  public async getNonce(): Promise<string | null> {
    try {
      const resp = await this._dispatch({
        action: 'auth.nonce',
      });

      if (resp.ok) {
        return resp.data?.nonce || null;
      }
    } catch {
      // Silently fail and return null
    }
    return null;
  }

  /**
   * Retrieves the current ID token (JWT). If the token is expired and `refresh` is true,
   * it attempts to refresh the token.
   *
   * @param refresh - Flag indicating whether to attempt token refresh if expired.
   * @returns A promise resolving to the ID token string or null if not available.
   */
  public async getIdToken(refresh = true): Promise<string | null> {
    const token = this._getToken();
    if (token) {
      if (this._isTokenValid(token)) {
        return token.id_token || null;
      }

      if (refresh && token.refresh_token) {
        if (await this._refreshToken(token.refresh_token, token.id_token)) {
          return await this.getIdToken(false);
        }
      }
    }
    return null;
  }

  /**
   * Manually refreshes the user's session by obtaining a new token.
   *
   * @returns A promise resolving to the new ID token string or null if refresh fails.
   */
  public async refreshSession(): Promise<string | null> {
    const token = this._getToken();
    if (token && token.refresh_token && token.id_token && (await this._refreshToken(token.refresh_token, token.id_token))) {
      return this.getIdToken(false);
    }
    return null;
  }

  /**
   * Loads application settings from the authentication server.
   *
   * @returns A promise resolving to the authentication result containing the settings.
   */
  public async loadSettings(): Promise<AuthResultInterface> {
    try {
      const resp = await this._dispatch({ action: 'auth.settings' });

      if (resp.ok) {
        this.settings = resp.data;
        return AuthResultOk(resp.data);
      }

      this.settings = null;
      return AuthResultErr(resp.error);
    } catch (error) {
      this.settings = null;
      return AuthResultErr(error);
    }
  }

  /**
   * Subscribes to state changes in the authentication state.
   *
   * @param callback - The function to call when the state changes.
   * @returns A subscription object that can be used to unsubscribe.
   */
  public onStateChanged(callback: (changes: Partial<AuthStateType>, prev: Partial<AuthStateType>, state: AuthStateType) => void) {
    return this._state.subscribe(callback);
  }

  /**
   * Subscribes to authentication state changes, specifically token updates, and invokes the callback with the updated user profile.
   *
   * @param callback - The function to call when the authentication state changes.
   * @returns A subscription object that can be used to unsubscribe.
   */
  public onAuthStateChanged(callback: (userProfile: UserInterface | null) => void) {
    // Invoke the callback immediately with the current state
    callback(copy(this._state?.user_profile));

    return this.onStateChanged((changes, prev) => {
      if (changes?.token?.id_token !== prev?.token?.id_token) {
        callback(copy(changes?.user_profile));
      }
    });
  }

  /**
   * Refreshes the authentication state by loading data from the cache.
   *
   * @returns A promise resolving to a boolean indicating the success of the operation.
   */
  public async refreshAuthState(): Promise<boolean> {
    return this._loadFromCache();
  }

  /**
   * Loads authentication data from the cache and validates the token.
   *
   * @returns A promise resolving to a boolean indicating whether the cache was successfully loaded.
   */
  private async _loadFromCache(): Promise<boolean> {
    const token = this._getCachedToken();
    if (token) {
      if (this._isTokenValid(token)) {
        this._setState(token);
        return true;
      } else if (token.refresh_token) {
        return await this._refreshToken(token.refresh_token, token.id_token);
      }
    } else {
      this._clearState();
    }
    return false;
  }

  /**
   * Retrieves the token from the cache.
   *
   * @returns The token object or null if not found.
   */
  private _getToken(): IOResponseType | null {
    return this._getCachedToken();
  }

  /**
   * Retrieves the cached token from storage.
   *
   * @returns The cached token object or null if not found.
   */
  private _getCachedToken(): IOResponseType | null {
    return this._storage.get(STORAGE_TOKEN_KEY);
  }

  /**
   * Removes the cached token from storage.
   *
   * @returns A promise resolving to a boolean indicating the success of the purge operation.
   */
  private _purgeCache(): Promise<boolean> {
    return this._storage.remove(STORAGE_TOKEN_KEY);
  }

  /**
   * Sleeps for a given duration.
   *
   * @param ms - The number of milliseconds to sleep.
   * @returns A promise that resolves after the specified duration.
   */
  private _sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  /**
   * Attempts to refresh the authentication token using the provided refresh token and ID token.
   * Ensures only one refresh request is in progress at a time.
   *
   * @param refresh_token - The refresh token.
   * @param id_token - The current ID token.
   * @returns A promise resolving to a boolean indicating whether the refresh was successful.
   */
  private async _refreshToken(refresh_token: string, id_token: string): Promise<boolean> {
    if (!refresh_token || !id_token) return false;

    if (this._refreshInProgress) {
      // Return early if a refresh is already in progress
      return false;
    }

    this._refreshInProgress = true;

    try {
      const resp = await this._dispatch({
        action: 'auth.refresh_token',
        refresh_token,
        id_token,
      });

      if (resp?.ok) {
        this._setAuthData(resp.data);
        this._refreshFailed = false; // Reset refresh failed flag on success
        this._retryCount = 0; // Reset retry count on success
        return true;
      } else {
        // Handle the case where the refresh fails
        this._refreshFailed = true;
        return false;
      }
    } catch {
      // Handle network or other errors
      this._refreshFailed = true;
      return false;
    } finally {
      this._refreshInProgress = false;
    }
  }

  /**
   * Checks if the provided token is valid based on its expiry time.
   *
   * @param token - The token to validate. If not provided, the current token is used.
   * @returns True if the token is valid, false otherwise.
   */
  private _isTokenValid(token: IOResponseType | null = null): boolean {
    const currentToken = token || this._getToken();
    if (currentToken?.id_token && currentToken?.token_info?.exp) {
      const valid = (currentToken?.token_info?.exp * 1000) - (EXPIRY_MARGIN * 1000) > Date.now()
      return valid;
    }
    return false;
  }

  /**
   * Sets the authentication data in the state and storage, and starts the auto-refresh mechanism.
   *
   * @param respData - The response data containing authentication tokens and user profile.
   */
  private _setAuthData(respData: object): void {
    this._stopAutoRefreshToken();
    const now = Date.now();
    const data = { ...respData, expires_at: now + parseInt((respData as any)?.token_info?.ttl, 10) * 1000, created_at: now };
    this._setState(data);
    this._storage.set(STORAGE_TOKEN_KEY, { ...respData, _rev: now });
    this._startAutoRefreshToken();
  }

  /**
   * Clears the authentication state by resetting user profile and token data.
   */
  private _clearState(): void {
    this._stopAutoRefreshToken();
    this._state.__patch__ = {
      user_profile: null,
      token: null,
    };
  }

  /**
   * Updates the reactive state with new authentication data.
   *
   * @param respData - The response data containing authentication tokens and user profile.
   */
  private _setState(respData: object): void {
    this._state.__patch__ = {
      user_profile: (respData as any)?.user_profile || null,
      token: respData || null,
    };
  }

  /**
   * Adds an event listener to handle storage events, ensuring synchronization across multiple tabs.
   */
  private _addStorageEventListener(): void {
    window.addEventListener('storage', this._storageEventListener.bind(this), false);
  }

  /**
   * Removes the storage event listener.
   */
  private _removeStorageEventListener(): void {
    window.removeEventListener('storage', this._storageEventListener.bind(this), false);
  }

  /**
   * Handles storage events to synchronize authentication state across multiple tabs.
   *
   * @param e - The storage event.
   */
  private _storageEventListener(e: StorageEvent): void {
    if (e.key === this._storage.namespace) {
      const oldValue = this._storage.parseData(e.oldValue)?.token?.[1];
      const newValue = this._storage.parseData(e.newValue)?.token?.[1];
      if (oldValue?._rev !== newValue?._rev) {
        this._loadFromCache();
      }
    }
  }

  /**
   * Starts the auto-refresh mechanism to periodically refresh the authentication token.
   */
  private async _startAutoRefreshToken(): Promise<void> {
    await this._stopAutoRefreshToken();
    this._autoRefreshTicker = window.setInterval(() => {
      if (!this._refreshFailed) {
        this.getIdToken();
      }
    }, AUTO_REFRESH_TICK_DURATION);
    // Removed immediate call to this.getIdToken();
  }

  /**
   * Stops the auto-refresh mechanism.
   */
  private async _stopAutoRefreshToken(): Promise<void> {
    if (this._autoRefreshTicker) {
      clearInterval(this._autoRefreshTicker);
      this._autoRefreshTicker = null;
    }
  }
}

/**
 * Factory function to create an instance of AuthClient.
 *
 * @param dispatch - The dispatch function for handling authentication actions.
 * @param authStorageKey - Optional custom storage key for authentication data.
 * @returns An instance of AuthClient.
 */
export default (dispatch: DispatchType, authStorageKey: string | null = null): AuthClient => {
  const storageKey = authStorageKey || 'singlebase:auth';
  const storage = useStorage(storageKey);
  return new AuthClient(dispatch, storage);
};
