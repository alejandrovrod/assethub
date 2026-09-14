import { useEffect } from 'react'
import { useQuery } from '@tanstack/react-query'
import { authService } from '@/services/auth.service'
import { useAuthStore } from '@/store/auth.store'

export function useProfile() {
  const { userProfile, setUserProfile, isAuthenticated } = useAuthStore()

  const { data, isLoading, error, refetch } = useQuery({
    queryKey: ['user-profile'],
    queryFn: () => authService.getMe(),
    enabled: isAuthenticated,
    staleTime: 5 * 60 * 1000, // 5 minutes
  })

  useEffect(() => {
    if (data) {
      setUserProfile(data)
    }
  }, [data, setUserProfile])

  return {
    profile: userProfile ?? data,
    isLoading,
    error,
    refetch,
  }
}

export function usePermissions() {
  const { permissions } = useAuthStore()

  const can = (permission: string): boolean => {
    return permissions.includes(permission)
  }

  const canAny = (permissionsToCheck: string[]): boolean => {
    return permissionsToCheck.some(p => permissions.includes(p))
  }

  const canAll = (permissionsToCheck: string[]): boolean => {
    return permissionsToCheck.every(p => permissions.includes(p))
  }

  return { can, canAny, canAll, permissions }
}