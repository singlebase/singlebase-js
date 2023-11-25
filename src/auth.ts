import { AuthCredentialsInterface, ResponseType } from "./types";
import { parseXmlToJson, getKeyFromFilePath, isString, isPlainObject, isEmpty } from "./utils";


export default class {
  INTENTS = {
    signin: 'signin',
    change_email: 'change_email',
    change_password: 'change_password',
    change_username: 'change_username',
    invite: 'invite'
  }

  GRANT_TYPES = {
    password: 'password',
    otp: 'otp'
  }

  constructor($dispatch) {
    this._dispatch = $dispatch  
  }

  async signUp(credentials: AuthCredentialsInterface): Promise<ResponseType> {
    return await this._dispatch({
      ...credentials,
      action: 'auth.signup',
    })
  }

  async signIn(credentials: AuthCredentialsInterface): Promise<ResponseType> {
    return await this._dispatch({
      ...credentials,
      action: 'auth.signin',
    })
  }

  async signOut(id_token:String): Promise<ResponseType> {
    return await this._dispatch({
      id_token,
      action: 'auth.signout',
    })
  }  

  async refreshToken(refresh_token:String, id_token:String): Promise<ResponseType> {
    return await this._dispatch({
      refresh_token,
      id_token,
      action: 'auth.signout'
    })
  } 

  async sendOTP(email:string, intent:string, aud:string|null="user"): Promise<ResponseType> { 
    return await this._dispatch({
      action: 'auth.send_otp',
      email,
      intent,
      aud
    })
  }

  async getSettings() : Promise<ResponseType> {
    return await this._dispatch({
      action: 'auth.settings'
    })
  }

  /**
   * 
   * @param creds {}
   * @returns 
   */
  async updateProfile(creds:object): Promise<ResponseType> {
    return await this._dispatch({
      data: creds,
      action: 'auth.update_profile',
    })
  }

  /**
   * @param creds { email, otp, intent, new_email?, new_password? }
   * @returns 
   */
  async updateAccount(creds:object): Promise<ResponseType> { 
    return await this._dispatch({
      ...creds,
      action: 'auth.update_account',
    })      
  }


  async verifyIdToken(id_token:String, aud:string|null="user"): Promise<ResponseType> { 
    return await this._dispatch({
      id_token,
      aud,
      action: 'auth.update_account',
    })      
  }


  async getNonce(): Promise<ResponseType> {
    return await this._dispatch({ action: 'auth.nonce'})
  }

  /**
   * 
   * @param creds {email, password, display_name?, phone_number?}
   * @returns 
   */
  async createUserWithPassword(creds:object): Promise<ResponseType> {
    return await this.signUp({
      ...creds
    })
  }

  /**
   * 
   * @param creds {email, password, otp?}
   * @returns 
   */
  async signInWithPassword(creds:object): Promise<ResponseType> {
    return await this.signIn({
      ...creds,
      grant_type: this.GRANT_TYPES.password
    })
  }

  /**
   * 
   * @param creds {email, otp}
   * @returns 
   */
  async signInWithOTP(creds:object): Promise<ResponseType> {
    return await this.signIn({
      ...creds,
      grant_type: this.GRANT_TYPES.otp
    })
  }

  /**
   * 
   * @param creds object{email, new_email, otp}
   * @returns 
   */
  async changeEmail(creds:object): Promise<ResponseType> {
    return await this.signIn({
      ...creds,
      intent: this.INTENTS.change_email
    })
  }

  /**
   * 
   * @param creds {email, new_password, otp} 
   * @returns 
   */
  async changePassword(creds:object): Promise<ResponseType> {
    return await this.signIn({
      ...creds,
      intent: this.INTENTS.change_password
    })
  }

  // TODO
  async oauthConnect() { }



}

