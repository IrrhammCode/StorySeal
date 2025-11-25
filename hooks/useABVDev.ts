'use client'

import { useMutation } from '@tanstack/react-query'
import { createABVDevService, ABVGenerationParams, ABVGenerationResponse } from '@/services/abv-dev'

/**
 * Hook for ABV.dev image generation
 * Uses API route (with OpenTelemetry tracing on server-side)
 * OpenTelemetry hanya bekerja di server-side, jadi perlu API route
 */
export function useABVGenerateImage() {
  return useMutation({
    mutationFn: async (params: ABVGenerationParams): Promise<ABVGenerationResponse> => {
      const service = createABVDevService()
      // Use API route with OpenTelemetry tracing (server-side)
      return await service.generateImage(params)
    },
  })
}

/**
 * Hook for ABV.dev image generation with auto Story Protocol registration
 * Uses API route (with OpenTelemetry tracing on server-side)
 */
export function useABVGenerateImageWithRegistration() {
  return useMutation({
    mutationFn: async (params: ABVGenerationParams): Promise<ABVGenerationResponse> => {
      const service = createABVDevService()
      // Use API route with OpenTelemetry tracing (server-side)
      return await service.generateImage(params)
    },
  })
}

