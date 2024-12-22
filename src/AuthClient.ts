// AuthClient.ts

import {
  copy,
  useReactiveState,
  splitFullName,
  AuthResultOk,
  AuthResultErr,
  TimeStorage
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
/** Storage key for the nonce */
const STORAGE_SETTINGS_KEY = 'settings';

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
  private readonly _storage: ReturnType<typeof TimeStorage>;
  /** Reactive state holding authentication data */
  private readonly _state: AuthStateType;
  private _user_profile: object | null;
  private _token: String | null;
  /** Application settings fetched from the server */
  public settings: object | null;
  /** Timer identifier for the token auto-refresh mechanism */
  private _autoRefreshTicker: number | null;
  /** Flag indicating whether session is active */
  private _session_active: boolean;
  /** Flag indicating whether it's initialized */
  private _initialized: boolean;
  /** Flag indicating whether the token refresh has failed */
  private _refreshFailed: boolean;
  /* Hold the resfreshed queue data */
  private _refreshQueue: Promise<boolean> | null = null;
  private readonly _autoRefreshToken: boolean;

  /** Minimum interval between refresh attempts in milliseconds */
  private static readonly MIN_REFRESH_INTERVAL = 5 * 60 * 1000; // 5 minutes
  /** Time of the last refresh attempt */
  private _lastRefreshAttempt: number = 0;
  /** Maximum number of consecutive refresh failures before stopping attempts */
  private static readonly MAX_REFRESH_FAILURES = 3;
  /** Counter for consecutive refresh failures */
  private _consecutiveRefreshFailures: number = 0;

  /**
   * Initializes a new instance of AuthClient.
   *
   * @param dispatch - The dispatch function for handling authentication actions.
   * @param storage - The storage utility for persisting authentication data.
   */
  constructor(dispatch: DispatchType, storage: ReturnType<typeof TimeStorage>) {
    this._dispatch = dispatch;
    this._storage = storage;
    this.settings = null;
    this._autoRefreshTicker = null;
    this._initialized = false;
    this._session_active = false
    this._refreshFailed = false;
  
    this._user_profile = null 
    this._token = null 

    this._state = useReactiveState({ user_profile: null, token: null});

  }

  /**
   * Initializes the authentication client by loading settings, adding storage event listeners,
   * loading cached authentication data, and starting the auto-refresh mechanism.
   */
  public async initSession(opt={session: true}): Promise<void> {

    // stuff to run once
    if (!this._initialized) {
      this._initialized = true;
      this._addStorageEventListener();
      await this.loadSettings();
    }

    /** reload some data if necessary */
    await this._loadFromCache();
    
    if (opt?.session === true && !this._session_active) {
      this._session_active = true
      this._startAutoRefreshToken();
    }
  }


  /** 
   * Retrieves the user's unique key.
   *
   * @returns The user key or null if not available.
   */
  public get userKey(): string | null {
    return this._user_profile?.user_key || null;
  }

  /** 
   * Retrieves a copy of the user's profile.
   *
   * @returns The user profile object or null if not available.
   */
  public get userProfile(): UserInterface | null {
    return copy(this._user_profile);
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
    return this._user_profile?.email;
  }

  /** 
   * Retrieves the current ID token (JWT) if authenticated.
   *
   * @returns The ID token string or null if not authenticated.
   */
  public get idToken(): string | null {
    return this.isAuthenticated() ? this._token?.id_token || null : null;
  }

  /** 
   * Checks if the user is authenticated based on the presence and validity of the token.
   *
   * @returns True if authenticated, false otherwise.
   */
  public isAuthenticated(): boolean {
    return !!(this._isTokenValid(this._token));
  }

  /**
   * Ensure the user is authenticated or it will attempt to refresh the session
   * 
   * @returns Promise resolve to Boolen
   */
  public async ensureSession(): Promise<boolean> {
    if(this.isAuthenticated()) return true
    if (await this.refreshSession()) {
      return true
    }
    return false
  }

  /**
   * Updates the user's account information, such as email, password, or username.
   * Requires an OTP for verification.
   *
   * @param data - The account update data.
   * @returns A promise resolving to the authentication result.
   */
  public async updateAccount(data: UpdateAccountInterface): Promise<AuthResultInterface> {
    return this._authAction('auth.update_account', data);
  }

  /**
   * Updates the user's profile information, such as display name, phone number, photo URL, or metadata.
   *
   * @param data - The profile update data.
   * @returns A promise resolving to the authentication result.
   */
  public async updateProfile(data: UpdateProfileInterface): Promise<AuthResultInterface> {
    const idToken = await this.getIdToken();
    const token = this._getToken()
    if (!idToken || !token) return AuthResultErr('Invalid or Missing ID token.');

    const { aud, id_token, refresh_token } = token;
    const _data = {aud, id_token, refresh_token, data}

    return this._authAction('auth.update_profile', _data);

  }

  /**
   * Sends a One-Time Password (OTP) for verification purposes.
   *
   * @param data - The OTP sending data, including email and intent.
   * @returns A promise resolving to the authentication result.
   */
  public async sendOTP(data: SendOTPInterface): Promise<AuthResultInterface> {
    return this._authAction('auth.send_otp', data);
  }

  /**
   * Registers a new user using email and password credentials.
   *
   * @param credentials - The user's credentials.
   * @returns A promise resolving to the authentication result.
   */
  public async signUpWithPassword(credentials: CredentialsInterface): Promise<AuthResultInterface> {
    return this._authFlow('auth.signup', credentials);
  }

  /**
   * Signs in a user using email and password credentials.
   *
   * @param credentials - The user's credentials.
   * @returns A promise resolving to the authentication result.
   */
  public async signInWithPassword(credentials: CredentialsInterface): Promise<AuthResultInterface> {
    return this._authFlow('auth.signin', { grant_type: 'password', ...credentials });
  }

  /**
   * Initiates the OAuth sign-in process by obtaining a nonce and redirecting the user to the provider.
   *
   * @param provider - The OAuth provider (e.g., 'google', 'facebook').
   * @returns A promise resolving to the authentication result containing the redirect URL and provider.
   */
  public async signInWithOAuth(provider: string): Promise<AuthResultInterface> {
    try {
      this._clearAuthData()
      const nonce = await this.getNonce();

      if (!nonce) {
        return AuthResultErr('Failed to obtain nonce.');
      }

      this._storage.setItem(STORAGE_NONCE_KEY, nonce);
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
      this._clearAuthData();
      return AuthResultErr(resp.error);
    } catch (error) {
      this._clearAuthData();
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

      this._clearAuthData();

      if (!nonce) {
        nonce = this._storage.getItem(STORAGE_NONCE_KEY);
      }

      if (!nonce) {
        return AuthResultErr('Missing nonce.');
      }

      const token = this._getToken();
      if (!token) {
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
      return AuthResultErr(resp.error || 'OAuth access code sign-in failed.');
    } catch (error) {
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
      this._clearAuthData();
    }
  }

  /**
   * Retrieves the authenticated user's profile information.
   *
   * @returns A promise resolving to the user profile object or null if not authenticated.
   */
  public async getUser(): Promise<UserInterface | null> {
    if (await this.getIdToken()) {
      return this._user_profile || null;
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
    if (!token) return null;

    if (this._isTokenValid(token)) {
      return token.id_token;
    }

    if (refresh && token.refresh_token && !this._refreshQueue) {
      if (await this._refreshToken(token.refresh_token, token.id_token)) {
        const newToken = this._getToken();
        return newToken?.id_token || null;
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
  public async loadSettings(): Promise<boolean> {
    if (this.settings) return true
    this.settings = null
    const resp = await this._dispatch({ action: 'auth.settings' });
    this.settings = resp?.ok ? resp.data : null
    return this.settings !== null
  }
  /**
   * Subscribes to state changes in the authentication state.
   *
   * @param callback - The function to call when the state changes.
   * @returns A subscription object that can be used to unsubscribe.
   */
  public onStateChange(callback: (changes: Partial<AuthStateType>, prev: Partial<AuthStateType>, state: AuthStateType) => void) {
    return this._state.subscribe(callback);
  }

  /**
   * Subscribes to sessions state changes, specifically token updates, and invokes the callback with the updated user profile.
   *
   * @param callback - The function to call when the authentication state changes.
   * @returns A subscription object that can be used to unsubscribe.
   */
  public onAuthStateChange(callback: (userProfile: UserInterface | null) => void) {
    // Invoke the callback immediately with the current state
    setTimeout(() => {
      callback(copy(this._user_profile));
    })
    
    return this.onStateChange((changes, prev) => {
      if (changes?.token?.id_token !== prev?.token?.id_token) {
        callback(copy(changes?.user_profile));
      }
    });
  }


  /**
   * Reload the authentication state by loading data from the cache.
   *
   * @returns A promise resolving to a boolean indicating the success of the operation.
   */
  public async reloadAuthState(): Promise<boolean> {
    return this._loadFromCache();
  }

  private async _authAction(action: string, data: object): Promise<AuthResultInterface> {
    try {
      const resp = await this._dispatch({ action, ...data });
      if (resp.ok) {
        this._setAuthData(resp.data);
        return AuthResultOk(resp.data?.user_profile);
      }
      return AuthResultErr(resp.error);
    } catch (error) {
      return AuthResultErr(error);
    }
  }

  private async _authFlow(action: string, data: object): Promise<AuthResultInterface> {
    try {
      this._clearAuthData();
      const resp = await this._dispatch({ action, ...data });
      if (resp.ok) {
        this._setAuthData(resp.data);
        return AuthResultOk(resp.data);
      }
      return AuthResultErr(resp.error);
    } catch (error) {
      return AuthResultErr(error);
    } 
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
        this._setAuthData(token);
        return true;
      } else if (token?.refresh_token) {
        return await this._refreshToken(token.refresh_token, token.id_token);
      }
    } else {
      this._clearAuthData();
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
    return this._storage.getItem(STORAGE_TOKEN_KEY);
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

    const now = Date.now();
    if (now - this._lastRefreshAttempt < AuthClient.MIN_REFRESH_INTERVAL) {
      return false;
    }

    if (this._consecutiveRefreshFailures >= AuthClient.MAX_REFRESH_FAILURES) {
      this._clearAuthData();
      return false;
    }

    if (this._refreshQueue) {
      return this._refreshQueue;
    }

    try {
      this._lastRefreshAttempt = now;
      this._refreshQueue = this._executeRefresh(refresh_token, id_token);
      return await this._refreshQueue;
    } finally {
      this._refreshQueue = null;
    }
  }
  
  /**
   * Implement a queue system for refresh attempts:
   */
  private async _executeRefresh(refresh_token: string, id_token: string): Promise<boolean> {
    try {
      const resp = await this._dispatch({
        action: 'auth.refresh_token',
        refresh_token,
        id_token,
      });

      if (resp?.ok) {
        this._setAuthData(resp.data, false);
        this._refreshFailed = false;
        this._consecutiveRefreshFailures = 0;
        return true;
      }

      this._refreshFailed = true;
      this._consecutiveRefreshFailures++;
      return false;
    } catch {
      this._refreshFailed = true;
      this._consecutiveRefreshFailures++;
      return false;
    }
  }

  /**
   * Checks if the provided token is valid based on its expiry time.
   *
   * @param token - The token to validate. If not provided, the current token is used.
   * @returns True if the token is valid, false otherwise.
   */
  private _isTokenValid(token: IOResponseType | null = null): boolean {
    if (!token?.id_token || !token?.token_info?.exp) {
      return false;
    }

    // Check if we've exceeded maximum refresh failures
    if (this._consecutiveRefreshFailures >= AuthClient.MAX_REFRESH_FAILURES) {
      return false;
    }

    const now = Date.now();
    const expiresAt = token.token_info.exp * 1000;
    return expiresAt - (EXPIRY_MARGIN * 1000) > now;
  }

  /**
   * Sets the authentication data in the state and storage, and starts the auto-refresh mechanism.
   *
   * @param respData - The response data containing authentication tokens and user profile.
   */

  private _setAuthData(data: object, startAutoRefresh: boolean = true): void {
    // Reset refresh-related counters
    this._consecutiveRefreshFailures = 0;
    this._refreshFailed = false;
    
    const now = Date.now();
    const tokenData = {
      ...data,
      expires_at: now + parseInt((data as any)?.token_info?.ttl, 10) * 1000,
      created_at: now,
    };

    this._user_profile = (data as any)?.user_profile || null;
    this._token = tokenData;

    this._state.__patch__ = {
      user_profile: this._user_profile,
      token: this._token,
    };

    this._storage.setItem(STORAGE_TOKEN_KEY, tokenData);

    if (startAutoRefresh && this._autoRefreshToken) {
      this._startAutoRefreshToken();
    }
  }


  /**
   * Clears the authentication state by resetting user profile and token data.
   * _clearAuthData
   */
  private _clearAuthData(): void {
    this._user_profile = null;
    this._token = null;
    this._state.__patch__ = {
      user_profile: null,
      token: null,
    };
    this._stopAutoRefreshToken();
    this._storage.removeItem(STORAGE_TOKEN_KEY);
  }

  /**
   * Updates the reactive state with new authentication data.
   *
   * @param respData - The response data containing authentication tokens and user profile.
   */
  private _setState(respData: object): void {
    const user_profile = (respData as any)?.user_profile || null
    const token = respData
    this._user_profile = user_profile 
    this._token = token

    this._state.__patch__ = {
      user_profile: user_profile,
      token: token,
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
    this._scheduleNextRefresh();
  }

  /**
   * Implement a dynamic refresh schedule based on the token's expiration time
   */
  private _scheduleNextRefresh(): void {
    const token = this._getToken();
    if (!token?.token_info?.exp || !this._session_active) {
      return;
    }

    const now = Date.now();
    const expiresAt = token.token_info.exp * 1000;
    const expiresIn = expiresAt - now - (EXPIRY_MARGIN * 1000);

    // Calculate refresh interval with exponential backoff
    let refreshIn = Math.max(0, expiresIn);
    if (this._consecutiveRefreshFailures > 0) {
      const backoffFactor = Math.min(Math.pow(2, this._consecutiveRefreshFailures - 1), 60); // Max 1 hour
      refreshIn = Math.min(refreshIn, AuthClient.MIN_REFRESH_INTERVAL * backoffFactor);
    }

    // Clear any existing timer
    if (this._autoRefreshTicker) {
      clearTimeout(this._autoRefreshTicker);
    }

    // Schedule next refresh only if we haven't exceeded max failures
    if (this._consecutiveRefreshFailures < AuthClient.MAX_REFRESH_FAILURES) {
      this._autoRefreshTicker = window.setTimeout(() => {
        this.getIdToken().then(() => this._scheduleNextRefresh());
      }, refreshIn);
    }
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
  const storageKey = authStorageKey || 'singlebase.auth:';
  const storage = new TimeStorage(storageKey);
  return new AuthClient(dispatch, storage);
};
