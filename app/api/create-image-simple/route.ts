import { NextRequest, NextResponse } from 'next/server'
import { ABVClient } from "@abvdev/client"
// Note: We don't import startActiveObservation because gateway calls are automatically traced by OpenTelemetry

// CRITICAL: Don't initialize OpenTelemetry at top-level
// We need to initialize it in POST handler with the SAME API key as gateway call
// This ensures ABVSpanProcessor uses the correct API key for tracing

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const { prompt, provider = 'openai', model = 'gpt-4o-mini', apiKey: bodyApiKey, baseUrl: bodyBaseUrl, walletAddress } = body

    // Input validation
    if (!prompt || typeof prompt !== 'string') {
      return NextResponse.json({ error: 'Prompt is required and must be a string' }, { status: 400 })
    }

    // Sanitize and validate prompt
    const sanitizedPrompt = prompt.trim()
    if (sanitizedPrompt.length === 0) {
      return NextResponse.json({ error: 'Prompt cannot be empty' }, { status: 400 })
    }

    if (sanitizedPrompt.length > 2000) {
      return NextResponse.json({ error: 'Prompt must be less than 2000 characters' }, { status: 400 })
    }

    // Validate provider and model
    if (provider && typeof provider !== 'string') {
      return NextResponse.json({ error: 'Invalid provider' }, { status: 400 })
    }

    if (model && typeof model !== 'string') {
      return NextResponse.json({ error: 'Invalid model' }, { status: 400 })
    }

    // Validate wallet address format if provided
    if (walletAddress && typeof walletAddress === 'string' && !/^0x[a-fA-F0-9]{40}$/.test(walletAddress)) {
      return NextResponse.json({ error: 'Invalid wallet address format' }, { status: 400 })
    }

    // CRITICAL: Priority MUST be bodyApiKey (from Settings) FIRST, then env var
    // This ensures OpenTelemetry uses the SAME API key as gateway call
    // If user sets API key in Settings, we MUST use that for both OpenTelemetry and gateway
    const apiKey = bodyApiKey || process.env.NEXT_PUBLIC_ABV_API_KEY || process.env.ABV_API_KEY
    const baseUrl = bodyBaseUrl || process.env.NEXT_PUBLIC_ABV_API_URL || process.env.ABV_API_URL || 'https://app.abv.dev'
    
    if (!apiKey) {
      console.error('[Simple API Route] ❌ No ABV.dev API key found!')
      console.error('[Simple API Route] Please set API key in Settings page or .env.local')
      return NextResponse.json({ 
        error: 'ABV.dev API key is required. Please set it in Settings page (Dashboard → Settings → ABV.dev API Key).' 
      }, { status: 400 })
    }
    
    // Log which API key source is being used
    if (bodyApiKey) {
      console.log('[Simple API Route] 🔑 Using API key from Settings (bodyApiKey)')
    } else if (process.env.NEXT_PUBLIC_ABV_API_KEY) {
      console.log('[Simple API Route] 🔑 Using API key from NEXT_PUBLIC_ABV_API_KEY env var')
    } else if (process.env.ABV_API_KEY) {
      console.log('[Simple API Route] 🔑 Using API key from ABV_API_KEY env var')
    }
    console.log('[Simple API Route] 🔑 API Key (partial):', apiKey.substring(0, 15) + '...' + apiKey.slice(-10))


    // CRITICAL: Initialize OpenTelemetry FIRST (Step 1 from ABV.dev docs)
    // This ensures ABVSpanProcessor uses the correct API key for tracing
    // ALWAYS re-initialize if API key changed (even if already initialized)
    // This is critical because API key from Settings might be different from env var
    const otelKey = `${apiKey}_${baseUrl}`
    const needsReinit = !(global as any).__abv_otel_initialized || (global as any).__abv_otel_key !== otelKey
    
    if (needsReinit) {
      console.log('[Simple API Route] 🔄 Initializing/Re-initializing OpenTelemetry SDK...')
      if ((global as any).__abv_otel_initialized) {
        console.log('[Simple API Route] 🔄 API key changed, re-initializing OpenTelemetry...')
        console.log('[Simple API Route] Old key:', (global as any).__abv_otel_key?.substring(0, 20) + '...')
        console.log('[Simple API Route] New key:', otelKey.substring(0, 20) + '...')
      }
      
      try {
        // Stop existing SDK if any
        if ((global as any).__abv_sdk) {
          try {
            console.log('[Simple API Route] 🛑 Shutting down existing OpenTelemetry SDK...')
            await (global as any).__abv_sdk.shutdown();
            console.log('[Simple API Route] ✅ Existing SDK shut down')
          } catch (e) {
            console.warn('[Simple API Route] ⚠️ Error shutting down existing SDK (non-critical):', e)
          }
        }

        const { NodeSDK } = await import("@opentelemetry/sdk-node");
        const { ABVSpanProcessor } = await import("@abvdev/otel");

        // CRITICAL: Initialize OpenTelemetry SDK with ABVSpanProcessor (Step 1 from docs)
        // Use the EXACT SAME API key that will be used for gateway call
        console.log('[Simple API Route] 🚀 Creating new OpenTelemetry SDK with API key:', apiKey.substring(0, 15) + '...' + apiKey.slice(-10))
        const sdk = new NodeSDK({
          spanProcessors: [
            new ABVSpanProcessor({
              apiKey: apiKey, // ← MUST be SAME API key as gateway call (from bodyApiKey if available)
              baseUrl: baseUrl,
              exportMode: "immediate", // Export immediately for real-time tracing
            })
          ],
          // Disable automatic HTTP instrumentation to avoid duplicate "fetch POST" trace
          // We only want the gateway-chat-completion trace, not the HTTP request trace
          instrumentations: [], // Empty array = no automatic instrumentation
        });

        sdk.start();
        (global as any).__abv_otel_initialized = true;
        (global as any).__abv_otel_key = otelKey;
        (global as any).__abv_sdk = sdk;
        
        console.log('[Simple API Route] ✅ OpenTelemetry SDK initialized successfully!')
        console.log('[Simple API Route] 🔑 API Key used for OpenTelemetry:', apiKey.substring(0, 15) + '...' + apiKey.slice(-10))
        console.log('[Simple API Route] 🌐 Base URL:', baseUrl)
      } catch (error: any) {
        console.error('[Simple API Route] ❌ Failed to initialize OpenTelemetry:', error.message)
        console.error('[Simple API Route] ⚠️ Continuing without OpenTelemetry - gateway call will still work but tracing may not work')
        // Don't throw - continue without OpenTelemetry, gateway call will still work
        // But tracing may not work properly
      }
    } else {
      console.log('[Simple API Route] ✅ OpenTelemetry SDK already initialized with same API key')
      console.log('[Simple API Route] 🔑 Using existing OpenTelemetry with key:', (global as any).__abv_otel_key?.substring(0, 20) + '...')
    }

    // Wait for OpenTelemetry to be ready (give it a moment to initialize)
    await new Promise(resolve => setTimeout(resolve, 500))

    // Step 2: Initialize ABVClient (after OpenTelemetry is initialized)
    // Gateway calls will be automatically traced by OpenTelemetry
    const abv = new ABVClient({
      apiKey: apiKey,
      baseUrl: baseUrl,
      region: "us"
    })
    
    console.log('[Simple API Route] ✅ ABVClient initialized')


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

    // Use system prompt for JSON response (required for SVG generation)
    const supportsJsonMode = ['gpt-4o', 'gpt-4o-mini', 'gpt-4-turbo', 'gpt-3.5-turbo'].includes(model)
    const requestBody: any = {
      provider: provider,
      model: model,
      messages: [
        { role: 'system', content: STORYSEAL_SYSTEM_PROMPT },
        { role: 'user', content: sanitizedPrompt }
      ],
      temperature: 0.8,
    }

    if (supportsJsonMode) {
      requestBody.response_format = { type: 'json_object' }
    }
    
    // Log the prompt being sent to ABV.dev
    console.log('[Simple API Route] 📝 Prompt being sent to ABV.dev:', sanitizedPrompt)
    console.log('[Simple API Route] 📝 User message content:', requestBody.messages[1].content)
    
    // NOTE: We don't need startActiveObservation because:
    // 1. Gateway calls are automatically traced by OpenTelemetry (via ABVSpanProcessor)
    // 2. Using startActiveObservation creates a duplicate trace
    // 3. The gateway call trace already includes the prompt in messages[1].content
    // So we just let OpenTelemetry handle tracing automatically

    try {
      // Check if gateway is available
      if (!abv.gateway || !abv.gateway.chat || !abv.gateway.chat.completions) {
        throw new Error('ABV.dev gateway is not available. Please check your API key and account status.')
      }
      
      console.log('[Simple API Route] 📤 Making gateway call to ABV.dev...')
      console.log('[Simple API Route] 📝 Full user prompt:', sanitizedPrompt)
      console.log('[Simple API Route] 🔑 API Key:', apiKey.substring(0, 15) + '...' + apiKey.slice(-10))
      console.log('[Simple API Route] 🌐 Base URL:', baseUrl)
      console.log('[Simple API Route] 🤖 Provider:', provider, '| Model:', model)
      console.log('[Simple API Route] 📨 Request messages:', {
        system: '[SYSTEM PROMPT - ' + STORYSEAL_SYSTEM_PROMPT.length + ' chars]',
        user: sanitizedPrompt.substring(0, 100) + (sanitizedPrompt.length > 100 ? '...' : '')
      })
      
      // Step 2: Make the gateway call (automatically traced by OpenTelemetry)
      // This is the key part - the gateway call will automatically appear in ABV.dev dashboard
      // The prompt in messages[1].content (user message) will be visible in ABV.dev dashboard
      const response = await abv.gateway.chat.completions.create(requestBody)
      
      console.log('[Simple API Route] ✅ Gateway call successful!')
      console.log('[Simple API Route] 📊 Response received')
      if (response && 'choices' in response) {
        const choices = (response as any).choices || []
        console.log('[Simple API Route] 📦 Response has', choices.length, 'choice(s)')
        if (choices[0]?.message?.content) {
          const content = choices[0].message.content
          console.log('[Simple API Route] 📄 Response content length:', content.length, 'chars')
          console.log('[Simple API Route] 👀 Response preview:', content.substring(0, 150) + '...')
        }
      }
      
      // Handle streaming response (if it's an async iterator)
      if (response && typeof (response as any)[Symbol.asyncIterator] === 'function') {
        throw new Error('Streaming response not supported. Please use non-streaming model.')
      }
      
      // Check if response is valid
      if (!response || !('choices' in response) || !response.choices || !response.choices[0] || !response.choices[0].message) {
        throw new Error('Invalid response from ABV.dev gateway')
      }
      
      const content = response.choices[0].message.content
      
      if (!content) {
        throw new Error('Empty response from ABV.dev gateway')
      }

      // Parse JSON response
      let svgData: any
      try {
        svgData = JSON.parse(content)
        if (!svgData.svg_code) {
          throw new Error('No SVG code in response')
        }
        // OpenTelemetry automatically traces the gateway call and response
        // No need to manually update observation
      } catch (parseError) {
        console.error('[Simple API Route] ❌ Failed to parse JSON response:', parseError)
        // OpenTelemetry will automatically trace the error
        throw new Error('Failed to parse SVG JSON response')
      }

      // Create data URL for SVG
      const svgDataUrl = `data:image/svg+xml;base64,${Buffer.from(svgData.svg_code).toString('base64')}`

      // Try to extract traceId from OpenTelemetry context
      // This will be available in ABV.dev dashboard for linking to IP registration
      let traceId: string | null = null
      try {
        const { context, trace } = await import("@opentelemetry/api")
        const activeSpan = trace.getActiveSpan()
        if (activeSpan) {
          const spanContext = activeSpan.spanContext()
          if (spanContext.traceId) {
            traceId = spanContext.traceId
            console.log('[Simple API Route] ✅ Extracted traceId from OpenTelemetry:', traceId)
          }
        }
      } catch (traceError) {
        console.warn('[Simple API Route] ⚠️ Could not extract traceId (non-critical):', traceError)
      }

      return NextResponse.json({
        svgData: svgData,
        svgUrl: svgDataUrl,
        ipId: null, // Will be set if auto-registered
        traceId: traceId, // ABV.dev trace ID for linking
        metadata: {
          prompt: sanitizedPrompt,
          provider: provider,
          model: model,
          generatedAt: new Date().toISOString(),
          traceId: traceId, // Include in metadata too
          abvTraceUrl: traceId ? `${baseUrl}/traces/${traceId}` : null, // Link to ABV.dev trace
        }
      })
    } catch (error: any) {
      console.error('[Simple API Route] Error:', error)
      
      // Provide more helpful error messages for common ABV.dev errors
      let errorMessage = error.message || 'Failed to generate image'
      let statusCode = 500
      
      // Check for specific ABV.dev error messages
      if (errorMessage.includes('No active subscription') || errorMessage.includes('subscription') || errorMessage.includes('credits')) {
        errorMessage = 'ABV.dev account has no active subscription or credits. Please:\n\n' +
          '1. Check your ABV.dev account at https://app.abv.dev\n' +
          '2. Ensure you have an active subscription or credits\n' +
          '3. Verify your API key is correct in Settings page\n' +
          '4. Contact ABV.dev support if the issue persists'
        statusCode = 402 // Payment Required
      } else if (errorMessage.includes('Invalid API key') || errorMessage.includes('Unauthorized') || errorMessage.includes('401')) {
        errorMessage = 'Invalid ABV.dev API key. Please:\n\n' +
          '1. Check your API key in Settings page\n' +
          '2. Get a new API key from https://app.abv.dev\n' +
          '3. Make sure the API key is correct and active'
        statusCode = 401
      } else if (errorMessage.includes('rate limit') || errorMessage.includes('429')) {
        errorMessage = 'ABV.dev rate limit exceeded. Please wait a moment and try again.'
        statusCode = 429
      }
      
      // OpenTelemetry will automatically trace errors
      // No need to manually end observation
      
      return NextResponse.json(
        { error: errorMessage },
        { status: statusCode }
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

