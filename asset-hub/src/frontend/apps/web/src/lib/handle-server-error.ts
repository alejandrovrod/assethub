import { AxiosError } from 'axios'
import { toast } from 'sonner'

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
        return candidate
      }
    }

    const axiosMessage = (error as AxiosError).message
    if (typeof axiosMessage === 'string' && axiosMessage.length > 0) {
      return axiosMessage
    }
  }

  return fallback
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

  let errMsg = getApiErrorMessage(error, 'Something went wrong!')

  if (
    error &&
    typeof error === 'object' &&
    'status' in error &&
    Number(error.status) === 204
  ) {
    errMsg = 'No content.'
  }

  toast.error(errMsg)
}
