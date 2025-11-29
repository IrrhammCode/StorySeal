/**
 * Reverse Image Search Service
 * Search for images online using reverse image search APIs
 * Supports multiple providers with FREE tiers (no scraping required)
 * 
 * Free API Options:
 * 1. SerpAPI - 100 free searches/month (https://serpapi.com)
 * 2. Serpdog - Free tier available (https://serpdog.io)
 * 3. Bing Visual Search API - Free tier via Azure (https://azure.microsoft.com)
 * 4. Google Custom Search API - Free tier (requires setup)
 */

export interface ReverseSearchResult {
  found: boolean
  totalMatches: number
  matches: Array<{
    url: string
    title?: string
    source?: string
    thumbnail?: string
    similarity?: number
  }>
  provider: string
}

export interface ReverseSearchParams {
  imageFile?: File
  imageUrl?: string
  provider?: 'serpapi' | 'serpdog' | 'bing' | 'google' | 'tineye' | 'auto'
}

/**
 * Convert image file to base64 data URL
 */
function fileToDataURL(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(reader.result as string)
    reader.onerror = reject
    reader.readAsDataURL(file)
  })
}

/**
 * Convert image to blob URL for upload
 */
async function imageToBlob(source: File | string): Promise<Blob> {
  if (source instanceof File) {
    return source
  }
  
  // Fetch image from URL
  const response = await fetch(source)
  if (!response.ok) {
    throw new Error(`Failed to fetch image: ${response.statusText}`)
  }
  return await response.blob()
}

/**
 * Reverse image search using SerpAPI (FREE: 100 searches/month)
 * https://serpapi.com/google-reverse-image
 * Legal API, no scraping required
 */
async function searchWithSerpAPI(imageBlob: Blob, apiKey?: string): Promise<ReverseSearchResult> {
  try {
    if (!apiKey) {
      // Check localStorage for API key
      const storedKey = typeof window !== 'undefined' 
        ? localStorage.getItem('serpapi_api_key') 
        : null
      
      if (!storedKey) {
        throw new Error('SerpAPI key is required. Get free API key from https://serpapi.com (100 free searches/month). Set it in Settings page.')
      }
      apiKey = storedKey
    }
    
    // Convert blob to base64
    const base64 = await new Promise<string>((resolve, reject) => {
      const reader = new FileReader()
      reader.onload = () => {
        const result = reader.result as string
        const base64 = result.split(',')[1]
        resolve(base64)
      }
      reader.onerror = reject
      reader.readAsDataURL(imageBlob)
    })
    
    // SerpAPI reverse image search endpoint
    const formData = new FormData()
    formData.append('image', imageBlob, 'image.jpg')
    
    // SerpAPI uses POST with image file
    const response = await fetch(`https://serpapi.com/search?engine=google_reverse_image&api_key=${apiKey}`, {
      method: 'POST',
      body: formData,
    })
    
    if (!response.ok) {
      const error = await response.json().catch(() => ({ error: response.statusText }))
      throw new Error(`SerpAPI error: ${error.error || response.statusText}`)
    }
    
    const data = await response.json()
    
    // Parse SerpAPI response
    const matches = (data.image_results || []).map((result: any) => ({
      url: result.link || result.url,
      title: result.title,
      source: 'Google Images (via SerpAPI)',
      thumbnail: result.thumbnail,
      similarity: result.similarity_score,
    }))
    
    return {
      found: matches.length > 0,
      totalMatches: matches.length,
      matches,
      provider: 'serpapi',
    }
  } catch (error: any) {
    console.error('[ReverseSearch] SerpAPI search error:', error)
    throw new Error(`SerpAPI search failed: ${error.message}`)
  }
}

/**
 * Reverse image search using Serpdog (FREE tier available)
 * https://serpdog.io
 * Legal API alternative to SerpAPI
 */
async function searchWithSerpdog(imageBlob: Blob, apiKey?: string): Promise<ReverseSearchResult> {
  try {
    if (!apiKey) {
      const storedKey = typeof window !== 'undefined' 
        ? localStorage.getItem('serpdog_api_key') 
        : null
      
      if (!storedKey) {
        throw new Error('Serpdog API key is required. Get free API key from https://serpdog.io. Set it in Settings page.')
      }
      apiKey = storedKey
    }
    
    // Convert blob to base64
    const base64 = await new Promise<string>((resolve, reject) => {
      const reader = new FileReader()
      reader.onload = () => {
        const result = reader.result as string
        const base64 = result.split(',')[1]
        resolve(base64)
      }
      reader.onerror = reject
      reader.readAsDataURL(imageBlob)
    })
    
    // Serpdog reverse image search
    const formData = new FormData()
    formData.append('image', imageBlob, 'image.jpg')
    
    const response = await fetch(`https://api.serpdog.io/reverse-image?api_key=${apiKey}`, {
      method: 'POST',
      body: formData,
    })
    
    if (!response.ok) {
      const error = await response.json().catch(() => ({ error: response.statusText }))
      throw new Error(`Serpdog API error: ${error.error || response.statusText}`)
    }
    
    const data = await response.json()
    
    const matches = (data.results || []).map((result: any) => ({
      url: result.url || result.link,
      title: result.title,
      source: 'Google Images (via Serpdog)',
      thumbnail: result.thumbnail,
      similarity: result.similarity,
    }))
    
    return {
      found: matches.length > 0,
      totalMatches: matches.length,
      matches,
      provider: 'serpdog',
    }
  } catch (error: any) {
    console.error('[ReverseSearch] Serpdog search error:', error)
    throw new Error(`Serpdog search failed: ${error.message}`)
  }
}

/**
 * Reverse image search using Bing Visual Search API (FREE tier via Azure)
 * https://azure.microsoft.com/en-us/services/cognitive-services/bing-visual-search/
 * Free tier: 3,000 transactions/month
 */
async function searchWithBing(imageBlob: Blob, apiKey?: string): Promise<ReverseSearchResult> {
  try {
    if (!apiKey) {
      const storedKey = typeof window !== 'undefined' 
        ? localStorage.getItem('bing_visual_search_api_key') 
        : null
      
      if (!storedKey) {
        throw new Error('Bing Visual Search API key is required. Get free API key from Azure (3,000 free transactions/month). Set it in Settings page.')
      }
      apiKey = storedKey
    }
    
    // Convert blob to base64
    const base64 = await new Promise<string>((resolve, reject) => {
      const reader = new FileReader()
      reader.onload = () => {
        const result = reader.result as string
        const base64 = result.split(',')[1]
        resolve(base64)
      }
      reader.onerror = reject
      reader.readAsDataURL(imageBlob)
    })
    
    // Bing Visual Search API
    const response = await fetch('https://api.bing.microsoft.com/v7.0/images/visualsearch', {
      method: 'POST',
      headers: {
        'Ocp-Apim-Subscription-Key': apiKey,
        'Content-Type': 'multipart/form-data',
      },
      body: imageBlob,
    })
    
    if (!response.ok) {
      const error = await response.json().catch(() => ({ error: response.statusText }))
      throw new Error(`Bing API error: ${error.error || response.statusText}`)
    }
    
    const data = await response.json()
    
    // Parse Bing Visual Search response
    const matches = (data.tags?.[0]?.actions?.[0]?.data?.value || []).map((result: any) => ({
      url: result.contentUrl || result.hostPageUrl,
      title: result.name,
      source: 'Bing Visual Search',
      thumbnail: result.thumbnailUrl,
      similarity: result.insightsMetadata?.pagesIncludingCount ? 
        Math.min(result.insightsMetadata.pagesIncludingCount / 100, 1) : undefined,
    }))
    
    return {
      found: matches.length > 0,
      totalMatches: matches.length,
      matches,
      provider: 'bing',
    }
  } catch (error: any) {
    console.error('[ReverseSearch] Bing search error:', error)
    throw new Error(`Bing search failed: ${error.message}`)
  }
}

/**
 * Reverse image search using TinEye API
 * Requires API key from https://tineye.com
 */
async function searchWithTinEye(imageBlob: Blob, apiKey?: string): Promise<ReverseSearchResult> {
  try {
    if (!apiKey) {
      // Check localStorage for API key
      const storedKey = typeof window !== 'undefined' 
        ? localStorage.getItem('tineye_api_key') 
        : null
      
      if (!storedKey) {
        throw new Error('TinEye API key is required. Set it in Settings page.')
      }
      apiKey = storedKey
    }
    
    // Convert blob to base64
    const base64 = await new Promise<string>((resolve, reject) => {
      const reader = new FileReader()
      reader.onload = () => {
        const result = reader.result as string
        const base64 = result.split(',')[1]
        resolve(base64)
      }
      reader.onerror = reject
      reader.readAsDataURL(imageBlob)
    })
    
    // TinEye API endpoint
    const response = await fetch('https://api.tineye.com/rest/search/', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        image: base64,
        api_key: apiKey,
      }),
    })
    
    if (!response.ok) {
      const error = await response.json().catch(() => ({ message: response.statusText }))
      throw new Error(`TinEye API error: ${error.message || response.statusText}`)
    }
    
    const data = await response.json()
    
    return {
      found: data.results && data.results.length > 0,
      totalMatches: data.results?.length || 0,
      matches: (data.results || []).map((result: any) => ({
        url: result.image_url || result.url,
        title: result.title,
        source: 'TinEye',
        thumbnail: result.thumbnail_url,
        similarity: result.score ? result.score / 100 : undefined,
      })),
      provider: 'tineye',
    }
  } catch (error: any) {
    console.error('[ReverseSearch] TinEye search error:', error)
    throw new Error(`TinEye search failed: ${error.message}`)
  }
}

/**
 * Reverse image search using Google Custom Search API
 * Requires API key and Custom Search Engine ID
 */
async function searchWithGoogle(imageBlob: Blob, apiKey?: string, searchEngineId?: string): Promise<ReverseSearchResult> {
  try {
    // Google Custom Search API for reverse image search
    // Note: This requires setup of Custom Search Engine with Image Search enabled
    
    if (!apiKey || !searchEngineId) {
      throw new Error('Google API key and Search Engine ID are required')
    }
    
    // Convert blob to base64
    const base64 = await new Promise<string>((resolve, reject) => {
      const reader = new FileReader()
      reader.onload = () => {
        const result = reader.result as string
        const base64 = result.split(',')[1]
        resolve(base64)
      }
      reader.onerror = reject
      reader.readAsDataURL(imageBlob)
    })
    
    // Google Custom Search API with image
    const response = await fetch(
      `https://www.googleapis.com/customsearch/v1?key=${apiKey}&cx=${searchEngineId}&searchType=image&imgSize=large`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          image: base64,
        }),
      }
    )
    
    if (!response.ok) {
      const error = await response.json().catch(() => ({ message: response.statusText }))
      throw new Error(`Google API error: ${error.message || response.statusText}`)
    }
    
    const data = await response.json()
    
    return {
      found: data.items && data.items.length > 0,
      totalMatches: data.items?.length || 0,
      matches: (data.items || []).map((item: any) => ({
        url: item.link,
        title: item.title,
        source: 'Google Images',
        thumbnail: item.image?.thumbnailLink,
      })),
      provider: 'google',
    }
  } catch (error: any) {
    console.error('[ReverseSearch] Google search error:', error)
    throw new Error(`Google search failed: ${error.message}`)
  }
}

/**
 * Main reverse image search function
 * Auto-selects best available provider with free tier
 * Uses API route proxy to avoid CORS issues
 */
export async function reverseImageSearch(params: ReverseSearchParams): Promise<ReverseSearchResult> {
  try {
    if (!params.imageFile && !params.imageUrl) {
      throw new Error('Either imageFile or imageUrl must be provided')
    }
    
    // If we're in browser and have imageUrl, use API route to avoid CORS
    const shouldUseApiRoute = typeof window !== 'undefined' && params.imageUrl && !params.imageFile
    console.log('[ReverseSearch] Check API route:', { 
      isBrowser: typeof window !== 'undefined',
      hasImageUrl: !!params.imageUrl,
      hasImageFile: !!params.imageFile,
      shouldUseApiRoute 
    })
    
    if (shouldUseApiRoute) {
      // Select provider
      let provider = params.provider || 'auto'
      let apiKey: string | null = null
      
      // Auto-select provider based on available API keys
      if (provider === 'auto') {
        // Check available API keys in order of preference
        if (localStorage.getItem('serpapi_api_key')) {
          provider = 'serpapi'
          apiKey = localStorage.getItem('serpapi_api_key')
        } else if (localStorage.getItem('serpdog_api_key')) {
          provider = 'serpdog'
          apiKey = localStorage.getItem('serpdog_api_key')
        } else if (localStorage.getItem('bing_visual_search_api_key')) {
          provider = 'bing'
          apiKey = localStorage.getItem('bing_visual_search_api_key')
        } else if (localStorage.getItem('google_api_key') && localStorage.getItem('google_search_engine_id')) {
          provider = 'google'
          apiKey = localStorage.getItem('google_api_key')
        } else {
          throw new Error('No API key found. Please set up at least one reverse image search API key in Settings:\n' +
            '- SerpAPI (100 free searches/month): https://serpapi.com\n' +
            '- Serpdog (free tier): https://serpdog.io\n' +
            '- Bing Visual Search (3,000 free/month): Azure Portal\n' +
            '- Google Custom Search (100 free/day): Google Cloud Console')
        }
      } else {
        // Get API key for selected provider
        switch (provider) {
          case 'serpapi':
            apiKey = localStorage.getItem('serpapi_api_key')
            break
          case 'serpdog':
            apiKey = localStorage.getItem('serpdog_api_key')
            break
          case 'bing':
            apiKey = localStorage.getItem('bing_visual_search_api_key')
            break
          case 'google':
            apiKey = localStorage.getItem('google_api_key')
            break
        }
      }

      if (!apiKey && provider !== 'google') {
        throw new Error(`${provider} API key is required. Set it in Settings page.`)
      }

      // Use API route proxy to avoid CORS
      console.log('[ReverseSearch] Using API route proxy for:', { provider, hasApiKey: !!apiKey, imageUrl: params.imageUrl?.substring(0, 50) })
      
      try {
        const response = await fetch('/api/reverse-image-search', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            imageUrl: params.imageUrl,
            provider: provider,
            apiKey: apiKey,
          }),
        })

        if (!response.ok) {
          const errorData = await response.json().catch(() => ({ error: response.statusText }))
          console.error('[ReverseSearch] API route error response:', errorData)
          throw new Error(errorData.error || `API route error: ${response.statusText}`)
        }

        const result = await response.json()
        console.log('[ReverseSearch] API route success:', { found: result.found, totalMatches: result.totalMatches })
        return result as ReverseSearchResult
      } catch (apiError: any) {
        console.error('[ReverseSearch] API route failed:', apiError)
        // Don't fallback to direct call - it will fail with CORS
        // Instead, throw the error so user knows what went wrong
        throw new Error(`Reverse image search failed: ${apiError.message || 'Unknown error'}. Please check your API key and try again.`)
      }
    }
    
    // Fallback: Direct call (ONLY for imageFile or server-side, NEVER for imageUrl in browser)
    // If we're in browser with imageUrl, we should have used API route above
    if (typeof window !== 'undefined' && params.imageUrl && !params.imageFile) {
      // This should not happen - we should have used API route above
      throw new Error('Internal error: Should use API route for imageUrl in browser. Please report this issue.')
    }
    
    const imageBlob = params.imageFile 
      ? await imageToBlob(params.imageFile)
      : await imageToBlob(params.imageUrl!)
    
    // Select provider
    let provider = params.provider || 'auto'
    
    // Auto-select provider based on available API keys
    if (provider === 'auto') {
      if (typeof window !== 'undefined') {
        // Check available API keys in order of preference
        if (localStorage.getItem('serpapi_api_key')) {
          provider = 'serpapi'
        } else if (localStorage.getItem('serpdog_api_key')) {
          provider = 'serpdog'
        } else if (localStorage.getItem('bing_visual_search_api_key')) {
          provider = 'bing'
        } else if (localStorage.getItem('google_api_key') && localStorage.getItem('google_search_engine_id')) {
          provider = 'google'
        } else {
          throw new Error('No API key found. Please set up at least one reverse image search API key in Settings:\n' +
            '- SerpAPI (100 free searches/month): https://serpapi.com\n' +
            '- Serpdog (free tier): https://serpdog.io\n' +
            '- Bing Visual Search (3,000 free/month): Azure Portal\n' +
            '- Google Custom Search (100 free/day): Google Cloud Console')
        }
      } else {
        throw new Error('Auto provider selection requires browser environment')
      }
    }
    
    // Direct call - only for imageFile or server-side
    console.log('[ReverseSearch] Using direct call (imageFile or server-side):', { provider })
    
    switch (provider) {
      case 'serpapi':
        return await searchWithSerpAPI(imageBlob)
      
      case 'serpdog':
        return await searchWithSerpdog(imageBlob)
      
      case 'bing':
        return await searchWithBing(imageBlob)
      
      case 'google':
        // Google requires API key and Search Engine ID
        const googleApiKey = typeof window !== 'undefined'
          ? localStorage.getItem('google_api_key')
          : null
        const searchEngineId = typeof window !== 'undefined'
          ? localStorage.getItem('google_search_engine_id')
          : null
        
        if (!googleApiKey || !searchEngineId) {
          throw new Error('Google API key and Search Engine ID are required. Set them in Settings page.')
        }
        
        return await searchWithGoogle(imageBlob, googleApiKey, searchEngineId)
      
      case 'tineye':
        return await searchWithTinEye(imageBlob)
      
      default:
        throw new Error(`Unknown provider: ${provider}`)
    }
  } catch (error: any) {
    console.error('[ReverseSearch] Search error:', error)
    throw error
  }
}

/**
 * Find image usage across the web
 * Wrapper function that tries multiple providers (with free tiers)
 */
export async function findImageUsage(params: ReverseSearchParams): Promise<ReverseSearchResult[]> {
  const results: ReverseSearchResult[] = []
  
  // Try multiple providers in order of preference (free tiers first)
  const providers: Array<'serpapi' | 'serpdog' | 'bing' | 'google' | 'tineye'> = 
    ['serpapi', 'serpdog', 'bing', 'google']
  
  for (const provider of providers) {
    try {
      // Check if API key exists for this provider
      if (typeof window !== 'undefined') {
        let hasKey = false
        switch (provider) {
          case 'serpapi':
            hasKey = !!localStorage.getItem('serpapi_api_key')
            break
          case 'serpdog':
            hasKey = !!localStorage.getItem('serpdog_api_key')
            break
          case 'bing':
            hasKey = !!localStorage.getItem('bing_visual_search_api_key')
            break
          case 'google':
            hasKey = !!(localStorage.getItem('google_api_key') && localStorage.getItem('google_search_engine_id'))
            break
        }
        
        if (!hasKey) {
          console.log(`[ReverseSearch] Skipping ${provider} - no API key found`)
          continue
        }
      }
      
      const result = await reverseImageSearch({
        ...params,
        provider,
      })
      results.push(result)
      
      // If we found results, we can stop (optional - or continue to get more results)
      if (result.found && result.totalMatches > 0) {
        console.log(`[ReverseSearch] Found ${result.totalMatches} matches with ${provider}`)
      }
    } catch (error) {
      console.warn(`[ReverseSearch] Provider ${provider} failed:`, error)
      // Continue with other providers
    }
  }
  
  return results
}
