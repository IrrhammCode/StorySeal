import { NextRequest, NextResponse } from 'next/server'
import { ABVClient } from "@abvdev/client"
import { startActiveObservation } from "@abvdev/tracing"

// CRITICAL: Don't initialize OpenTelemetry at top-level
// We need to initialize it in POST handler with the SAME API key as gateway call
// This ensures ABVSpanProcessor uses the correct API key for tracing

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const { prompt, provider = 'openai', model = 'gpt-4o-mini', apiKey: bodyApiKey, baseUrl: bodyBaseUrl, walletAddress } = body

    console.log('[Simple API Route] Received request:', { prompt: prompt?.substring(0, 50) + '...', provider, model })

    if (!prompt) {
      return NextResponse.json({ error: 'Prompt is required' }, { status: 400 })
    }

    const apiKey = bodyApiKey || process.env.NEXT_PUBLIC_ABV_API_KEY || process.env.ABV_API_KEY || 'sk-abv-50241875-3de1-4e0c-bef5-738ab5adb845'
    const baseUrl = bodyBaseUrl || process.env.NEXT_PUBLIC_ABV_API_URL || process.env.ABV_API_URL || 'https://app.abv.dev'

    console.log('[Simple API Route] API Key to use:', apiKey ? `${apiKey.substring(0, 15)}...` : 'NOT SET')
    console.log('[Simple API Route] Base URL:', baseUrl)

    // CRITICAL: Initialize OpenTelemetry with SAME API key as gateway call
    // This ensures ABVSpanProcessor uses the correct API key for tracing
    // Re-initialize if API key changed (for multi-user scenarios)
    const otelKey = `${apiKey}_${baseUrl}`
    if (!(global as any).__abv_otel_initialized || (global as any).__abv_otel_key !== otelKey) {
      console.log('[Simple API Route] Initializing OpenTelemetry SDK with API key from request...')
      try {
        const { NodeSDK } = await import("@opentelemetry/sdk-node");
        const { ABVSpanProcessor } = await import("@abvdev/otel");

        // CRITICAL: Use the SAME API key as gateway call
        const sdk = new NodeSDK({
          spanProcessors: [
            new ABVSpanProcessor({
              apiKey: apiKey, // ← SAME API key as gateway call
              baseUrl: baseUrl,
              exportMode: "immediate",
            })
          ],
        });

        sdk.start();
        (global as any).__abv_otel_initialized = true;
        (global as any).__abv_otel_key = otelKey;
        
        console.log('[Simple API Route] ✅ OpenTelemetry SDK started with API key:', apiKey ? `${apiKey.substring(0, 15)}...` : 'NOT SET');
        console.log('[Simple API Route] Base URL:', baseUrl);
      } catch (error: any) {
        console.error('[Simple API Route] ❌ Failed to initialize OpenTelemetry:', error.message);
      }
    } else {
      console.log('[Simple API Route] ✅ OpenTelemetry already initialized with same API key');
    }

    // Wait for OpenTelemetry to be ready (like ABV.dev docs example)
    console.log('[Simple API Route] Waiting 500ms for OpenTelemetry SDK to initialize...')
    await new Promise(resolve => setTimeout(resolve, 500))
    console.log('[Simple API Route] ✅ OpenTelemetry should be ready\n')

    // Initialize ABVClient (exactly like test script)
    const abv = new ABVClient({
      apiKey: apiKey,
      baseUrl: baseUrl,
      region: "us"
    })

    console.log('[Simple API Route] ✅ ABVClient initialized')
    console.log('[Simple API Route] 💡 Gateway calls will be automatically traced by OpenTelemetry\n')

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

    // CRITICAL: Make gateway call with system prompt (for JSON response)
    // But ensure OpenTelemetry traces it correctly
    console.log('[Simple API Route] ==========================================')
    console.log('[Simple API Route] Making gateway call (should be automatically traced)...')
    console.log('[Simple API Route] Prompt:', prompt.substring(0, 50) + '...')
    console.log('[Simple API Route] OpenTelemetry initialized:', (global as any).__abv_otel_initialized)
    console.log('[Simple API Route] API Key used:', apiKey ? `${apiKey.substring(0, 15)}...` : 'NOT SET')
    console.log('[Simple API Route] Base URL:', baseUrl)
    console.log('[Simple API Route] 💡 Gateway call will be traced by ABVSpanProcessor')    
    console.log('[Simple API Route] ==========================================\n')

    // Use system prompt for JSON response (required for SVG generation)
    const supportsJsonMode = ['gpt-4o', 'gpt-4o-mini', 'gpt-4-turbo', 'gpt-3.5-turbo'].includes(model)
    const requestBody: any = {
      provider: provider,
      model: model,
      messages: [
        { role: 'system', content: STORYSEAL_SYSTEM_PROMPT },
        { role: 'user', content: prompt }
      ],
      temperature: 0.8,
    }

    if (supportsJsonMode) {
      requestBody.response_format = { type: 'json_object' }
    }
    
    console.log('[Simple API Route] Request body:', {
      provider: requestBody.provider,
      model: requestBody.model,
      hasSystemPrompt: true,
      userPrompt: prompt.substring(0, 30) + '...'
    })
    
    // Use startActiveObservation to ensure both input and output are traced
    console.log('[Simple API Route] 💡 Using startActiveObservation to trace input AND output...')
    let observation: any = null
    try {
      observation = startActiveObservation({
        name: "StorySeal SVG Generation",
        metadata: {
          prompt: prompt,
          provider: provider,
          model: model,
          walletAddress: walletAddress,
        }
      })
    } catch (obsError) {
      console.warn('[Simple API Route] ⚠️ Could not start active observation:', obsError)
      // Continue without observation - OpenTelemetry will still trace
    }

    try {
      // Make the gateway call (automatically traced by OpenTelemetry + active observation)
      console.log('[Simple API Route] 💡 Calling ABV.dev gateway (will trace input AND output)...')
      const response = await abv.gateway.chat.completions.create(requestBody)
      console.log('[Simple API Route] ✅ Gateway call completed!')

      const content = response.choices[0].message.content
      console.log('[Simple API Route] ✅ Response received!')
      console.log('[Simple API Route] Response length:', content.length)

      // Parse JSON response
      let svgData: any
      try {
        svgData = JSON.parse(content)
        if (!svgData.svg_code) {
          throw new Error('No SVG code in response')
        }
        console.log('[Simple API Route] ✅ SVG data parsed successfully')
        
        // Update observation with output and parsed SVG data
        console.log('[Simple API Route] 💡 Adding output to trace...')
        if (observation) {
          try {
            observation.update({
              output: content.substring(0, 500) + (content.length > 500 ? '...' : ''), // Truncate for metadata
              outputLength: content.length,
              hasSvg: content.includes('<svg'),
              svgTitle: svgData.title,
              svgDescription: svgData.description,
              ipSignature: svgData.ip_signature,
              hasSvgCode: !!svgData.svg_code,
            })
            observation.end()
          } catch (obsError) {
            console.warn('[Simple API Route] ⚠️ Could not update observation:', obsError)
          }
        }
        console.log('[Simple API Route] ✅ Output added to trace!')
        console.log('[Simple API Route] 💡 Check ABV.dev dashboard - both input AND output should appear!')
        console.log('[Simple API Route] 💡 Dashboard: https://app.abv.dev/asset-registration')
        console.log('[Simple API Route] ==========================================\n')
      } catch (parseError) {
        console.error('[Simple API Route] ❌ Failed to parse JSON response:', parseError)
        // Update observation with error before ending
        if (observation) {
          try {
            observation.update({
              error: 'Failed to parse SVG JSON response',
              rawContent: content.substring(0, 200) + '...',
              outputLength: content.length,
            })
            observation.end()
          } catch (obsError) {
            // Ignore observation errors
          }
        }
        throw new Error('Failed to parse SVG JSON response')
      }

      // Create data URL for SVG
      const svgDataUrl = `data:image/svg+xml;base64,${Buffer.from(svgData.svg_code).toString('base64')}`

      return NextResponse.json({
        svgData: svgData,
        svgUrl: svgDataUrl,
        ipId: null, // Will be set if auto-registered
        traceId: null, // Will be extracted if available
        metadata: {
          prompt: prompt,
          provider: provider,
          model: model,
          generatedAt: new Date().toISOString(),
        }
      })
    } catch (error: any) {
      console.error('[Simple API Route] Error:', error)
      // End observation if it exists and hasn't been ended
      if (observation && !observation.ended) {
        try {
          observation.update({
            error: error.message || 'Failed to generate image',
          })
          observation.end()
        } catch (obsError) {
          // Ignore observation errors
        }
      }
      return NextResponse.json(
        { error: error.message || 'Failed to generate image' },
        { status: 500 }
      )
    }
  } catch (error: any) {
    console.error('[Simple API Route] Outer error:', error)
    return NextResponse.json(
      { error: error.message || 'Failed to generate image' },
      { status: 500 }
    )
  }
}

