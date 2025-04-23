// XAI.ts

import { ResponseType, ResultType, DispatchType } from "./types";


export default class XAI {
  
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


  public async invoke(data:[], opts={}): Promise<ResponseType> {

    const res: ResponseType = await this._dispatch({
      action: "ai.invoke",
      schedule: true,
      data,
      ...opts
    });
    if (res.ok) {
      return this._createSuccess(res?.data, res?.meta)
    } else {
      return this._createError(res?.error)
    }
  }


  public async generate(user_input: string, opts={}): Promise<ResponseType> {
    const res: ResponseType = await this._dispatch({
      action: 'xai.generate',
      data: {
        user_input,
        ...opts,
      }
    });
    if (res.ok) {
      return this._createSuccess(res?.data, res?.meta)
    } else {
      return this._createError(res?.error)
    }
  }

  
  public async summarize(input): Promise<ResponseType> {
    throw new Error('NOT_IMPLEMENTED_YET_ERROR:summarize')
  }


  public async qna(input): Promise<ResponseType> {
    throw new Error('NOT_IMPLEMENTED_YET_ERROR:qna')
  }

  public async summarizeFile(input, file_key): Promise<ResponseType> {
    throw new Error('NOT_IMPLEMENTED_YET_ERROR:summarizeFile')
  }

  public async qnaFile(input, file_key): Promise<ResponseType> {
    throw new Error('NOT_IMPLEMENTED_YET_ERROR:qnaFile')
  }
}

