import { apiClient } from '@/lib/api-client'

export const mediaService = {
  async uploadMedia(file: File): Promise<{ url: string }> {
    const formData = new FormData()
    formData.append('file', file)

    const response = await apiClient.post<{ url: string }>('/media/upload', formData, {
      headers: {
        'Content-Type': 'multipart/form-data',
      },
    })
    return response.data
  },
}
