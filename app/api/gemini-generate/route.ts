import { NextRequest, NextResponse } from 'next/server'
import { GoogleGenerativeAI } from '@google/generative-ai'

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

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const { prompt, apiKey } = body

    if (!prompt) {
      return NextResponse.json({ error: 'Prompt is required' }, { status: 400 })
    }

    if (!apiKey) {
      return NextResponse.json({ error: 'Gemini AI API key is required' }, { status: 400 })
    }

    console.log('[Gemini API Route] Generating image with prompt:', prompt.substring(0, 50) + '...')

    // Use Google Generative AI SDK
    const genAI = new GoogleGenerativeAI(apiKey)
    
    // Try multiple models in order - start with most basic/legacy models
    // Note: Model availability depends on API key permissions and region
    // gemini-1.5-pro is legacy, use gemini-2.0-flash or gemini-1.5-flash instead
    const modelsToTry = [
      'gemini-pro',           // Legacy model, most widely available
      'gemini-1.5-flash',     // Fast model (recommended)
      'gemini-2.0-flash',     // Latest flash model (if available)
      'gemini-1.5-flash-latest', // Latest flash variant
      'gemini-1.5-pro',       // Legacy pro (may not work)
    ]
    
    const fullPrompt = `${STORYSEAL_SYSTEM_PROMPT}\n\nUser prompt: ${prompt}\n\nGenerate the SVG artwork as JSON. Remember: Output ONLY the JSON object, no markdown, no explanations.`
    
    let lastError: any = null
    
    for (const modelName of modelsToTry) {
      try {
        console.log(`[Gemini API Route] 🔄 Trying model: ${modelName}`)
        
        const model = genAI.getGenerativeModel({ 
          model: modelName,
          generationConfig: {
            temperature: 0.8,
            topK: 40,
            topP: 0.95,
            maxOutputTokens: 8192,
            responseMimeType: 'application/json',
          }
        })
        
        const result = await model.generateContent(fullPrompt)
        const response = await result.response
        const content = response.text()
        
        console.log(`[Gemini API Route] ✅ Response received from model: ${modelName}`)

        // Parse JSON response
        let jsonContent = content.trim()
        
        // Remove markdown code blocks if present
        if (jsonContent.startsWith('```json')) {
          jsonContent = jsonContent.replace(/^```json\n?/, '').replace(/\n?```$/, '')
        } else if (jsonContent.startsWith('```')) {
          jsonContent = jsonContent.replace(/^```\n?/, '').replace(/\n?```$/, '')
        }

        let svgData: any
        try {
          svgData = JSON.parse(jsonContent)
        } catch (parseError) {
          console.error('[Gemini API Route] Failed to parse JSON:', jsonContent.substring(0, 200))
          throw new Error('Failed to parse SVG JSON response from Gemini AI')
        }

        if (!svgData.svg_code) {
          throw new Error('No SVG code in Gemini AI response')
        }

        // Create data URL for SVG
        const svgDataUrl = `data:image/svg+xml;base64,${Buffer.from(svgData.svg_code).toString('base64')}`

        console.log(`[Gemini API Route] ✅ SVG generated successfully with model: ${modelName}`)

        return NextResponse.json({
          svgData: svgData,
          svgUrl: svgDataUrl,
          metadata: {
            prompt: prompt,
            provider: 'gemini',
            model: modelName,
            generatedAt: new Date().toISOString(),
          }
        })
        
      } catch (error: any) {
        // Extract error message (could be from SDK error object)
        const errorMessage = error?.message || error?.toString() || String(error)
        const errorString = errorMessage.toLowerCase()
        
        console.log(`[Gemini API Route] ❌ Error with model ${modelName}:`, errorMessage)
        console.log(`[Gemini API Route] Error details:`, {
          message: error?.message,
          name: error?.name,
          stack: error?.stack?.substring(0, 200),
        })
        
        // If it's a model not found/not supported error, try next model
        const isModelNotFound = 
          errorString?.includes('not found') || 
          errorString?.includes('not supported') ||
          errorString?.includes('404') ||
          errorString?.includes('model not found') ||
          errorString?.includes('is not found for api version') ||
          errorString?.includes('is not supported for generatecontent')
        
        if (isModelNotFound) {
          console.log(`[Gemini API Route] ⚠️ Model ${modelName} not available, trying next model...`)
          lastError = error
          continue
        }
        
        // Other errors, throw immediately
        console.error(`[Gemini API Route] ❌ Non-model error with ${modelName}, throwing:`, error)
        throw error
      }
    }
    
    // All models failed
    const errorMsg = lastError?.message || 'Unknown error'
    throw new Error(
      `All Gemini models failed. Last error: ${errorMsg}\n\n` +
      `Possible solutions:\n` +
      `1. Check if your API key is valid and active\n` +
      `2. Enable Generative Language API in Google Cloud Console\n` +
      `3. Ensure your API key has permission to use Gemini models\n` +
      `4. Try creating a new API key from https://aistudio.google.com/apikey`
    )

  } catch (error: any) {
    console.error('[Gemini API Route] Error:', error)
    return NextResponse.json(
      { error: error.message || 'Failed to generate SVG with Gemini AI' },
      { status: 500 }
    )
  }
}

