import { useMutation } from '@tanstack/react-query'
import { GeminiAIService, type GeminiGenerationParams, type GeminiGenerationResponse } from '@/services/gemini-ai'

/**
 * React Query hook for generating images with Gemini AI
 */
export function useGeminiGenerateImage() {
  return useMutation<GeminiGenerationResponse, Error, GeminiGenerationParams>({
    mutationFn: async (params: GeminiGenerationParams) => {
      const service = new GeminiAIService()
      return await service.generateImage(params)
    },
    onError: (error) => {
      console.error('[useGeminiGenerateImage] Error:', error)
    },
  })
}










