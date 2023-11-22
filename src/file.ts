import httpx from "./httpx";
import { AuthCredentialsInterface, ResponseType } from "./types";
import { parseXmlToJson, getKeyFromFilePath, isString, isPlainObject, isEmpty } from "./utils";

/**
 * FileService
 * @param this._dispatch 
 * @returns 
 */
export default class {

  constructor(dispatch) {
    this._dispatch = dispatch
  }

  getInfo(file_path_or_key:string): Promise<ResponseType> {
    const _key = getKeyFromFilePath(file_path_or_key);
    return this._dispatch({ action: 'file.info', _key: _key });
  }

  /**
   * Get the download url
   * @param file_path_or_key 
   * @returns string|null
   */
  async getDownloadURL(file_path_or_key:string): Promise<string|null> {
    const res = await this.getInfo(file_path_or_key)
    return res.ok ? res?.data?.url : null
  }

  /**
   * To upload an image
   * @param {FileSystem} file
   * @param {object} opts 
   *    public_read: bool
   *    info: object
   *        - title:string
   *        - description: string
   *        - tags: array/list
   *    folder: str
   *    options: object
   *      - profilephoto: bool
   * 
   * @returns {tuple} (is_uploaded:bool, data:dict)
   */
  async upload(file, opts: object = {}) {
    // PREUPLOAD
    const _opts = {
      public_read: false,
      ...opts
    }

    const presignedPost = await this._dispatch({
      ..._opts,
      action: 'file.preupload',
      filename: file.name,
      content_type: file.type
    });

    //
    if (presignedPost.ok) {
      const presigned_data = presignedPost?.data?.presigned_data;
      const file_info = presignedPost?.data?.info;
      const _dispatch = {
        action: 'file.postupload',
        presigned_data: presigned_data,
        _key: presigned_data?._key
      }

      try {
        /**
         * Creating a form to be submitted to S3 protocol
         * Fill it out with all the presigned-data $fields
         */
        const formData = new FormData();
        Object.entries(presigned_data?.fields).forEach(([k, v]) => {
          formData.append(k, v);
        });
        // file to upload must be appended last
        formData.append('file', file);

        // SUBMIT form to the presigned_data.url
        try {
          await httpx({ method: 'POST', url: presigned_data.url, data: formData });
          return [file_info, null]
        } catch (e) {
          const x2j = parseXmlToJson(e.response.data)
          _dispatch.action = 'file.uploaderror'
          _dispatch.errors = x2j?.Error
          return [null, x2j?.Error]
        }
      } catch (e) {
        _dispatch.action = 'file.uploaderror'
        _dispatch.errors = { error: "UNDEFINED ERROR" }
      } finally {
        await this._dispatch(_dispatch);
      }
    }
    return [null, { error: "UNDEFINED ERROR" }]
  }

  /**
   * Delete
   * @param {*} file_path_or_key
   * @returns {boolean}
   */
  async delete(file_path_or_key): Promise<boolean> {
    const _key = getKeyFromFilePath(file_path_or_key);
    const resp = await this._dispatch({ action: 'file.delete', _key });
    return resp.ok;
  }

  /**
   * To query the storage
   * @param params 
   * @returns 
   */
  query(params: object): Promise<ResponseType> {
    if (!params.matches) throw Error("SINGLEBASE:ERROR - storage.query missing '@matches'")
    return this._dispatch({ ...params, action: 'storage.query' });
  }
  
}

