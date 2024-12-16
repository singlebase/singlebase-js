// GenAI.ts

import { ResponseType, ResultType, DispatchType } from "./types";


export default class GenAI {
  
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
   * Convert a file to Markdown
   *
   * @param fileKey - The fileunique key of the file.
   * @returns A promise resolving to the response.
   */
  public async fileToMarkdown(fileKey: string): Promise<ResponseType> {
    const res = await this._dispatch({ action: 'genai.markdown', input: fileKey });
    if (res.ok) {
      return this._createSuccess(res?.data, res?.meta)
    } else {
      return this._createError(res?.error)
    }
  }

  public async genText(input): Promise<ResponseType> {
    throw new Error('NOT_IMPLEMENTED_YET_ERROR:genText')
  }

  public async summarizeText(input): Promise<ResponseType> {
    throw new Error('NOT_IMPLEMENTED_YET_ERROR:summarizeText')
  }


  public async summarizeFile(input): Promise<ResponseType> {
    throw new Error('NOT_IMPLEMENTED_YET_ERROR:summarizeFile')
  }

  public async genTextEmbeddings(input): Promise<ResponseType> {
    throw new Error('NOT_IMPLEMENTED_YET_ERROR:genTextEmbeddings')
  }

  public async genFileEmbeddings(input): Promise<ResponseType> {
    throw new Error('NOT_IMPLEMENTED_YET_ERROR:genFileEmbeddings')
  }
}

