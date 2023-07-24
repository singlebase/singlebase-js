import httpx from "./httpx";
function parseXmlToJson(xml) {
  const json = {};
  for (const res of xml.matchAll(/(?:<(\w*)(?:\s[^>]*)*>)((?:(?!<\1).)*)(?:<\/\1>)|<(\w*)(?:\s*)*\/>/gm)) {
    const key = res[1] || res[3];
    const value = res[2] && parseXmlToJson(res[2]);
    json[key] = ((value && Object.keys(value).length) ? value : res[2]) || null;

  }
  return json;
}

const getKeyFromFilePath = file_path_or_key => {
  return file_path_or_key.indexOf('/') >= 0 || file_path_or_key.indexOf('.') >= 0
    ? file_path_or_key.split('.').slice(0, -1).pop()
    : file_path_or_key;
};

export const CollectionService = ($dispatch, collectionName) => {

  async function dispatch(action: String, opts: Object) {
    return await $dispatch({
      ...opts,
      action,
      collection: collectionName
    })
  }

  return {
    dispatch,

    /**
     * to get multiple document
     * @param {Object} matches
     * @param {*} opts 
     * @returns Array
     */
    async fetch(opts = {}) {
      return this.dispatch('DOC_FETCH', opts)
    },

    /**
     * To get a single document
     * @param {*} _key 
     * @return Object
     */
    async fetchOne(_key) {
      const payload = {
        matches: {
          _key
        }
      },

      const res = await this.fetch(payload)
      if (res.ok) {
        const data = res?.data?.[0]
        return {
          ...res,
          data
        }
      }
      return res
    },



    /**
     * To insert one or multiple document
     * @param {Object|Array} data
     * @returns Response
     */
    async insert(data) {
      return await this.dispatch('DOC_INSERT', { data })
    },

    async insertMany(data: Array) {
      if (!Array.isArray(data)) {
        throw Error('Invalid datatype')
      }
      return await this.dispatch('DOC_INSERT', { data })
    },

    async update(data, opts) {
      return await this.dispatch('DOC_UPDATE', { ...opts, data })
    },

    async updateOne(_key, data) {
      return await this.dispatch('DOC_UPDATE', { data, _key })
    },

    async delete(opts) {
      if (!opts.matches) throw new Error("DELETE missing @matches")
      return await this.dispatch('DOC_DELETE', { matches: opts.matches })
    },

    async deleteOne(_key) {
      return await this.delete({ matches: { _key } })
    },

    async archive(opts: object) {
      if (!opts.matches) throw new Error("ARCHIVE missing @matches")
      return await this.dispatch('DOC_ARCHIVE', { matches: opts.matches })
    },

    async archiveOne(_key: string) {
      return await this.archive({ matches: { _key } })
    },

    async search(query: string, opts = {}) {
      return await this.dispatch('DOC_SEARCH', { ...opts, query })
    },

    /**
     * Count the documents in th 
     * @param {*} opts 
     * @returns {int}
     */
    async count(opts = {}) {
      let matches = opts?.matches ? opts?.matches : {}
      const { data, error } = await this.dispatch('DOC_COUNT', { matches })
      if (data && data?.count) {
        return data?.count
      }
      return 0
    },
  }
}


export const AuthService = ($dispatch) => {

  return {
    async signup(data) {},

    async signin() { },
  
    async signout() { },
  
    async updateProfile() { },
  
    async updateAccount() { },
  
    async sendOTP() { },
  
    async verifyIDToken() {},
  
    async authConnect() { },
  }


}


export const StorageService = ($dispatch) => {

  return {
    /**
     * INFO
     * @param {*} file_path_or_key
     */
    async get(file_path_or_key) {
      const _key = getKeyFromFilePath(file_path_or_key);
      const resp = await $dispatch({ action: 'STORAGE_GET', _key: _key });
      return resp.ok ? resp.data : null;
    },

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
     * @returns {tuple} (uploaded:bool, data:dict)
     */
    async upload(file, opts: object = {}) {
      // PREUPLOAD
      const _opts = {
        public_read: false,
        ...opts
      }
      const presignedPost = await $dispatch({
        ..._opts,
        action: 'storage_presign_upload',
        filename: file.name,
        content_type: file.type
      });

      //
      if (presignedPost.ok) {
        const presigned_data = presignedPost.data.presigned_data;
        const file_info = presignedPost.data.info;
        const _dispatch = {
          action: 'storage_postsign_upload',
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
            _dispatch.action = 'storage_upload_error'
            _dispatch.errors = x2j?.Error
            return [null, x2j?.Error]
          }
        } catch (e) {
          console.log("EEE", e)
          _dispatch.action = 'storage_upload_error'
          _dispatch.errors = { error: "UNDEFINED ERROR" }
        } finally {
          await $dispatch(_dispatch);
        }
      }
      return [null, { error: "UNDEFINED ERROR" }]
    },

    /**
     * Update an object
     * @param file_path_or_key 
     * @param data 
     *    - metadata: object
     *    - public_read: bool
     * @returns 
     */
    async update(file_path_or_key, data: object) {
      const _key = getKeyFromFilePath(file_path_or_key);
      const resp = await $dispatch({ ...data, action: 'storage_update', _key });
      return resp.ok ? resp.data : null;
    },

    /**
     * Delete
     * @param {*} file_path_or_key
     */
    async delete(file_path_or_key) {
      const _key = getKeyFromFilePath(file_path_or_key);
      const resp = await $dispatch({ action: 'storage_delete', _key });
      return resp.ok;
    },

    /**
     * To query the storage
     * @param params 
     * @returns 
     */
    async query(params: object) {
      if (!params.filters) throw Error("SINGLEBASE:ERROR - storage_query missing 'filters'")
      const resp = await $dispatch({ ...params, action: 'storage_query' });
      return resp.ok ? resp : null;
    }
  };
}

