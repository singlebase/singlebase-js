import { AuthCredentialsInterface, ResponseType } from "./types";
import { parseXmlToJson, getKeyFromFilePath, isString, isPlainObject, isEmpty } from "./utils";


export default class {
  INTENTS = {
    signin: 'signin',
    change_email: 'change_email',
    change_password: 'change_password',
    invite: 'invite'
  }

  GRANT_TYPES = {
    password: 'password',
    otp: 'otp'
  }

  constructor($dispatch) {
    this._dispatch = $dispatch  
  }

  signUp(credentials: AuthCredentialsInterface): Promise<ResponseType> {
    return this._dispatch({
      ...credentials,
      action: 'auth.signup',
    })
  }

  signIn(credentials: AuthCredentialsInterface): Promise<ResponseType> {
    return this._dispatch({
      ...credentials,
      action: 'auth.signin',
    })
  }

  signOut(id_token:String): Promise<ResponseType> {
    return this._dispatch({
      id_token,
      action: 'auth.signout',
    })
  }  

  sendOTP(email:string, intent:string, aud:string|null="user"): Promise<ResponseType> { 
    return this._dispatch({
      action: 'auth.send_otp',
      email,
      intent,
      aud
    })
  }

  async getNonce(): Promise<string> {
    const res = await this._dispatch({ action: 'auth.nonce'})
    return res.ok ? res?.data?.nonce : null
  }

  // TODO
  authConnect() { }

  /**
   * 
   * @param creds {}
   * @returns 
   */
  updateProfile(creds:object): Promise<ResponseType> {
    return this._dispatch({
      data: creds,
      action: 'auth.update_profile',
    })
  }

  /**
   * @param creds { email, otp, intent, new_email?, new_password? }
   * @returns 
   */
  updateAccount(creds:object): Promise<ResponseType> { 
    return this._dispatch({
      ...creds,
      action: 'auth.update_account',
    })      
  }

  /**
   * 
   * @param creds {email, password, display_name?, phone_number?}
   * @returns 
   */
  createUserWithPassword(creds:object): Promise<ResponseType> {
    return this.signUp({
      ...creds
    })
  }

  /**
   * 
   * @param creds {email, password, otp?}
   * @returns 
   */
  signInWithPassword(creds:object): Promise<ResponseType> {
    return this.signIn({
      ...creds,
      grant_type: this.GRANT_TYPES.password
    })
  }

  /**
   * 
   * @param creds {email, otp}
   * @returns 
   */
  signInWithOTP(creds:object): Promise<ResponseType> {
    return this.signIn({
      ...creds,
      grant_type: this.GRANT_TYPES.otp
    })
  }

  /**
   * 
   * @param creds {email, new_email, otp} 
   * @returns 
   */
  changeEmail(creds:object): Promise<ResponseType> {
    return this.signIn({
      ...creds,
      intent: this.INTENTS.change_email
    })
  }

  /**
   * 
   * @param creds {email, new_password, otp} 
   * @returns 
   */
  changePassword(creds:object): Promise<ResponseType> {
    return this.signIn({
      ...creds,
      intent: this.INTENTS.change_password
    })
  }
}

