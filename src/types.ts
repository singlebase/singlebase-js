
export interface UserInterface {
  _key: string,
  user_key: string,
  display_name: string,
  email: string,
  username: string,
  photo_url: string,
  password: string,
  metadata: object
}

export type TokenType = {
  id_token: any
}

export interface CredentialsInterface {
  email?: string;
  username?:string;
  password?: string;
  display_name?: string;
  phone_number?: string; 
  otp?:string;
  aud?:string;
}

export interface UpdateProfileInterface {
  display_name?: string;
  name?: string;
  surname?: string;
  phone_number?: string;
  photo_url?:string;
  aud?:string;
  metadata?:object;
}

export interface AccountCredentialsInterface {
  email?: string;
  username?:string;
  password?: string;
  aud?:string;
}

export interface UpdateAccountInterface {
  email: string;
  otp: string;
  intent?:string // change_(email|password|username)
  aud?:string;
  new_email?:string;
  new_password?: string;
  new_username?: string;
}

export interface SendOTPInterface {
  email: string;
  intent?: string;
  aud?:string;
}

export interface AuthResultInterface {
  error: Object|null;
  ok: boolean;
  data: any;
  action: string|null
}

export type AuthStateType = {
  user_profile: UserInterface;
  token: TokenType
}

export type IOResponseType = {
  ok: boolean;
  data: object|null;
  meta: object|null;
  error: object|null;
  xhr: object
}

export type RequestResponseType = {
  ok: boolean;
  data: object|null;
  meta: object|null;
  error: object|null;
  xhr: object
}


export type DispatchType = {
  action: string
}

// ----

export type ResultType = {
  ok: boolean;
  data: Record<string, any> | Record<string, any>[] | null;
  meta: {
    pagination?: Record<string, any>;
  } | null;
  error: Record<string, any> | null;
};


// DATASTORE TYPES === 

export type DSQueryCriteriaType = {
  filters: Record<string, any>;
  sort?: Record<string, any> | null;
  limit?: number;
  offset?: number;
  page?: number;
  per_page?: number;
  return_fields?:Record<string, any>[]
};

export type DSMutationCriteriaType = {
  filters: Record<string, any>;
  data: Record<string, any> | Record<string, any>[];
};

export type DSSearchCriteriaType = {
  query: Record<string, any>;
  vectorize?: boolean;
  vector?: any[]; // Replace 'any' with a more specific type if known
  sort?: Record<string, any> | null;
  limit?: number;
  offset?: number;
  page?: number;
  per_page?: number;
  return_fields?:Record<string, any>[]
};

export type DSUpsertCriteriaType = {
  filters: Record<string, any>;
  insertData: Record<string, any> | Record<string, any>[];
  updateData: Record<string, any> | Record<string, any>[];
};

