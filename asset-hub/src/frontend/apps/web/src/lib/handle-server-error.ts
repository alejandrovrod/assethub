import { AxiosError } from 'axios'
import { toast } from 'sonner'
import i18n from '@/i18n'

/**
 * Extracts a human-readable message from a backend error response.
 *
 * Backend error shapes:
 * - ExceptionHandlingMiddleware (DomainException): `{ title, status, code }`
 * - ExceptionHandlingMiddleware (unhandled): `{ title, detail, status }`
 * - ASP.NET model binding / ProblemDetails: `{ title, detail }`
 *
 * Falls back to the provided generic message when none is present.
 */
export function getApiErrorMessage(error: unknown, fallback: string): string {
  // Fix for cases where error is passed as { error } (e.g., handleServerError({ error }))
  if (error && typeof error === 'object' && 'error' in error && Object.keys(error).length === 1) {
    error = (error as any).error
  }

  if (error && typeof error === 'object' && 'response' in error) {
    const data = (error as AxiosError).response?.data as
      | { detail?: unknown; title?: unknown; message?: unknown }
      | undefined

    const candidates = [data?.detail, data?.title, data?.message]
    for (const candidate of candidates) {
      if (typeof candidate === 'string' && candidate.trim().length > 0) {
        return formatSchemaErrorMessage(candidate)
      }
    }

    const axiosMessage = (error as AxiosError).message
    if (typeof axiosMessage === 'string' && axiosMessage.length > 0) {
      return formatSchemaErrorMessage(axiosMessage)
    }
  }

  return fallback
}

/** Translates technical NJsonSchema validation errors like `#/field_123: NumberTooSmall` into clear user messages */
function formatSchemaErrorMessage(msg: string): string {
  if (!msg.includes('El JSON no cumple con el esquema')) return msg

  return msg.replace(/#\/([a-zA-Z0-9_-]+):\s*([a-zA-Z0-9_-]+)/g, (_match, _field, kind) => {
    switch (kind) {
      case 'NumberTooSmall':
        return 'el valor es menor que el mínimo permitido'
      case 'NumberTooBig':
        return 'el valor excede el máximo permitido'
      case 'StringTooShort':
        return 'el texto es más corto que el mínimo requerido'
      case 'StringTooLong':
        return 'el texto excede el largo máximo'
      case 'PatternMismatch':
        return 'no cumple con el formato o patrón requerido'
      case 'PropertyRequired':
        return 'campo obligatorio faltante'
      default:
        return kind
    }
  })
}

export function handleServerError(error: unknown) {
  // Fix for cases where error is passed as { error } (e.g., handleServerError({ error }))
  if (error && typeof error === 'object' && 'error' in error && Object.keys(error).length === 1) {
    error = (error as any).error
  }

  if (import.meta.env.DEV) {
    // eslint-disable-next-line no-console
    console.log(error)
  }

  let errMsg = getApiErrorMessage(error, i18n.t('common:errors.generic'))

  if (
    error &&
    typeof error === 'object' &&
    'status' in error &&
    Number(error.status) === 204
  ) {
    errMsg = i18n.t('common:errors.noContent')
  }

  toast.error(errMsg)
}
