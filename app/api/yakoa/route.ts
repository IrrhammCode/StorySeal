/**
 * Yakoa API Proxy Route
 * Proxies requests to Yakoa API to avoid CORS issues
 */

import { NextRequest, NextResponse } from 'next/server'

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const { endpoint, method = 'POST', data, apiKey, subdomain } = body

    if (!endpoint) {
      return NextResponse.json(
        { error: 'Endpoint is required' },
        { status: 400 }
      )
    }

    if (!apiKey) {
      return NextResponse.json(
        { error: 'API key is required' },
        { status: 401 }
      )
    }

    // Construct full URL based on Yakoa API documentation format:
    // https://{subdomain}.ip-api-sandbox.yakoa.io/{network}/token
    let apiUrl: string
    if (endpoint.startsWith('http')) {
      apiUrl = endpoint
    } else {
      // Use subdomain if provided, otherwise try default
      const useSubdomain = subdomain || 'docs-demo' // Fallback to docs-demo if not provided
      
      // Base URL format: https://{subdomain}.ip-api-sandbox.yakoa.io
      // Example: https://docs-demo.ip-api-sandbox.yakoa.io
      const baseUrl = `https://${useSubdomain}.ip-api-sandbox.yakoa.io`
      
      // Endpoint should already include subdomain (e.g., /docs-demo/token)
      // If not, construct it
      let fullEndpoint = endpoint
      if (!endpoint.includes(useSubdomain) && !endpoint.startsWith('/v')) {
        // If endpoint is like '/token', make it '/{subdomain}/token'
        fullEndpoint = `/${useSubdomain}${endpoint.startsWith('/') ? endpoint : `/${endpoint}`}`
      } else {
        fullEndpoint = endpoint.startsWith('/') ? endpoint : `/${endpoint}`
      }
      
      apiUrl = `${baseUrl}${fullEndpoint}`
      
      console.log('[Yakoa Proxy] Subdomain:', useSubdomain)
      console.log('[Yakoa Proxy] Base URL:', baseUrl)
      console.log('[Yakoa Proxy] Endpoint:', endpoint)
      console.log('[Yakoa Proxy] Full endpoint:', fullEndpoint)
      console.log('[Yakoa Proxy] Full URL:', apiUrl)
    }

    console.log('[Yakoa Proxy] Proxying request to:', apiUrl)
    console.log('[Yakoa Proxy] Method:', method)
    console.log('[Yakoa Proxy] Received data:', JSON.stringify(data, null, 2))

    // Handle FormData for image uploads
    let requestBody: BodyInit | undefined
    let contentType = 'application/json'
    
    if (data?.image_base64) {
      // Convert base64 to FormData for Yakoa image upload
      const formData = new FormData()
      // Convert base64 to blob
      const byteCharacters = atob(data.image_base64)
      const byteNumbers = new Array(byteCharacters.length)
      for (let i = 0; i < byteCharacters.length; i++) {
        byteNumbers[i] = byteCharacters.charCodeAt(i)
      }
      const byteArray = new Uint8Array(byteNumbers)
      const blob = new Blob([byteArray], { type: 'image/png' })
      const file = new File([blob], data.image_filename || 'image.png', { type: 'image/png' })
      formData.append('image', file)
      requestBody = formData
      contentType = '' // Let browser set Content-Type with boundary for FormData
    } else if (data?.image_url) {
      // For image_url, use FormData
      const formData = new FormData()
      formData.append('image_url', data.image_url)
      requestBody = formData
      contentType = '' // Let browser set Content-Type with boundary for FormData
    } else if (data) {
      // For other data, use JSON
      requestBody = JSON.stringify(data)
    }

    // Yakoa API uses X-API-KEY header (not Bearer token)
    // Based on docs: headers: { 'X-API-KEY': 'your-api-key' }
    const headers: HeadersInit = {
      'X-API-KEY': apiKey,
      'Accept': 'application/json',
    }
    
    if (contentType) {
      headers['Content-Type'] = contentType
    }

    console.log('[Yakoa Proxy] Request URL:', apiUrl)
    console.log('[Yakoa Proxy] Request headers:', { ...headers, 'X-API-KEY': headers['X-API-KEY'] ? '***' : undefined })
    console.log('[Yakoa Proxy] Request body type:', typeof requestBody)
    if (requestBody instanceof FormData) {
      console.log('[Yakoa Proxy] Request body: FormData')
      // Log FormData entries
      if (typeof FormData !== 'undefined') {
        const entries: string[] = []
        for (const [key, value] of requestBody.entries()) {
          if (value instanceof File) {
            entries.push(`${key}: File(${value.name}, ${value.size} bytes)`)
          } else {
            entries.push(`${key}: ${String(value).substring(0, 100)}`)
          }
        }
        console.log('[Yakoa Proxy] FormData entries:', entries)
      }
    } else if (typeof requestBody === 'string') {
      console.log('[Yakoa Proxy] Request body (full):', requestBody)
      try {
        const parsed = JSON.parse(requestBody)
        console.log('[Yakoa Proxy] Request body (parsed):', parsed)
      } catch (e) {
        console.log('[Yakoa Proxy] Request body (not JSON):', requestBody.substring(0, 500))
      }
    }

    const response = await fetch(apiUrl, {
      method,
      headers,
      body: requestBody,
    })

    // Get response text first to see raw response
    const responseText = await response.text()
    let responseData: any
    try {
      responseData = JSON.parse(responseText)
    } catch {
      responseData = {
        error: 'Failed to parse response',
        rawResponse: responseText.substring(0, 500),
        status: response.status,
        statusText: response.statusText,
      }
    }

    if (!response.ok) {
      console.error('[Yakoa Proxy] ❌ Error response:', {
        status: response.status,
        statusText: response.statusText,
        url: apiUrl,
        endpoint: endpoint,
        error: responseData,
        rawResponse: responseText,
        responseHeaders: Object.fromEntries(response.headers.entries()),
        requestBody: typeof requestBody === 'string' ? requestBody : 'FormData',
      })
      
      // Provide more helpful error message
      let errorMessage = responseData.error?.message || responseData.error || response.statusText
      if (response.status === 403) {
        errorMessage = 'Yakoa API returned 403 Forbidden. This usually means:\n' +
          '1. API key is invalid or expired\n' +
          '2. API key does not have permission for this endpoint\n' +
          '3. Endpoint URL is incorrect\n\n' +
          `Endpoint: ${endpoint}\n` +
          `Error: ${errorMessage}`
      } else if (response.status === 401) {
        errorMessage = 'Yakoa API returned 401 Unauthorized. Please check your API key in Settings.'
      } else if (response.status === 400) {
        // For 400 Bad Request, include more details
        const errorDetails = responseData.error || responseData.message || responseData
        errorMessage = `Yakoa API returned 400 Bad Request.\n\n` +
          `Error details: ${JSON.stringify(errorDetails, null, 2)}\n\n` +
          `Request body sent: ${typeof requestBody === 'string' ? requestBody : 'FormData'}\n` +
          `Endpoint: ${endpoint}\n` +
          `URL: ${apiUrl}\n\n` +
          `Please check:\n` +
          `1. Request body format matches Yakoa API documentation\n` +
          `2. Required fields are present (creator_id, id)\n` +
          `3. Field names are correct (snake_case, not camelCase)`
      }
      
      return NextResponse.json(
        {
          error: errorMessage,
          details: responseData,
          requestBody: typeof requestBody === 'string' ? JSON.parse(requestBody) : 'FormData',
          endpoint: endpoint,
          url: apiUrl,
          endpoint: endpoint,
          status: response.status,
        },
        { status: response.status }
      )
    }

    console.log('[Yakoa Proxy] ✅ Success')
    return NextResponse.json(responseData)
  } catch (error: any) {
    console.error('[Yakoa Proxy] Error:', error)
    return NextResponse.json(
      { error: error.message || 'Internal server error' },
      { status: 500 }
    )
  }
}

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const endpoint = searchParams.get('endpoint')
    const apiKey = searchParams.get('apiKey')
    const subdomain = searchParams.get('subdomain')

    if (!endpoint) {
      return NextResponse.json(
        { error: 'Endpoint is required' },
        { status: 400 }
      )
    }

    if (!apiKey) {
      return NextResponse.json(
        { error: 'API key is required' },
        { status: 401 }
      )
    }

    // Construct full URL based on Yakoa API documentation format
    let apiUrl: string
    if (endpoint.startsWith('http')) {
      apiUrl = endpoint
    } else {
      const useSubdomain = subdomain || 'docs-demo'
      
      // Base URL format: https://{subdomain}.ip-api-sandbox.yakoa.io
      const baseUrl = `https://${useSubdomain}.ip-api-sandbox.yakoa.io`
      apiUrl = `${baseUrl}${endpoint.startsWith('/') ? endpoint : `/${endpoint}`}`
      
      console.log('[Yakoa Proxy] Subdomain:', useSubdomain)
      console.log('[Yakoa Proxy] Base URL:', baseUrl)
      console.log('[Yakoa Proxy] Endpoint:', endpoint)
      console.log('[Yakoa Proxy] Full URL:', apiUrl)
    }

    console.log('[Yakoa Proxy] Proxying GET request to:', apiUrl)

    // Forward request to Yakoa API
    // Yakoa uses X-API-KEY header (not Bearer token)
    const response = await fetch(apiUrl, {
      method: 'GET',
      headers: {
        'X-API-KEY': apiKey,
        'Accept': 'application/json',
      },
    })

    const responseData = await response.json().catch(() => ({
      error: 'Failed to parse response',
      status: response.status,
      statusText: response.statusText,
    }))

    if (!response.ok) {
      console.error('[Yakoa Proxy] Error response:', responseData)
      return NextResponse.json(
        responseData,
        { status: response.status }
      )
    }

    console.log('[Yakoa Proxy] ✅ Success')
    return NextResponse.json(responseData)
  } catch (error: any) {
    console.error('[Yakoa Proxy] Error:', error)
    return NextResponse.json(
      { error: error.message || 'Internal server error' },
      { status: 500 }
    )
  }
}

