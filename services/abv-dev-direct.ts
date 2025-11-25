/**
 * ABV.dev Direct Client-Side Service
 * Call ABV.dev directly from client (no API route middleman)
 * This matches the demo behavior exactly
 */

'use client'

import { ABVClient } from "@abvdev/client"

export interface ABVGenerationParams {
  prompt: string
  provider?: 'openai' | 'anthropic' | 'google' | string
  model?: string
  walletAddress?: string
}

export interface SVGGenerationResponse {
  title: string
  description: string
  ip_signature: string
  svg_code: string
}

export interface ABVGenerationResponse {
  svgData: SVGGenerationResponse
  svgUrl: string
  ipId?: string
  metadata?: {
    prompt: string
    provider: string
    model: string
    generatedAt: string
  }
}

/**
 * Generate SVG directly from client (100% like demo)
 * No API route middleman - direct call to ABV.dev
 */
export async function generateImageDirect(params: ABVGenerationParams): Promise<ABVGenerationResponse> {
  try {
    const provider = params.provider || 'openai'
    const model = params.model || 'gpt-4o-mini'

    // Get API key from localStorage or env (for hackathon - OK to expose)
    const apiKey = typeof window !== 'undefined' 
      ? localStorage.getItem('abv_api_key') || process.env.NEXT_PUBLIC_ABV_API_KEY || 'sk-abv-50241875-3de1-4e0c-bef5-738ab5adb845'
      : process.env.NEXT_PUBLIC_ABV_API_KEY || 'sk-abv-50241875-3de1-4e0c-bef5-738ab5adb845'
    
    const baseUrl = typeof window !== 'undefined'
      ? localStorage.getItem('abv_api_url') || process.env.NEXT_PUBLIC_ABV_API_URL || 'https://app.abv.dev'
      : process.env.NEXT_PUBLIC_ABV_API_URL || 'https://app.abv.dev'

    console.log('[ABV Direct] Initializing ABVClient (direct from client)...')
    console.log('[ABV Direct] API Key:', apiKey ? `${apiKey.substring(0, 15)}...` : 'NOT SET')
    console.log('[ABV Direct] Base URL:', baseUrl)

    // Initialize ABVClient directly (like demo)
    const abv = new ABVClient({
      apiKey: apiKey,
      baseUrl: baseUrl,
      region: "us"
    })

    console.log('[ABV Direct] ✅ ABVClient initialized')
    console.log('[ABV Direct] 💡 Making direct gateway call (should be traced automatically)\n')

    // System prompt for SVG generation
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

    const supportsJsonMode = ['gpt-4o', 'gpt-4o-mini', 'gpt-4-turbo', 'gpt-3.5-turbo'].includes(model)
    const requestBody: any = {
      provider: provider,
      model: model,
      messages: [
        { role: 'system', content: STORYSEAL_SYSTEM_PROMPT },
        { role: 'user', content: params.prompt }
      ],
      temperature: 0.8,
    }

    if (supportsJsonMode) {
      requestBody.response_format = { type: 'json_object' }
    }

    // CRITICAL: Direct gateway call (100% like demo)
    // No API route middleman - this should be traced automatically by ABV.dev
    console.log('[ABV Direct] Making direct gateway call...')
    console.log('[ABV Direct] Prompt:', params.prompt.substring(0, 50) + '...')
    
    const response = await abv.gateway.chat.completions.create(requestBody)

    const content = response.choices[0].message.content
    console.log('[ABV Direct] ✅ Response received!')

    // Parse JSON response
    let svgData: any
    try {
      svgData = JSON.parse(content)
    } catch (parseError) {
      throw new Error('Failed to parse SVG JSON response')
    }

    if (!svgData.svg_code) {
      throw new Error('No SVG code in response')
    }

    // Create data URL for SVG (client-side compatible)
    // Use btoa for base64 encoding (browser native)
    const svgDataUrl = `data:image/svg+xml;base64,${btoa(unescape(encodeURIComponent(svgData.svg_code)))}`

    console.log('[ABV Direct] ✅ SVG generated successfully')
    console.log('[ABV Direct] 💡 Check ABV.dev dashboard for trace (should appear automatically)')

    return {
      svgData: svgData,
      svgUrl: svgDataUrl,
      ipId: null, // Will be set if auto-registered
      metadata: {
        prompt: params.prompt,
        provider: provider,
        model: model,
        generatedAt: new Date().toISOString(),
      }
    }

  } catch (error: any) {
    console.error('[ABV Direct] Error:', error)
    throw new Error(error.message || 'Failed to generate SVG with ABV.dev')
  }
}

