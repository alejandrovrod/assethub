import { customizeValidator } from '@rjsf/validator-ajv8'

// Customize the default AJV validator from RJSF to allow HTTP URLs in data-url fields
// Since our custom FileUploadWidget stores standard URLs (http/https) instead of base64 data URIs,
// the strict "data-url" format validation will fail if we don't relax it.
export const customValidator = customizeValidator({
  customFormats: {
    'data-url': /^(data:|http:|https:|\/)/
  }
})
