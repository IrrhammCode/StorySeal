import { NextRequest, NextResponse } from 'next/server'
import { ABVClient } from "@abvdev/client"

// CRITICAL: Initialize OpenTelemetry EXACTLY like test script
// Test script does this at top-level, but Next.js routes need it in function
// We'll do it at the very start of the function, before anything else

export async function POST(request: NextRequest) {
  // CRITICAL: OpenTelemetry should be initialized by instrumentation.ts (via Next.js instrumentationHook)
  // This matches test script: import "./instrumentation.js" at top-level
  // instrumentation.ts runs automatically when Next.js starts (100% like test script)
  const apiKey = process.env.NEXT_PUBLIC_ABV_API_KEY || process.env.ABV_API_KEY || "sk-abv-50241875-3de1-4e0c-bef5-738ab5adb845";
  const baseUrl = process.env.NEXT_PUBLIC_ABV_API_URL || process.env.ABV_API_URL || "https://app.abv.dev";

  // Wait like test script does (500ms delay)
  // OpenTelemetry should already be initialized by instrumentation.ts
  console.log('[Test Tracing Route] Waiting 500ms for OpenTelemetry SDK to initialize...');
  await new Promise(resolve => setTimeout(resolve, 500));
  console.log('[Test Tracing Route] ✅ OpenTelemetry should be ready (from instrumentation.ts)\n');

  try {
    const body = await request.json()
    const { prompt } = body

    console.log('[Test Tracing Route] Received request:', { prompt: prompt?.substring(0, 50) + '...' })

    if (!prompt) {
      return NextResponse.json({ error: 'Prompt is required' }, { status: 400 })
    }

    // Initialize ABVClient (exactly like test script)
    const abv = new ABVClient({
      apiKey: apiKey,
      baseUrl: baseUrl,
      region: "us"
    })

    console.log('[Test Tracing Route] ✅ ABVClient initialized')
    console.log('[Test Tracing Route] 💡 Gateway calls will be automatically traced by OpenTelemetry\n')

    // CRITICAL: Use EXACTLY same request as test script
    console.log('[Test Tracing Route] Making gateway call (should be automatically traced)...');
    console.log('[Test Tracing Route] Prompt:', prompt);
    
    const response = await abv.gateway.chat.completions.create({
      provider: "openai",
      model: "gpt-4o-mini",
      messages: [
        { role: "user", content: prompt }
      ]
    });

    const content = response.choices[0].message.content;
    console.log('[Test Tracing Route] ✅ Response received!');
    console.log('[Test Tracing Route] Response:', content.substring(0, 100) + '...');

    return NextResponse.json({
      success: true,
      content: content,
      message: 'Test completed - check ABV.dev dashboard for trace'
    })

  } catch (error: any) {
    console.error('[Test Tracing Route] Error:', error)
    return NextResponse.json(
      { error: error.message || 'Failed to test tracing' },
      { status: 500 }
    )
  }
}

