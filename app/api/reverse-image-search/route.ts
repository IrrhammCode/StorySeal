import { NextRequest, NextResponse } from 'next/server'
import { validateUrl } from '@/lib/validation'

/**
 * API Route untuk proxy reverse image search
 * Menghindari CORS issue dengan melakukan request dari server-side
 */
export async function POST(request: NextRequest) {
  try {
    console.log('[ReverseImageSearch API] Received request')
    const body = await request.json()
    const { imageUrl, provider = 'auto', apiKey } = body

    console.log('[ReverseImageSearch API] Request params:', { 
      hasImageUrl: !!imageUrl, 
      provider, 
      hasApiKey: !!apiKey,
      imageUrlPreview: imageUrl?.substring(0, 50)
    })

    if (!imageUrl) {
      return NextResponse.json(
        { error: 'imageUrl is required' },
        { status: 400 }
      )
    }

    // SSRF Protection: Validate URL before fetching
    // Only allow data URLs or validated HTTP/HTTPS URLs
    if (!imageUrl.startsWith('data:')) {
      const urlValidation = validateUrl(imageUrl)
      if (!urlValidation.valid) {
        console.error('[ReverseImageSearch API] Invalid URL:', urlValidation.error)
        return NextResponse.json(
          { error: urlValidation.error || 'Invalid URL' },
          { status: 400 }
        )
      }
    }

    // Fetch image from URL (handle both http URLs and data URLs)
    console.log('[ReverseImageSearch API] Fetching image from URL...')
    let imageBlob: Blob
    
    if (imageUrl.startsWith('data:')) {
      // Handle data URL (safe - no network request)
      console.log('[ReverseImageSearch API] Processing data URL...')
      const response = await fetch(imageUrl)
      imageBlob = await response.blob()
    } else {
      // Handle regular URL (validated above)
      // Add timeout to prevent hanging requests
      const controller = new AbortController()
      const timeoutId = setTimeout(() => controller.abort(), 10000) // 10s timeout
      
      try {
        const imageResponse = await fetch(imageUrl, {
          signal: controller.signal,
          headers: {
            'User-Agent': 'StorySeal/1.0',
          },
        })
        clearTimeout(timeoutId)
        
        if (!imageResponse.ok) {
          console.error('[ReverseImageSearch API] Failed to fetch image:', imageResponse.statusText)
          return NextResponse.json(
            { error: `Failed to fetch image: ${imageResponse.statusText}` },
            { status: 400 }
          )
        }
        
        // Validate content type
        const contentType = imageResponse.headers.get('content-type')
        if (!contentType || !contentType.startsWith('image/')) {
          console.error('[ReverseImageSearch API] Invalid content type:', contentType)
          return NextResponse.json(
            { error: 'URL does not point to an image' },
            { status: 400 }
          )
        }
        
        // Limit image size (10MB max)
        const contentLength = imageResponse.headers.get('content-length')
        if (contentLength && parseInt(contentLength) > 10 * 1024 * 1024) {
          return NextResponse.json(
            { error: 'Image size exceeds 10MB limit' },
            { status: 400 }
          )
        }
        
        imageBlob = await imageResponse.blob()
        
        // Double-check blob size
        if (imageBlob.size > 10 * 1024 * 1024) {
          return NextResponse.json(
            { error: 'Image size exceeds 10MB limit' },
            { status: 400 }
          )
        }
      } catch (fetchError: any) {
        clearTimeout(timeoutId)
        if (fetchError.name === 'AbortError') {
          return NextResponse.json(
            { error: 'Request timeout - image fetch took too long' },
            { status: 408 }
          )
        }
        throw fetchError
      }
    }
    
    console.log('[ReverseImageSearch API] Image fetched, size:', imageBlob.size, 'type:', imageBlob.type)

    // Determine provider
    let selectedProvider = provider
    if (provider === 'auto') {
      // Auto-select based on available API keys
      // For now, we'll use the provided apiKey or try SerpAPI first
      selectedProvider = 'serpapi'
    }

    // Call appropriate provider
    switch (selectedProvider) {
      case 'serpapi': {
        if (!apiKey) {
          return NextResponse.json(
            { error: 'SerpAPI key is required' },
            { status: 400 }
          )
        }

        // SerpAPI reverse image search
        // According to SerpAPI documentation: https://serpapi.com/google-reverse-image
        // SerpAPI uses GET request with image_url parameter (public URL)
        // For data URLs, we can try using them directly, but SerpAPI might not support data URLs
        // If data URL doesn't work, we might need to upload to temporary hosting first
        
        console.log('[ReverseImageSearch API] Calling SerpAPI with image_url parameter...', { 
          imageUrlType: imageUrl.startsWith('data:') ? 'data URL' : 'public URL',
          imageUrlPreview: imageUrl.substring(0, 80),
          apiKeyPreview: apiKey?.substring(0, 10) + '...'
        })
        
        // SerpAPI endpoint for reverse image search
        // Use GET request with image_url parameter
        const serpapiUrl = new URL('https://serpapi.com/search')
        serpapiUrl.searchParams.append('engine', 'google_reverse_image')
        serpapiUrl.searchParams.append('api_key', apiKey)
        serpapiUrl.searchParams.append('image_url', imageUrl) // Use image_url parameter
        
        console.log('[ReverseImageSearch API] SerpAPI URL (truncated):', 
          serpapiUrl.toString().replace(apiKey, '***').substring(0, 150) + '...')
        
        const serpapiResponse = await fetch(serpapiUrl.toString(), {
          method: 'GET', // SerpAPI uses GET for image_url parameter
        })

        console.log('[ReverseImageSearch API] SerpAPI response status:', serpapiResponse.status)
        console.log('[ReverseImageSearch API] SerpAPI response headers:', Object.fromEntries(serpapiResponse.headers.entries()))

        if (!serpapiResponse.ok) {
          const errorText = await serpapiResponse.text()
          console.error('[ReverseImageSearch API] SerpAPI error response:', {
            status: serpapiResponse.status,
            statusText: serpapiResponse.statusText,
            errorText: errorText.substring(0, 500)
          })
          
          // Try to parse as JSON if possible
          let errorMessage = `SerpAPI error: ${serpapiResponse.statusText}`
          try {
            const errorJson = JSON.parse(errorText)
            errorMessage = errorJson.error || errorJson.message || errorMessage
          } catch {
            errorMessage = errorText ? `${errorMessage} - ${errorText.substring(0, 200)}` : errorMessage
          }
          
          return NextResponse.json(
            { error: errorMessage },
            { status: serpapiResponse.status }
          )
        }

        const data = await serpapiResponse.json()
        console.log('[ReverseImageSearch API] SerpAPI success, matches:', data.image_results?.length || 0)

        // Parse SerpAPI response
        const matches = (data.image_results || []).map((result: any) => ({
          url: result.link || result.url,
          title: result.title,
          source: 'Google Images (via SerpAPI)',
          thumbnail: result.thumbnail,
          similarity: result.similarity_score,
        }))

        return NextResponse.json({
          found: matches.length > 0,
          totalMatches: matches.length,
          matches,
          provider: 'serpapi',
        })
      }

      case 'serpdog': {
        if (!apiKey) {
          return NextResponse.json(
            { error: 'Serpdog API key is required' },
            { status: 400 }
          )
        }

        const formData = new FormData()
        formData.append('image', imageBlob, 'image.jpg')

        const serpdogResponse = await fetch(
          `https://api.serpdog.io/reverse-image?api_key=${apiKey}`,
          {
            method: 'POST',
            body: formData,
          }
        )

        if (!serpdogResponse.ok) {
          const errorText = await serpdogResponse.text()
          console.error('[ReverseImageSearch API] Serpdog error:', errorText)
          return NextResponse.json(
            { error: `Serpdog error: ${serpdogResponse.statusText}` },
            { status: serpdogResponse.status }
          )
        }

        const data = await serpdogResponse.json()

        const matches = (data.results || []).map((result: any) => ({
          url: result.url || result.link,
          title: result.title,
          source: 'Google Images (via Serpdog)',
          thumbnail: result.thumbnail,
          similarity: result.similarity,
        }))

        return NextResponse.json({
          found: matches.length > 0,
          totalMatches: matches.length,
          matches,
          provider: 'serpdog',
        })
      }

      case 'bing': {
        if (!apiKey) {
          return NextResponse.json(
            { error: 'Bing Visual Search API key is required' },
            { status: 400 }
          )
        }

        const bingResponse = await fetch(
          'https://api.bing.microsoft.com/v7.0/images/visualsearch',
          {
            method: 'POST',
            headers: {
              'Ocp-Apim-Subscription-Key': apiKey,
              'Content-Type': 'multipart/form-data',
            },
            body: imageBlob,
          }
        )

        if (!bingResponse.ok) {
          const errorText = await bingResponse.text()
          console.error('[ReverseImageSearch API] Bing error:', errorText)
          return NextResponse.json(
            { error: `Bing API error: ${bingResponse.statusText}` },
            { status: bingResponse.status }
          )
        }

        const data = await bingResponse.json()

        const matches = (data.tags?.[0]?.actions?.[0]?.data?.value || []).map(
          (result: any) => ({
            url: result.contentUrl || result.hostPageUrl,
            title: result.name,
            source: 'Bing Visual Search',
            thumbnail: result.thumbnailUrl,
            similarity: result.insightsMetadata?.pagesIncludingCount
              ? Math.min(result.insightsMetadata.pagesIncludingCount / 100, 1)
              : undefined,
          })
        )

        return NextResponse.json({
          found: matches.length > 0,
          totalMatches: matches.length,
          matches,
          provider: 'bing',
        })
      }

      default:
        return NextResponse.json(
          { error: `Unsupported provider: ${selectedProvider}` },
          { status: 400 }
        )
    }
  } catch (error: any) {
    console.error('[ReverseImageSearch API] Error:', error)
    return NextResponse.json(
      { error: error.message || 'Failed to perform reverse image search' },
      { status: 500 }
    )
  }
}

