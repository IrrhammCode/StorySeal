/**
 * ABV.dev API Service
 * For AI SVG generation using StorySeal-Engine with Story Protocol integration
 * Using Next.js API route as proxy to avoid CORS issues
 */

export interface ABVGenerationParams {
  prompt: string
  provider?: 'openai' | 'anthropic' | 'google' | string
  model?: string
  walletAddress?: string // Wallet address for Story Protocol IP ownership
}

export interface SVGGenerationResponse {
  title: string
  description: string
  ip_signature: string
  svg_code: string
}

export interface ABVGenerationResponse {
  svgData: SVGGenerationResponse
  svgUrl: string // Data URL of the SVG
  ipId?: string // If auto-registered with Story Protocol
  traceId?: string | null // ABV.dev trace ID for linking
  metadata?: {
    prompt: string
    provider: string
    model: string
    generatedAt: string
    traceId?: string | null
    abvTraceUrl?: string | null
  }
}

export class ABVDevService {
  private apiKey: string | null = null
  private baseUrl: string

  constructor(apiKey?: string) {
    // Try to get from parameter, then env var, then localStorage (for settings page)
    this.apiKey = apiKey || 
      process.env.NEXT_PUBLIC_ABV_API_KEY || 
      (typeof window !== 'undefined' ? localStorage.getItem('abv_api_key') : null) ||
      null
    this.baseUrl = process.env.NEXT_PUBLIC_ABV_API_URL || 
      (typeof window !== 'undefined' ? localStorage.getItem('abv_api_url') : null) ||
      'https://app.abv.dev'
  }

  /**
   * Generate SVG artwork using StorySeal-Engine via ABV.dev Gateway API
   * This will auto-register as IP on Story Protocol if configured
   * Uses Next.js API route as proxy to avoid CORS issues
   */
  async generateImage(params: ABVGenerationParams): Promise<ABVGenerationResponse> {
    try {
      const provider = params.provider || 'openai'
      const model = params.model || 'gpt-4'

      // ALWAYS read from localStorage first (Settings page takes priority)
      // This ensures API key from Settings is always used, even if service was created before Settings was updated
      const apiKey = (typeof window !== 'undefined' ? localStorage.getItem('abv_api_key') : null) 
        || this.apiKey 
        || process.env.NEXT_PUBLIC_ABV_API_KEY
        || null
      
      const baseUrl = (typeof window !== 'undefined' ? localStorage.getItem('abv_api_url') : null)
        || this.baseUrl 
        || process.env.NEXT_PUBLIC_ABV_API_URL 
        || 'https://app.abv.dev'
      
      if (!apiKey) {
        throw new Error('ABV.dev API key is required. Please set it in Settings page (Dashboard → Settings → ABV.dev API Key).')
      }
      
      // Use simple route that matches test script exactly
      const response = await fetch('/api/create-image-simple', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          prompt: params.prompt,
          provider: provider,
          model: model,
          apiKey: apiKey, // Send API key from client (if set in settings)
          baseUrl: baseUrl, // Send base URL from client (if set in settings)
          walletAddress: params.walletAddress, // Send wallet address for Story Protocol integration
        }),
      })

      if (!response.ok) {
        const error = await response.json().catch(() => ({ message: 'Unknown error' }))
        throw new Error(error.error || error.message || `API error: ${response.statusText}`)
      }

      const data = await response.json()

      // API route already handles parsing and validation
      return {
        svgData: data.svgData,
        svgUrl: data.svgUrl,
        ipId: data.ipId,
        metadata: data.metadata,
      }
    } catch (error: any) {
      console.error('ABV.dev generation error:', error)
      throw new Error(error.message || 'Failed to generate SVG with StorySeal-Engine')
    }
  }

  /**
   * Query trace from ABV.dev to get IP ID (if Story Protocol registration is async)
   * According to ABV.dev docs: https://docs.abv.dev/developer/prompt-management/link-prompts-to-traces
   * IP ID might be in trace/observation metadata
   */
  async queryTraceForIPId(traceId: string): Promise<string | null> {
    try {
      // ALWAYS read from localStorage first (Settings page takes priority)
      const apiKey = (typeof window !== 'undefined' ? localStorage.getItem('abv_api_key') : null)
        || this.apiKey 
        || process.env.NEXT_PUBLIC_ABV_API_KEY
        || null
      
      const baseUrl = (typeof window !== 'undefined' ? localStorage.getItem('abv_api_url') : null)
        || this.baseUrl 
        || process.env.NEXT_PUBLIC_ABV_API_URL 
        || 'https://app.abv.dev'
      
      if (!apiKey) {
        console.warn('[ABV.dev] No API key available for trace query')
        return null
      }

      // Try to query trace via ABV.dev API
      // Note: This endpoint might not exist - need to check ABV.dev API docs
      try {
        const response = await fetch(`${baseUrl}/api/traces/${traceId}`, {
          method: 'GET',
          headers: {
            'Authorization': `Bearer ${apiKey}`,
            'Content-Type': 'application/json',
          },
        })

        if (response.ok) {
          const traceData = await response.json()
          console.log('[ABV.dev] Trace data:', JSON.stringify(traceData, null, 2))
          
          // Check for IP ID in trace metadata
          const ipId = traceData.ip_id 
            || traceData.story_ip_id 
            || traceData.metadata?.ip_id
            || traceData.metadata?.story_ip_id
            || traceData.observations?.[0]?.metadata?.ip_id
            || traceData.observations?.[0]?.metadata?.story_ip_id
          
          if (ipId) {
            console.log('[ABV.dev] ✅ IP ID found in trace:', ipId)
            return ipId
          }
        }
      } catch (apiError: any) {
        console.log('[ABV.dev] Trace API endpoint might not exist:', apiError.message)
        console.log('[ABV.dev] 💡 IP ID might be available in ABV.dev dashboard instead')
      }

      return null
    } catch (error: any) {
      console.error('[ABV.dev] Error querying trace:', error)
      return null
    }
  }

  /**
   * Generate SVG without auto-registration (manual registration later)
   * Uses Next.js API route as proxy to avoid CORS issues
   */
  async generateImageWithoutRegistration(params: ABVGenerationParams): Promise<ABVGenerationResponse> {
    try {
      const provider = params.provider || 'openai'
      const model = params.model || 'gpt-4'

      // ALWAYS read from localStorage first (Settings page takes priority)
      const apiKey = (typeof window !== 'undefined' ? localStorage.getItem('abv_api_key') : null)
        || this.apiKey 
        || process.env.NEXT_PUBLIC_ABV_API_KEY
        || null
      
      const baseUrl = (typeof window !== 'undefined' ? localStorage.getItem('abv_api_url') : null)
        || this.baseUrl 
        || process.env.NEXT_PUBLIC_ABV_API_URL 
        || 'https://app.abv.dev'
      
      if (!apiKey) {
        throw new Error('ABV.dev API key is required. Please set it in Settings page (Dashboard → Settings → ABV.dev API Key).')
      }
      
      // Use simple route that matches test script exactly
      const response = await fetch('/api/create-image-simple', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          prompt: params.prompt,
          provider: provider,
          model: model,
          apiKey: apiKey, // Send API key from client (if set in settings)
          baseUrl: baseUrl, // Send base URL from client (if set in settings)
          walletAddress: params.walletAddress, // Send wallet address for Story Protocol integration
        }),
      })

      if (!response.ok) {
        const error = await response.json().catch(() => ({ message: 'Unknown error' }))
        throw new Error(error.error || error.message || `API error: ${response.statusText}`)
      }

      const data = await response.json()

      // API route already handles parsing and validation
      return {
        svgData: data.svgData,
        svgUrl: data.svgUrl,
        ipId: data.ipId,
        metadata: data.metadata,
      }
    } catch (error: any) {
      console.error('ABV.dev generation error:', error)
      throw new Error(error.message || 'Failed to generate SVG with StorySeal-Engine')
    }
  }
}

/**
 * Create ABV.dev service instance
 */
export function createABVDevService(apiKey?: string): ABVDevService {
  return new ABVDevService(apiKey)
}
