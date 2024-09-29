// Filestore.ts

import httpx from "./httpx";
import { ResponseType, ResultType, DispatchType } from "./types";
import { parseXmlToJson, extractFileKey } from "./lib";

/**
 * Interface representing the options for the upload method.
 */
interface UploadOptionsInterface {
  public_read?: boolean;
  info?: {
    title?: string;
    description?: string;
    tags?: string[];
  };
  folder?: string;
  options?: {
    profilephoto?: boolean;
  };
}

/**
 * Interface representing the response of the upload method.
 */
type UploadResponseType = [object | null, object | null];

/**
 * Filestore handles file-related operations such as fetching file info, uploading, deleting, and querying files.
 */
export default class Filestore {
  
  /** Dispatch function for executing actions */
  private readonly _dispatch: DispatchType;

  /**
   * Initializes a new instance of Filestore.
   *
   * @param dispatch - The dispatch function for handling actions.
   */
  constructor(dispatch: DispatchType) {
    this._dispatch = dispatch;
  }

  /**
   * Creates an SuccessObject adhering to ResultType.
   * @param {object} data The error message.
   * @param {object} meta The error message.
   * @returns An object representing the error.
   */
  private _createSuccess(data={}, meta=null): ResultType {
    return {
      ok: true,
      data: data,
      meta: meta,
      error: null
    };
  }

  /**
   * Creates an ErrorObject adhering to ResultType.
   * @param message The error message.
   * @returns An object representing the error.
   */
  private _createError(message: string): ResultType {
    return {
      ok: false,
      data: null,
      meta: null,
      error: { message }
    };
  }


  /**
   * Retrieves information about a file based on its file path or key.
   *
   * @param filePathOrKey - The file path or unique key of the file.
   * @returns A promise resolving to the response containing file information.
   */
  public async get(filePathOrKey: string): Promise<ResponseType> {
    const _key = extractFileKey(filePathOrKey);
    if (_key) {
      const res = await this._dispatch({ action: 'file.info', _key });
      if (res.ok) {
        return this._createSuccess(res?.data, res?.meta)
      } else {
        return this._createError(res?.error)
      }
    } else {
      return this._createError("INVALID FILE OR FILEKEY")
    }
  }

  /**
   * Retrieves the download URL for a file based on its file path or key.
   *
   * @param filePathOrKey - The file path or unique key of the file.
   * @returns A promise resolving to the download URL string or null if not available.
   */
  public async getURL(filePathOrKey: string): Promise<string | null> {
    const res = await this.get(filePathOrKey);
    return res.ok ? (res.data?.url as string | null) : null;
  }

  public async makePublic(filePathOrKey:string, public_read=false) {
    const _key = extractFileKey(filePathOrKey);
    if (_key) {
      const res = await this._dispatch({ 
        action: 'file.update', 
        _key,
        public_read,
      });
      if (res.ok) {
        return this._createSuccess(res?.data, res?.meta)
      } else {
        return this._createError(res?.error)
      }
    } else {
      return this._createError("INVALID FILE OR FILEKEY")
    }
  }

  public async setMetadata(filePathOrKey:string, metadata={}) {
    const _key = extractFileKey(filePathOrKey);
    if (_key) {
      const res = await this._dispatch({ 
        action: 'file.update', 
        _key,
        metadata,
      });
      if (res.ok) {
        return this._createSuccess(res?.data, res?.meta)
      } else {
        return this._createError(res?.error)
      }
    } else {
      return this._createError("INVALID FILE OR FILEKEY")
    }
  }

  /**
   * Uploads a file to the server with optional configurations.
   *
   * @param file - The file to be uploaded.
   * @param opts - Optional configurations for the upload.
   *   @param opts.public_read - Whether the uploaded file should be publicly readable.
   *   @param opts.info - Additional metadata for the file.
   *     @param opts.info.title - The title of the file.
   *     @param opts.info.description - The description of the file.
   *     @param opts.info.tags - Tags associated with the file.
   *   @param opts.folder - The folder to upload the file to.
   *   @param opts.options - Additional options.
   *     @param opts.options.profilephoto - Whether the file is a profile photo.
   * @returns A promise resolving to a tuple where the first element is the file info object (if uploaded successfully) and the second element is the error object (if any).
   */
  public async upload(
    file: File, 
    opts: UploadOptionsInterface = {}
  ): Promise<ResultType> {

    // Merge default options with provided options
    const _opts: UploadOptionsInterface = {
      public_read: false,
      ...opts
    };

    try {
      // PREUPLOAD: Request presigned URL and upload info
      const presignedPost: ResponseType = await this._dispatch({
        ..._opts,
        action: 'file.preupload',
        filename: file.name,
        content_type: file.type
      });

      if (!presignedPost.ok) {
        return this._createError(presignedPost.error || { error: "PREUPLOAD FAILED" })
      }

      const presignedData = presignedPost.data?.presigned_data;
      const fileInfo = presignedPost.data?.info;

      if (!presignedData || !presignedData.url || !presignedData.fields) {
        return this._createError(presignedPost.error || { error: "INVALID PRESIGNED DATA" })
      }
      
      // Create FormData for upload
      const formData = new FormData();
      Object.entries(presignedData.fields).forEach(([key, value]) => {
        formData.append(key, value as string);
      });
      formData.append('file', file);

      // SUBMIT form to the presigned_data.url
      try {
        const res = await httpx({
          method: 'POST',
          url: presignedData.url,
          data: formData
        });

        if (res.ok) {
  
          // tell sbc it's good to go
          const postUpload = await this._dispatch({ 
            action: 'file.postupload', 
            presigned_data: presignedData,
            _key: presignedData?._key
          })
          if (postUpload?.ok) {
            return this._createSuccess(postUpload?.data)
          } else {
            return this._createError("ERROR POSTUPLOAD")
          }
    
        } else {
          // const x2j = parseXmlToJson(res.error)
          await this._dispatch({ 
            action: 'file.upload_error', 
            presigned_data: presignedData,
            _key: presignedData?._key,
            errors: res.error
          })
          return this._createError(res.error)
        }
        
      } catch (e: any) {
        await this._dispatch({
          action: 'file.upload_error', 
          presigned_data: presignedData,
          _key: presignedData?._key,
          errors: `${e}`
        });
        return this._createError(e)
      }
    } catch (error) {
      // Handle any unexpected errors during preupload
      await this._dispatch({
        action: 'file.uploaderror',
        errors: { error: "UNDEFINED ERROR" }
      });
      return this._createError("UNDEFINED ERROR")
    }
  }

  /**
   * Deletes a file based on its file path or key.
   *
   * @param filePathOrKey - The file path or unique key of the file to delete.
   * @returns A promise resolving to a boolean indicating the success of the deletion.
   */
  public async delete(filePathOrKey: string): Promise<boolean> {
    const _key = extractFileKey(filePathOrKey);
    const resp: ResponseType = await this._dispatch({ action: 'file.delete', _key });
    return resp.ok;
  }

  /**
   * Queries the storage based on provided parameters.
   *
   * @param params - The parameters for querying the storage.
   * @returns A promise resolving to the response of the query.
   * @throws Will throw an error if the 'filters' parameter is missing.
   */
  public async query(params: Record<string, any>): Promise<ResponseType> {
    if (!params.filters) {
      throw new Error("Filestore: 'filters' parameter is required for storage.query.");
    }
    return await this._dispatch({ ...params, action: 'file.query' });
  }
}
