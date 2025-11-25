import { NextRequest, NextResponse } from 'next/server'

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const { prompt, provider = 'openai', model = 'gpt-4o-mini', apiKey: bodyApiKey, baseUrl: bodyBaseUrl, walletAddress } = body

    console.log('[API Route] Received request:', { prompt: prompt?.substring(0, 50) + '...', provider, model, hasApiKey: !!bodyApiKey, walletAddress })

    if (!prompt) {
      return NextResponse.json({ error: 'Prompt is required' }, { status: 400 })
    }

    const apiKey = bodyApiKey || process.env.NEXT_PUBLIC_ABV_API_KEY
    // Use https://app.abv.dev as base URL (as per user's ABV.dev project configuration)
    const baseUrl = bodyBaseUrl || process.env.NEXT_PUBLIC_ABV_API_URL || 'https://app.abv.dev'

    console.log('[API Route] Using API key:', apiKey ? `${apiKey.substring(0, 10)}...` : 'none')
    console.log('[API Route] Using base URL:', baseUrl)
    console.log('[API Route] Expected project: ayden-first-project (cmi70e87p0008mk07g64kadz6)')

    if (!apiKey || apiKey === 'your-abv-api-key-here') {
      return NextResponse.json(
        { error: 'ABV.dev API key not configured' },
        { status: 401 }
      )
    }

    const STORYSEAL_SYSTEM_PROMPT = `You are StorySeal-Engine, an advanced Generative AI specialized in creating HIGH-QUALITY, professional, artistic Scalable Vector Graphics (SVG) code.

YOUR RULES:
1. NO CHATTING: Do not provide explanations, introductions, or markdown blocks like "\\\`\\\`\\\`json". Output ONLY raw JSON.
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
        { role: 'user', content: prompt }
      ],
      temperature: 0.8, // Slightly higher for more creative and detailed outputs
    }

    if (supportsJsonMode) {
      requestBody.response_format = { type: 'json_object' }
    }

    // Add wallet address for Story Protocol integration
    // ABV.dev requires wallet address to be configured in dashboard OR passed in request
    // Wallet address: 0x4B56166d9E03747f5c66C4b21910Bb43BBCd53Eb (configured in ABV.dev dashboard)
    if (walletAddress) {
      // Try adding wallet address to request (if ABV.dev supports it)
      // Some ABV.dev integrations may require this in headers or metadata
      requestBody.wallet_address = walletAddress
      requestBody.recipient_address = walletAddress
      console.log('[API Route] Adding wallet address to request:', walletAddress)
    }

    let data: any
    let content: string

    try {
      // CRITICAL: Initialize OpenTelemetry EXACTLY like test script
      // Test script works, so we need to match it exactly
      let otelInitialized = false
      try {
        // Step 1: Initialize OpenTelemetry manually
        console.log('[API Route] Step 1: Initializing OpenTelemetry manually...')
        try {
          
          const { NodeSDK } = await import("@opentelemetry/sdk-node");
          const { ABVSpanProcessor } = await import("@abvdev/otel");
          
          console.log('[API Route] Initializing OpenTelemetry SDK manually...')
          const sdk = new NodeSDK({
            spanProcessors: [
              new ABVSpanProcessor({
                apiKey: apiKey || 'sk-abv-50241875-3de1-4e0c-bef5-738ab5adb845',
                baseUrl: baseUrl,
                exportMode: "immediate", // Same as test script
              })
            ],
          });
          
          sdk.start();
          console.log('[API Route] Waiting 500ms for SDK to initialize...')
          await new Promise(resolve => setTimeout(resolve, 500));
          otelInitialized = true
          console.log('[API Route] ✅ OpenTelemetry initialized manually')
        }
      } catch (otelError: any) {
        console.error('[API Route] ❌ Failed to initialize OpenTelemetry:', otelError.message)
        console.error('[API Route] Stack:', otelError.stack)
        // Continue anyway - gateway call will still work
      }
      
      // Import ABV.dev packages (server-side only)
      const { ABVClient } = await import("@abvdev/client");
      
      // Step 2: Initialize ABVClient (exactly like test script)
      console.log('[API Route] Step 2: Initializing ABVClient (like test script)...')
      
      // Initialize ABV.dev client (exactly like test script)
      const abv = new ABVClient({
        apiKey: apiKey || 'sk-abv-50241875-3de1-4e0c-bef5-738ab5adb845',
        baseUrl: baseUrl,
        region: "us"
      });
      
      console.log('[API Route] ✅ ABVClient initialized (like test script)')
      console.log('[API Route] 💡 Gateway calls will be automatically traced by OpenTelemetry (like test script)')
      
      console.log('[ABV.dev SDK] ==========================================')
      console.log('[ABV.dev SDK] ABV.dev Client Configuration:')
      console.log('[ABV.dev SDK] Base URL:', baseUrl)
      console.log('[ABV.dev SDK] API Key:', apiKey ? `${apiKey.substring(0, 15)}...` : 'NOT SET')
      console.log('[ABV.dev SDK] Expected Project: ayden-first-project')
      console.log('[ABV.dev SDK] OpenTelemetry initialized:', otelInitialized)
      console.log('[ABV.dev SDK] Global __abv_otel_initialized:', (global as any).__abv_otel_initialized)
      console.log('[ABV.dev SDK] ==========================================')
      console.log('[ABV.dev SDK] ⚠️ NOTE: This is API route (middleman)')
      console.log('[ABV.dev SDK] ⚠️ Tracing context might be lost through API route')
      console.log('[ABV.dev SDK] 💡 Gateway call will be traced via OpenTelemetry + startActiveObservation')
      console.log('[ABV.dev SDK] 💡 If tracing doesn\'t work, consider direct call from client (for hackathon)')
      
      // Step 3: Make gateway call (EXACTLY like test script)
      // Test script: Just call gateway directly, OpenTelemetry will automatically trace it
      // No startActiveObservation needed - ABVSpanProcessor handles it automatically
      console.log('[API Route] Step 3: Making gateway call (automatically traced, like test script)...')
      console.log('[API Route] Prompt:', prompt.substring(0, 50) + '...')
      console.log('[API Route] Provider:', provider, 'Model:', model)
      console.log('[API Route] 💡 This should be automatically traced by OpenTelemetry (like test script)')
      
      // CRITICAL: This should be automatically traced by OpenTelemetry (like test script)
      // Test script doesn't use startActiveObservation - just direct call
      const response = await abv.gateway.chat.completions.create(requestBody);
      content = response.choices[0].message.content;
      
      console.log('[ABV.dev SDK] ✅ Gateway call completed');
      console.log('[ABV.dev SDK] ==========================================')
      console.log('[ABV.dev SDK] 📋 TRACING STATUS:')
      console.log('[ABV.dev SDK] - OpenTelemetry initialized:', otelInitialized)
      console.log('[ABV.dev SDK] - Gateway call made via API route (middleman)')
      console.log('[ABV.dev SDK] - Expected in dashboard: Prompt + Output')
      console.log('[ABV.dev SDK] - Dashboard URL: https://app.abv.dev/asset-registration')
      console.log('[ABV.dev SDK] ==========================================')
      console.log('[ABV.dev SDK] ⚠️ If prompt doesn\'t appear in dashboard:')
      console.log('[ABV.dev SDK]    1. Check terminal logs above for OpenTelemetry status')
      console.log('[ABV.dev SDK]    2. Wait 10-15 seconds (tracing may be async)')
      console.log('[ABV.dev SDK]    3. Check ABV.dev dashboard: https://app.abv.dev/asset-registration')
      console.log('[ABV.dev SDK]    4. Consider direct call from client (no middleman)')
      console.log('[ABV.dev SDK] ==========================================')
      
      // Extract IP ID from ABV.dev response (if Story Protocol integration is enabled)
      // According to ABV.dev docs: https://docs.abv.dev/developer/quickstart-js-ts
      // Gateway API may not return IP ID directly - it might be in trace/observation
      const responseAny = response as any
      
      // Deep search for trace ID in all possible locations
      const possibleTraceIdFields = [
        responseAny.trace_id,
        responseAny.traceId,
        responseAny.traceID,
        responseAny.observation_id,
        responseAny.observationId,
        responseAny.observationID,
        responseAny._traceId,
        responseAny._trace_id,
        responseAny.headers?.['x-trace-id'],
        responseAny.headers?.['X-Trace-ID'],
        responseAny.headers?.['trace-id'],
        responseAny.metadata?.trace_id,
        responseAny.metadata?.traceId,
        responseAny.data?.trace_id,
        responseAny.data?.traceId,
        responseAny.usage?.trace_id,
        responseAny.usage?.traceId,
      ].filter(Boolean)
      
      // Check all possible IP ID fields in response
      let ipId = response.ip_id 
        || response.story_ip_id 
        || response.storyIpId 
        || responseAny.ipId
        || responseAny.storyProtocolIpId
        || responseAny.story_protocol_ip_id
        || responseAny.metadata?.ip_id
        || responseAny.metadata?.story_ip_id
        || responseAny.data?.ip_id
        || responseAny.data?.story_ip_id
        || responseAny.headers?.['x-story-ip-id']
        || responseAny.headers?.['X-Story-IP-ID']
      
      // Get trace ID from first non-null value
      const traceId = possibleTraceIdFields[0] || null
      
      // Log tracing status
      if (otelInitialized) {
        console.log('[ABV.dev SDK] ✅✅✅ TRACING ACTIVE! ✅✅✅')
        console.log('[ABV.dev SDK] ✅ OpenTelemetry initialized:', otelInitialized)
        console.log('[ABV.dev SDK] ✅ Gateway call automatically traced via ABVSpanProcessor')
        if (traceId) {
          console.log('[ABV.dev SDK] ✅ Trace ID found in response:', traceId)
          console.log('[ABV.dev SDK] 💡 Check trace in dashboard:', `${baseUrl}/traces/${traceId}`)
        } else {
          console.log('[ABV.dev SDK] 💡 Trace ID not in response (normal - trace sent via OpenTelemetry)')
        }
        console.log('[ABV.dev SDK] 💡 Asset Registration:', `${baseUrl}/asset-registration`)
        console.log('[ABV.dev SDK] 💡 Trace should appear in ABV.dev dashboard automatically!')
      } else {
        console.log('[ABV.dev SDK] ⚠️ OpenTelemetry not initialized - tracing may not be active')
        console.log('[ABV.dev SDK] 💡 Gateway call will still work, but trace may not appear in dashboard')
      }
      
      if (ipId) {
        console.log('[ABV.dev SDK] ✅ Story Protocol IP ID detected in response:', ipId)
        console.log('[ABV.dev SDK] IP asset already registered on-chain by ABV.dev')
      } else {
        console.log('[ABV.dev SDK] ⚠️ No IP ID in response')
        console.log('[ABV.dev SDK] This is normal if Story Protocol registration is async')
        console.log('[ABV.dev SDK] 💡 Check ABV.dev dashboard for registered IP assets:')
        console.log('[ABV.dev SDK] 💡 1. Go to https://app.abv.dev')
        console.log('[ABV.dev SDK] 💡 2. Navigate to "Asset Registration"')
        console.log('[ABV.dev SDK] 💡 3. Check for registered IP assets')
        if (traceId) {
          console.log('[ABV.dev SDK] 💡 4. Or check trace:', `${baseUrl}/traces/${traceId}`)
        }
      }
      
      data = { 
        ip_id: ipId, 
        story_ip_id: ipId,
        trace_id: traceId, // Include trace ID for reference
      }
    } catch (sdkError: any) {
      console.log('[ABV.dev SDK] SDK call failed, using REST API fallback:', sdkError.message)
      console.log('[ABV.dev SDK] Error details:', {
        message: sdkError.message,
        stack: sdkError.stack,
        name: sdkError.name,
      })
      
      // Fallback to REST API
      const restResponse = await fetch(`${baseUrl}/gateway/chat/completions`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${apiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(requestBody),
      })

      if (!restResponse.ok) {
        const error = await restResponse.json().catch(() => ({ message: 'Unknown error' }))
        return NextResponse.json(
          { error: error.message || `ABV.dev API error: ${restResponse.statusText}` },
          { status: restResponse.status }
        )
      }

      // Check response headers for trace ID (ABV.dev might send it in headers)
      const responseHeaders: Record<string, string> = {}
      restResponse.headers.forEach((value, key) => {
        responseHeaders[key] = value
      })
      console.log('[ABV.dev REST] Response headers:', JSON.stringify(responseHeaders, null, 2))
      
      // Extract trace ID from headers
      const headerTraceId = responseHeaders['x-trace-id'] 
        || responseHeaders['X-Trace-ID'] 
        || responseHeaders['trace-id']
        || responseHeaders['x-abv-trace-id']
        || responseHeaders['X-ABV-Trace-ID']
      
      if (headerTraceId) {
        console.log('[ABV.dev REST] ✅ Trace ID found in response headers:', headerTraceId)
      }

      data = await restResponse.json()
      content = data.choices?.[0]?.message?.content
      
      // Include header trace ID in data if found
      if (headerTraceId && !data.trace_id && !data.traceId) {
        data.trace_id = headerTraceId
        console.log('[ABV.dev REST] Added trace ID from headers to response data')
      }
      
      // Extract IP ID from REST API response (if Story Protocol integration is enabled)
      console.log('[ABV.dev REST] Full response structure:', JSON.stringify(data, null, 2))
      console.log('[ABV.dev REST] Response keys:', Object.keys(data))
      
      // Deep search for trace ID in REST API response (including headers)
      const dataAny = data as any
      const restTraceIdFields = [
        headerTraceId, // From response headers (checked above)
        dataAny.trace_id,
        dataAny.traceId,
        dataAny.traceID,
        dataAny.observation_id,
        dataAny.observationId,
        dataAny._traceId,
        dataAny._trace_id,
        dataAny.headers?.['x-trace-id'],
        dataAny.headers?.['X-Trace-ID'],
        dataAny.metadata?.trace_id,
        dataAny.metadata?.traceId,
      ].filter(Boolean)
      
      console.log('[ABV.dev REST] Checking for trace ID in REST API response...')
      console.log('[ABV.dev REST] Header trace ID:', headerTraceId)
      console.log('[ABV.dev REST] Possible trace ID values found:', restTraceIdFields)
      
      // Check all possible IP ID fields
      const ipId = data.ip_id 
        || data.story_ip_id 
        || data.storyIpId 
        || data.ipId
        || data.storyProtocolIpId
        || data.story_protocol_ip_id
        || data.metadata?.ip_id
        || data.metadata?.story_ip_id
        || data.data?.ip_id
        || data.data?.story_ip_id
        || dataAny.headers?.['x-story-ip-id']
        || dataAny.headers?.['X-Story-IP-ID']
      
      const restTraceId = restTraceIdFields[0] || null
      
      if (ipId) {
        console.log('[ABV.dev REST] ✅ Story Protocol IP ID detected:', ipId)
        console.log('[ABV.dev REST] IP asset already registered on-chain by ABV.dev')
      } else {
        console.log('[ABV.dev REST] ⚠️ No IP ID in response')
        console.log('[ABV.dev REST] Checking response structure for IP ID...')
        console.log('[ABV.dev REST] data.ip_id:', data.ip_id)
        console.log('[ABV.dev REST] data.story_ip_id:', data.story_ip_id)
        console.log('[ABV.dev REST] data.metadata:', data.metadata)
        console.log('[ABV.dev REST] data.data:', data.data)
      }
      
      // Update data with IP ID and trace ID
      data.ip_id = ipId
      data.story_ip_id = ipId
      data.trace_id = restTraceId // Include trace ID from REST API response
      
      // Log trace ID if found
      if (restTraceId) {
        console.log('[ABV.dev REST] ✅ Trace ID found in REST API response:', restTraceId)
        console.log('[ABV.dev REST] 💡 Trace URL:', `${baseUrl}/traces/${restTraceId}`)
      } else {
        console.log('[ABV.dev REST] ⚠️ No trace ID found in REST API response')
        console.log('[ABV.dev REST] 💡 Check response headers or metadata for trace ID')
      }
    }

    if (!content) {
      return NextResponse.json({ error: 'No content returned from ABV.dev API' }, { status: 500 })
    }

    let svgData: { title: string; description: string; ip_signature: string; svg_code: string }
    
    try {
      svgData = JSON.parse(content)
    } catch (parseError) {
      const jsonMatch = content.match(/```(?:json)?\s*(\{[\s\S]*\})\s*```/) || content.match(/(\{[\s\S]*\})/)
      if (jsonMatch) {
        svgData = JSON.parse(jsonMatch[1])
      } else {
        return NextResponse.json({ error: 'Invalid JSON response from StorySeal-Engine' }, { status: 500 })
      }
    }

    if (!svgData.svg_code || !svgData.ip_signature) {
      return NextResponse.json({ error: 'Invalid SVG response: missing required fields' }, { status: 500 })
    }

    if (!svgData.svg_code.includes('<!-- SEAL-IP:')) {
      svgData.svg_code = svgData.svg_code.replace('<svg', `<!-- SEAL-IP:${svgData.ip_signature} -->\n<svg`)
    }

    const svgDataUrl = `data:image/svg+xml;base64,${Buffer.from(svgData.svg_code).toString('base64')}`

    // Extract IP ID (prioritize story_ip_id, then ip_id)
    // Check all possible locations in response
    let ipId = data.story_ip_id 
      || data.ip_id
      || data.storyIpId
      || data.ipId
      || (data as any).story_protocol_ip_id
      || (data as any).storyProtocolIpId
      || (data as any).metadata?.ip_id
      || (data as any).metadata?.story_ip_id
      || (data as any).headers?.['x-story-ip-id']
      || (data as any).headers?.['X-Story-IP-ID']
    
    // Extract trace ID first (before using it in logging)
    const traceId = (data as any).trace_id || (data as any).traceId

    // Normalize IP ID format (handle both ip://aeneid/0x... and 0x... formats)
    if (ipId) {
      // If IP ID is in format "ip://aeneid/0x...", extract just the address part
      if (ipId.startsWith('ip://')) {
        const match = ipId.match(/ip:\/\/[^/]+\/(0x[a-fA-F0-9]+)/)
        if (match) {
          ipId = match[1] // Extract just the address (0x...)
          console.log('[API Route] Normalized IP ID from ip:// format:', ipId)
        }
      }
      // Ensure IP ID starts with 0x
      if (!ipId.startsWith('0x')) {
        console.warn('[API Route] ⚠️ IP ID does not start with 0x:', ipId)
      }
    }
    
    console.log('[API Route] 🔍 Checking for IP ID in ABV.dev response...')
    console.log('[API Route] data.story_ip_id:', data.story_ip_id)
    console.log('[API Route] data.ip_id:', data.ip_id)
    console.log('[API Route] data.storyIpId:', (data as any).storyIpId)
    console.log('[API Route] data.metadata:', (data as any).metadata)
    console.log('[API Route] Full data keys:', Object.keys(data))
    console.log('[API Route] Extracted IP ID:', ipId)
    console.log('[API Route] Trace ID:', traceId)
    
    if (ipId) {
      console.log('[API Route] ✅✅✅ ABV.dev Story Protocol Integration ACTIVE! ✅✅✅')
      console.log('[API Route] ✅ IP ID found in ABV.dev response:', ipId)
      console.log('[API Route] ✅ IP asset already registered on-chain by ABV.dev')
      console.log('[API Route] ✅ No manual registration needed - using ABV.dev auto-registration')
      console.log('[API Route] 🎉 This meets the Bonus Challenge requirement!')
    } else {
      console.log('[API Route] ⚠️ No IP ID found in ABV.dev response')
      console.log('[API Route] ⚠️ This could mean:')
      console.log('[API Route]   1. Story Protocol integration not enabled in ABV.dev dashboard')
      console.log('[API Route]   2. IP registration is async (check ABV.dev dashboard later)')
      console.log('[API Route]   3. IP ID might be in trace/observation (check trace ID)')
      console.log('[API Route] 💡 To enable: Go to https://app.abv.dev → Settings → Connectors → Story Protocol')
      if (traceId) {
        console.log('[API Route] 💡 Trace ID:', traceId)
        console.log('[API Route] 💡 Check trace in ABV.dev dashboard for IP ID')
      }
    }

        // If no IP ID found but trace ID exists, try to poll for IP ID
        // According to ABV.dev docs: https://docs.abv.dev/developer/prompt-management/link-prompts-to-traces
        // IP ID might be in trace/observation metadata (async registration)
        let finalIpId = ipId
        
        if (!finalIpId && traceId) {
          console.log('[API Route] No IP ID in response, but trace ID found. Polling for IP ID...')
          console.log('[API Route] Trace ID:', traceId)
          console.log('[API Route] 💡 IP registration might be async - polling ABV.dev...')
          
          // Poll ABV.dev for IP ID (async registration might take a few seconds)
          const MAX_POLL_ATTEMPTS = 5
          const POLL_DELAY = 2000 // 2 seconds between polls
          
          for (let attempt = 1; attempt <= MAX_POLL_ATTEMPTS; attempt++) {
            try {
              await new Promise(resolve => setTimeout(resolve, POLL_DELAY))
              
              // Try to query trace/observation from ABV.dev
              // Note: This is a placeholder - actual endpoint might be different
              // ABV.dev might have /api/traces/{traceId} or /api/observations/{traceId}
              const traceResponse = await fetch(`${baseUrl}/api/traces/${traceId}`, {
                method: 'GET',
                headers: {
                  'Authorization': `Bearer ${apiKey}`,
                  'Content-Type': 'application/json',
                },
              }).catch(() => null)
              
              if (traceResponse?.ok) {
                const traceData = await traceResponse.json()
                const polledIpId = traceData.ip_id 
                  || traceData.story_ip_id
                  || traceData.metadata?.ip_id
                  || traceData.observation?.ip_id
                  || traceData.data?.ip_id
                
                if (polledIpId) {
                  finalIpId = polledIpId
                  console.log('[API Route] ✅ IP ID found via polling:', finalIpId)
                  break
                }
              }
              
              // Alternative: Try observations endpoint
              const obsResponse = await fetch(`${baseUrl}/api/observations/${traceId}`, {
                method: 'GET',
                headers: {
                  'Authorization': `Bearer ${apiKey}`,
                  'Content-Type': 'application/json',
                },
              }).catch(() => null)
              
              if (obsResponse?.ok) {
                const obsData = await obsResponse.json()
                const obsIpId = obsData.ip_id 
                  || obsData.story_ip_id
                  || obsData.metadata?.ip_id
                  || obsData.data?.ip_id
                
                if (obsIpId) {
                  finalIpId = obsIpId
                  console.log('[API Route] ✅ IP ID found via observations:', finalIpId)
                  break
                }
              }
              
              console.log(`[API Route] Poll attempt ${attempt}/${MAX_POLL_ATTEMPTS}: No IP ID found yet`)
            } catch (pollError: any) {
              console.warn(`[API Route] Poll attempt ${attempt} failed:`, pollError.message)
              // Continue polling
            }
          }
          
          if (!finalIpId) {
            console.log('[API Route] ⚠️ IP ID not found after polling')
            console.log('[API Route] 💡 IP registration might be async - check dashboard later')
            console.log('[API Route] 💡 Dashboard URL:', `${baseUrl}/traces/${traceId}`)
          }
        }

    return NextResponse.json({
      svgData,
      svgUrl: svgDataUrl,
      ipId: finalIpId, // Will be undefined if ABV.dev integration not enabled
      traceId: traceId, // Include trace ID for reference
      metadata: { 
        prompt, 
        provider, 
        model, 
        generatedAt: new Date().toISOString(),
        abvAutoRegistered: !!finalIpId, // Flag to indicate if ABV.dev auto-registered
        // Include debug info to help troubleshoot
        debugInfo: finalIpId ? {
          message: '✅ ABV.dev Story Protocol integration is ACTIVE!',
          ipId: finalIpId,
          source: 'abv-dev-auto-registration',
        } : {
          message: 'IP ID not found in ABV.dev response',
          checkedFields: ['story_ip_id', 'ip_id', 'storyIpId', 'metadata.ip_id', 'headers'],
          note: 'IP registration may be async. Check ABV.dev dashboard for registered IP assets.',
          traceId: traceId,
          dashboardUrl: traceId ? `https://app.abv.dev/traces/${traceId}` : 'https://app.abv.dev',
          connectorsUrl: 'https://app.abv.dev/connectors',
        }
      },
    })
  } catch (error: any) {
    console.error('ABV.dev API route error:', error)
    return NextResponse.json({ error: error.message || 'Failed to generate SVG' }, { status: 500 })
  }
}
