/**
 * Gemini AI Service for image generation
 * Uses Next.js API route as proxy to avoid client-side SDK issues
 */

export interface GeminiGenerationParams {
  prompt: string
  apiKey?: string
}

export interface GeminiGenerationResponse {
  svgData: {
    title: string
    description: string
    ip_signature: string
    svg_code: string
  }
  svgUrl: string
  metadata: {
    prompt: string
    provider: 'gemini'
    model: string
    generatedAt: string
  }
}

const STORYSEAL_SYSTEM_PROMPT = `You are StorySeal-Engine, an advanced Generative AI specialized in creating HIGH-QUALITY, professional, artistic Scalable Vector Graphics (SVG) code.

YOUR RULES:
1. NO CHATTING: Do not provide explanations, introductions, or markdown blocks like "\`\`\`json". Output ONLY raw JSON.
2. FORMAT: Your response must be a valid JSON object with the following structure:
   {
     "title": "Short title of the artwork",
     "description": "Brief description of the visual",
     "ip_signature": "Generated unique ID (e.g., SEAL-x9283)",
     "svg_code": "<svg ...> ... </svg>"
   }
3. HIGH QUALITY ARTISTIC STYLE:
   - Create PREMIUM, PROFESSIONAL, and VISUALLY STUNNING vector graphics
   - Use HIGH-RESOLUTION dimensions: width="2048" height="2048" viewBox="0 0 2048 2048"
   - Use rich gradients, vibrant colors, smooth curves, and detailed elements
   - Ensure all paths are clean, well-defined, and properly closed
   - Use proper layering and composition for depth
   - Add subtle shadows, highlights, and depth effects where appropriate
   - Make it look like professional digital art, not simple shapes
4. MANDATORY WATERMARK: Inside the svg_code, you MUST inject an invisible comment tag as the very first line inside the <svg> tag.
   Format: <!-- SEAL-IP:ip_signature -->
5. QUALITY REQUIREMENTS:
   - SVG must be detailed and intricate, not simplistic
   - Use multiple layers and complex paths for richness
   - Ensure proper viewBox for scaling without quality loss
   - All elements should be crisp and well-defined
INPUT HANDLING:
- Interpret the user's prompt creatively and add artistic details to make it look PREMIUM and PROFESSIONAL
- If the prompt is vague, add sophisticated artistic elements, details, and visual interest
- Ensure the SVG is high-resolution and suitable for professional use
- Make it visually impressive and worthy of IP protection`

export class GeminiAIService {
  private apiKey: string | null = null

  constructor(apiKey?: string) {
    this.apiKey = apiKey || (typeof window !== 'undefined' ? localStorage.getItem('gemini_api_key') : null) || null
  }

  /**
   * Generate SVG artwork using Gemini AI
   * Uses Google Generative AI API
   */
  async generateImage(params: GeminiGenerationParams): Promise<GeminiGenerationResponse> {
    try {
      const apiKey = params.apiKey || this.apiKey || (typeof window !== 'undefined' ? localStorage.getItem('gemini_api_key') : null)
      
      if (!apiKey) {
        throw new Error('Gemini AI API key not configured. Please set it in Settings.')
      }

      console.log('[Gemini AI] Generating image with prompt:', params.prompt.substring(0, 50) + '...')

      // Use Next.js API route as proxy (server-side SDK usage)
      console.log('[Gemini AI] Calling API route: /api/gemini-generate')
      const response = await fetch('/api/gemini-generate', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          prompt: params.prompt,
          apiKey: apiKey,
        }),
      })

      console.log('[Gemini AI] Response status:', response.status, response.statusText)

      if (!response.ok) {
        const error = await response.json().catch(() => ({ error: 'Unknown error' }))
        console.error('[Gemini AI] API error:', error)
        throw new Error(error.error || `API error: ${response.statusText}`)
      }

      const data = await response.json()
      console.log('[Gemini AI] ✅ Response received successfully')
      console.log('[Gemini AI] SVG data keys:', Object.keys(data.svgData || {}))

      // API route already handles parsing and validation
      return {
        svgData: data.svgData,
        svgUrl: data.svgUrl,
        metadata: data.metadata,
      }

    } catch (error: any) {
      console.error('[Gemini AI] Error:', error)
      throw new Error(error.message || 'Failed to generate SVG with Gemini AI')
    }
  }
}

