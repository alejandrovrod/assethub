import { apiClient } from '../lib/api-client'

export interface LoginRequest {
  email: string
  password: string
}

export interface LoginResponse {
  accessToken: string
  refreshToken: string
  expiresIn: number
}

export const authService = {
  login: async (request: LoginRequest): Promise<LoginResponse> => {
    const { data } = await apiClient.post<LoginResponse>('/auth/login', request)
    return data
  },
  
  // You can add refresh token logic here later
}
