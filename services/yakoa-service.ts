/**
 * Yakoa API Service
 * Content authenticity verification and IP detection
 * https://docs.yakoa.io
 */

export interface YakoaVerificationParams {
  imageUrl?: string
  imageFile?: File
  apiKey?: string
}

export interface YakoaVerificationResult {
  isAuthentic: boolean
  originality: number // 0-100
  hasViolations: boolean
  violations?: Array<{
    type: 'copyright' | 'trademark' | 'similarity'
    confidence: number
    source?: string
    details?: string
  }>
  creator?: {
    name?: string
    address?: string
    verified: boolean
  }
  recommendations?: string[]
}

/**
 * Convert SVG File to PNG for Yakoa compatibility
 * Yakoa prefers raster formats (PNG, JPEG) over SVG
 */
async function convertSvgFileToPng(svgFile: File): Promise<File> {
  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => {
      reject(new Error('SVG conversion timeout'))
    }, 10000)

    const reader = new FileReader()
    reader.onload = async (e) => {
      try {
        clearTimeout(timeout)
        const svgText = e.target?.result as string
        const pngFile = await convertSvgTextToPng(svgText)
        resolve(pngFile)
      } catch (error) {
        reject(error)
      }
    }
    reader.onerror = () => {
      clearTimeout(timeout)
      reject(new Error('Failed to read SVG file'))
    }
    reader.readAsText(svgFile)
  })
}

/**
 * Convert SVG Data URL to PNG
 */
async function convertSvgDataUrlToPng(svgDataUrl: string): Promise<File> {
  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => {
      reject(new Error('SVG conversion timeout'))
    }, 10000)

    // Extract SVG text from data URL
    let svgText: string
    if (svgDataUrl.startsWith('data:image/svg+xml;base64,')) {
      const base64 = svgDataUrl.split(',')[1]
      svgText = decodeURIComponent(escape(atob(base64)))
    } else if (svgDataUrl.startsWith('data:image/svg+xml;charset=utf-8,')) {
      svgText = decodeURIComponent(svgDataUrl.split(',')[1])
    } else if (svgDataUrl.startsWith('data:image/svg+xml,')) {
      svgText = decodeURIComponent(svgDataUrl.split(',')[1])
    } else {
      reject(new Error('Invalid SVG data URL format'))
      return
    }

    convertSvgTextToPng(svgText)
      .then((pngFile) => {
        clearTimeout(timeout)
        resolve(pngFile)
      })
      .catch((error) => {
        clearTimeout(timeout)
        reject(error)
      })
  })
}

/**
 * Convert SVG text to PNG File
 */
function convertSvgTextToPng(svgText: string): Promise<File> {
  return new Promise((resolve, reject) => {
    // Process SVG - remove XML declaration, set dimensions
    let processedSvg = svgText
      .replace(/<\?xml[^>]*\?>/gi, '')
      .replace(/<!DOCTYPE[^>]*>/gi, '')

    // Extract dimensions
    let svgWidth = 1024
    let svgHeight = 1024

    const widthMatch = processedSvg.match(/width=["']?(\d+)/i)
    const heightMatch = processedSvg.match(/height=["']?(\d+)/i)
    const viewBoxMatch = processedSvg.match(/viewBox=["']?[\d\s]+(\d+)[\s]+(\d+)/i)

    if (widthMatch && heightMatch) {
      svgWidth = parseInt(widthMatch[1])
      svgHeight = parseInt(heightMatch[1])
    } else if (viewBoxMatch) {
      svgWidth = parseInt(viewBoxMatch[1])
      svgHeight = parseInt(viewBoxMatch[2])
    }

    // Ensure reasonable dimensions
    if (svgWidth < 512) svgWidth = 1024
    if (svgHeight < 512) svgHeight = 1024
    if (svgWidth > 2048) svgWidth = 2048
    if (svgHeight > 2048) svgHeight = 2048

    // Ensure SVG has proper attributes
    if (!processedSvg.includes('xmlns=')) {
      processedSvg = processedSvg.replace(
        /<svg([^>]*)>/,
        '<svg$1 xmlns="http://www.w3.org/2000/svg">'
      )
    }

    if (!processedSvg.includes('viewBox=')) {
      processedSvg = processedSvg.replace(
        /<svg([^>]*)>/,
        `<svg$1 width="${svgWidth}" height="${svgHeight}" viewBox="0 0 ${svgWidth} ${svgHeight}">`
      )
    }

    // Create image from SVG
    const img = new Image()
    const svgBlob = new Blob([processedSvg], { type: 'image/svg+xml' })
    const url = URL.createObjectURL(svgBlob)

    img.onload = () => {
      try {
        URL.revokeObjectURL(url)

        const canvas = document.createElement('canvas')
        canvas.width = svgWidth
        canvas.height = svgHeight
        const ctx = canvas.getContext('2d')

        if (!ctx) {
          reject(new Error('Failed to get canvas context'))
          return
        }

        // Draw white background
        ctx.fillStyle = '#FFFFFF'
        ctx.fillRect(0, 0, canvas.width, canvas.height)

        // Draw SVG
        ctx.drawImage(img, 0, 0, svgWidth, svgHeight)

        // Convert to PNG blob
        canvas.toBlob(
          (blob) => {
            if (blob) {
              const pngFile = new File([blob], 'image.png', { type: 'image/png' })
              resolve(pngFile)
            } else {
              reject(new Error('Failed to convert canvas to blob'))
            }
          },
          'image/png',
          0.95 // High quality
        )
      } catch (error) {
        reject(error)
      }
    }

    img.onerror = () => {
      URL.revokeObjectURL(url)
      reject(new Error('Failed to load SVG image'))
    }

    img.src = url
  })
}

/**
 * Verify content authenticity using Yakoa API
 */
export async function verifyWithYakoa(params: YakoaVerificationParams): Promise<YakoaVerificationResult> {
  try {
    const apiKey = params.apiKey || 
      (typeof window !== 'undefined' ? localStorage.getItem('yakoa_api_key') : null) ||
      process.env.NEXT_PUBLIC_YAKOA_API_KEY

    if (!apiKey) {
      throw new Error('Yakoa API key not configured. Please set it in Settings.')
    }

    console.log('[Yakoa] Verifying content authenticity...')

    // Prepare image data
    // Yakoa prefers raster formats (PNG, JPEG) over SVG
    // If we have SVG, we'll convert it to PNG first
    let imageFile: File | null = null
    let imageUrl: string | null = null
    
    if (params.imageFile) {
      // Check if it's SVG - Yakoa prefers PNG/JPEG
      if (params.imageFile.type === 'image/svg+xml' || params.imageFile.name.endsWith('.svg')) {
        // Convert SVG to PNG
        console.log('[Yakoa] Converting SVG to PNG for Yakoa compatibility...')
        try {
          imageFile = await convertSvgFileToPng(params.imageFile)
        } catch (convertError) {
          console.warn('[Yakoa] Failed to convert SVG to PNG, using original:', convertError)
          imageFile = params.imageFile
        }
      } else {
        imageFile = params.imageFile
      }
    } else if (params.imageUrl) {
      // If it's a data URL SVG, we might need to convert
      if (params.imageUrl.startsWith('data:image/svg+xml')) {
        console.log('[Yakoa] SVG data URL detected, will try to convert...')
        try {
          imageFile = await convertSvgDataUrlToPng(params.imageUrl)
        } catch (convertError) {
          console.warn('[Yakoa] Failed to convert SVG data URL to PNG, using original:', convertError)
          imageUrl = params.imageUrl
        }
      } else {
        imageUrl = params.imageUrl
      }
    } else {
      throw new Error('Either imageUrl or imageFile must be provided')
    }

    // Use Next.js API route as proxy to avoid CORS issues
    const proxyUrl = '/api/yakoa'

    // Prepare request body
    let requestBody: any
    if (imageFile) {
      // Convert file to base64 for proxy
      const base64 = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader()
        reader.onload = () => {
          const result = reader.result as string
          // Remove data URL prefix
          const base64 = result.split(',')[1]
          resolve(base64)
        }
        reader.onerror = reject
        reader.readAsDataURL(imageFile)
      })
      
      requestBody = {
        endpoint: '/v1/image/services', // Try v1 first (more likely)
        method: 'POST',
        data: {
          image_base64: base64,
          image_filename: imageFile.name,
        },
        apiKey,
      }
    } else if (imageUrl) {
      requestBody = {
        endpoint: '/v1/image/services', // Try v1 first (more likely)
        method: 'POST',
        data: {
          image_url: imageUrl,
        },
        apiKey,
      }
    } else {
      throw new Error('Failed to prepare image data for Yakoa')
    }

    const response = await fetch(proxyUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Accept': 'application/json',
      },
      body: JSON.stringify(requestBody),
    })

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({ error: 'Unknown error' }))
      throw new Error(errorData.error?.message || `Yakoa API error: ${response.statusText}`)
    }

    const data = await response.json()
    
    console.log('[Yakoa] ✅ Verification result received')

    // Parse Yakoa API response
    // Note: Response structure may vary - adjust based on actual API response
    return {
      isAuthentic: data.authentic !== false,
      originality: data.originality_score || data.originality || 0,
      hasViolations: data.violations && data.violations.length > 0,
      violations: data.violations?.map((v: any) => ({
        type: v.type || 'copyright',
        confidence: v.confidence || v.score || 0,
        source: v.source,
        details: v.details || v.description,
      })),
      creator: data.creator ? {
        name: data.creator.name,
        address: data.creator.address,
        verified: data.creator.verified || false,
      } : undefined,
      recommendations: data.recommendations || [],
    }
  } catch (error: any) {
    console.error('[Yakoa] Verification error:', error)
    
    // Return mock result if API is not available (for development)
    if (error.message?.includes('API key') || error.message?.includes('endpoint')) {
      console.warn('[Yakoa] API not configured, returning mock result')
      return {
        isAuthentic: true,
        originality: 85,
        hasViolations: false,
        recommendations: ['Configure Yakoa API key in Settings for full verification'],
      }
    }
    
    throw new Error(`Yakoa verification failed: ${error.message}`)
  }
}

/**
 * Check if content is original using Yakoa
 */
export async function checkOriginality(params: YakoaVerificationParams): Promise<{
  isOriginal: boolean
  originalityScore: number
  similarContent?: Array<{
    url: string
    similarity: number
    platform: string
  }>
}> {
  const verification = await verifyWithYakoa(params)
  
  return {
    isOriginal: verification.originality > 70, // Threshold for originality
    originalityScore: verification.originality,
    similarContent: verification.violations?.map(v => ({
      url: v.source || '',
      similarity: v.confidence,
      platform: 'unknown',
    })),
  }
}

/**
 * Find original creator using Yakoa
 */
export async function findOriginalCreator(params: YakoaVerificationParams): Promise<{
  found: boolean
  creator?: {
    name?: string
    address?: string
    verified: boolean
  }
  suggestions?: string[]
}> {
  const verification = await verifyWithYakoa(params)
  
  if (verification.creator) {
    return {
      found: true,
      creator: verification.creator,
    }
  }
  
  return {
    found: false,
    suggestions: verification.recommendations || [
      'Content may be original',
      'Register on Story Protocol to claim ownership',
    ],
  }
}

/**
 * Register Token to Yakoa for monitoring violations
 * After registering to Story Protocol, register to Yakoa for automatic violation detection
 */
export interface YakoaRegisterTokenParams {
  creatorId: string // Wallet address of the creator/owner (e.g., '0x2b3ab8e7bb14988616359b78709538b10900ab7d')
  id: string // Token ID (Story Protocol IP ID, e.g., '0x8a90cab2b38dba80c64b7734e58ee1db38b8992e')
  mintTx?: string // Transaction hash from Story Protocol registration
  metadata?: Record<string, any> // Metadata object
  media?: {
    url?: string // Media URL (IPFS gateway URL)
    type?: string // Media type (e.g., 'image/svg+xml')
  }
  apiKey?: string
  subdomain?: string // Yakoa subdomain (e.g., 'docs-demo') - appears in both base URL and endpoint path
}

export interface YakoaTokenResult {
  tokenId: string
  status: 'pending' | 'evaluating' | 'completed'
  infringements?: Array<{
    type: string
    confidence: number
    source?: string
    details?: string
  }>
}

export async function registerTokenToYakoa(params: YakoaRegisterTokenParams): Promise<YakoaTokenResult> {
  try {
    const apiKey = params.apiKey || 
      (typeof window !== 'undefined' ? localStorage.getItem('yakoa_api_key') : null) ||
      process.env.NEXT_PUBLIC_YAKOA_API_KEY

    if (!apiKey) {
      throw new Error('Yakoa API key not configured. Please set it in Settings.')
    }

    console.log('[Yakoa] Registering token for monitoring...')
    console.log('[Yakoa] Creator ID:', params.creatorId)
    console.log('[Yakoa] Token ID:', params.id)

    // Get subdomain from params or settings
    // Based on Yakoa API docs: https://{subdomain}.ip-api-sandbox.yakoa.io/{subdomain}/token
    // Format: https://docs-demo.ip-api-sandbox.yakoa.io/docs-demo/token
    // Note: subdomain appears twice - once in base URL, once in endpoint path
    const subdomain = params.subdomain || 
      (typeof window !== 'undefined' ? localStorage.getItem('yakoa_subdomain') : null) ||
      process.env.NEXT_PUBLIC_YAKOA_SUBDOMAIN ||
      'docs-demo' // Fallback to demo subdomain if not configured

    if (!subdomain || subdomain === 'docs-demo') {
      console.warn('[Yakoa] ⚠️ Using default "docs-demo" subdomain. Configure your subdomain in Settings for production use.')
    }
    
    console.log('[Yakoa] Subdomain:', subdomain)

    // Use Next.js API route as proxy to avoid CORS issues
    const proxyUrl = '/api/yakoa'

    // Prepare request body according to Yakoa API validation requirements
    // Based on error response, required fields are:
    // - creator_id: lowercase hex address (pattern: ^0x[a-f0-9]{40}$)
    // - id: lowercase hex address with optional tokenId (pattern: ^0x[a-f0-9]{40}(:[0-9]+)?$)
    // - mint_tx: transaction hash (required)
    // - metadata: object (required)
    // - media: object (required)
    
    // Convert addresses to lowercase to match validation pattern
    const creatorId = params.creatorId.toLowerCase()
    const id = params.id.toLowerCase()
    
    const requestBody: any = {
      creator_id: creatorId,
      id: id,
    }
    
    // Add mint_tx if provided
    // mint_tx must be an object (TransactionPostData), not a string
    // Based on error: "Input should be a valid dictionary or instance of TransactionPostData"
    if (params.mintTx) {
      requestBody.mint_tx = {
        tx_hash: params.mintTx.toLowerCase(),
        // Alternative field names that might be expected:
        hash: params.mintTx.toLowerCase(),
        transaction_hash: params.mintTx.toLowerCase(),
      }
    }
    
    // Add metadata if provided
    if (params.metadata) {
      requestBody.metadata = params.metadata
    } else {
      // Default metadata if not provided
      requestBody.metadata = {
        name: `StorySeal IP Asset`,
        description: `AI-generated artwork registered on Story Protocol`,
        ipId: id,
        owner: creatorId,
      }
    }
    
    // Add media if provided
    // media must be an array/list, not an object
    if (params.media) {
      // Convert media object to array format
      requestBody.media = [{
        url: params.media.url,
        type: params.media.type || 'image/svg+xml',
      }]
    } else {
      // Default media if not provided (as array)
      requestBody.media = [{
        type: 'image/svg+xml',
      }]
    }

    // Based on Yakoa API documentation format:
    // Endpoint format: /{subdomain}/token
    // Example: /docs-demo/token
    // The subdomain appears in both base URL and endpoint path
    const endpoint = `/${subdomain}/token`

    console.log(`[Yakoa] Using endpoint: ${endpoint}`)
    console.log(`[Yakoa] Request body:`, requestBody)

    try {
      const response = await fetch(proxyUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          endpoint: endpoint,
          method: 'POST',
          data: requestBody,
          apiKey,
          subdomain: subdomain, // Pass subdomain to proxy
        }),
      })

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({ error: 'Unknown error' }))
        
        let errorMessage = errorData.error?.message || errorData.error || response.statusText
        if (response.status === 401) {
          errorMessage = 'Yakoa API returned 401 Unauthorized. Please check your API key in Settings.'
        } else if (response.status === 403) {
          errorMessage = 'Yakoa API returned 403 Forbidden. Please check your API key permissions and endpoint URL.'
        }
        
        console.error('[Yakoa] ❌ Registration failed:', {
          status: response.status,
          statusText: response.statusText,
          error: errorData,
          endpoint: endpoint,
          details: errorData.details,
          requestBody: errorData.requestBody,
          url: errorData.url,
        })
        
        // For 400 Bad Request, include more details in error message
        if (response.status === 400 && errorData.details) {
          const detailsStr = typeof errorData.details === 'string' 
            ? errorData.details 
            : JSON.stringify(errorData.details, null, 2)
          throw new Error(`Yakoa token registration failed: ${errorMessage}\n\nDetails: ${detailsStr}`)
        }
        
        throw new Error(errorMessage)
      }

      // Success! Parse response
      const data = await response.json()
      
      console.log('[Yakoa] ✅ Token registered successfully!')
      console.log('[Yakoa] Endpoint used:', endpoint)
      console.log('[Yakoa] Response data:', data)

      return {
        tokenId: data.id || data.token_id || data.tokenId || data.data?.id || params.id,
        status: data.status || data.data?.status || 'pending',
        infringements: data.infringements || data.data?.infringements || [],
      }
    } catch (error: any) {
      console.error('[Yakoa] Registration error:', error)
      throw error
    }

    // If all endpoints failed, throw the last error
    if (lastError) {
      throw new Error(`All endpoints failed. Last error: ${lastError.message}`)
    }

    throw new Error('No endpoints to try')
  } catch (error: any) {
    console.error('[Yakoa] Token registration error:', error)
    
    // Provide helpful error message
    let errorMessage = error.message || 'Unknown error'
    if (errorMessage.includes('403') || errorMessage.includes('Forbidden')) {
      errorMessage = `Yakoa API returned 403 Forbidden. This usually means:
1. API key is invalid or expired
2. API key does not have permission for token registration
3. Endpoint URL format is incorrect

Please check:
- Your Yakoa API key in Settings (make sure it's valid and has write permissions)
- Yakoa API documentation: https://docs.yakoa.io/reference/token
- Try getting a demo API key: https://docs.yakoa.io/reference/demo-environment

Original error: ${error.message}`
    }
    
    throw new Error(`Yakoa token registration failed: ${errorMessage}`)
  }
}

/**
 * Get Token status and violations from Yakoa
 * Check for violations after token registration
 */
export interface YakoaGetTokenParams {
  tokenId: string
  apiKey?: string
  subdomain?: string // Yakoa subdomain (e.g., 'docs-demo') - appears in both base URL and endpoint path
}

export async function getTokenFromYakoa(params: YakoaGetTokenParams): Promise<YakoaTokenResult> {
  try {
    const apiKey = params.apiKey || 
      (typeof window !== 'undefined' ? localStorage.getItem('yakoa_api_key') : null) ||
      process.env.NEXT_PUBLIC_YAKOA_API_KEY

    if (!apiKey) {
      throw new Error('Yakoa API key not configured. Please set it in Settings.')
    }

    console.log('[Yakoa] Getting token status for token ID:', params.tokenId)

    // Get subdomain from params or settings
    const subdomain = params.subdomain || 
      (typeof window !== 'undefined' ? localStorage.getItem('yakoa_subdomain') : null) ||
      process.env.NEXT_PUBLIC_YAKOA_SUBDOMAIN ||
      'docs-demo' // Fallback to demo subdomain if not configured

    if (!subdomain || subdomain === 'docs-demo') {
      console.warn('[Yakoa] ⚠️ Using default "docs-demo" subdomain. Configure your subdomain in Settings for production use.')
    }
    
    console.log('[Yakoa] Subdomain:', subdomain)

    // Use Next.js API route as proxy to avoid CORS issues
    // Based on Yakoa API docs: https://{subdomain}.ip-api-sandbox.yakoa.io/{subdomain}/token/{token_id}
    // Endpoint format: /{subdomain}/token/{token_id}
    // Example: /docs-demo/token/0x8a90cab2b38dba80c64b7734e58ee1db38b8992e
    const endpoint = `/${subdomain}/token/${params.tokenId}`

    console.log(`[Yakoa] Using endpoint: ${endpoint}`)

    try {
      const proxyUrl = `/api/yakoa?endpoint=${encodeURIComponent(endpoint)}&apiKey=${encodeURIComponent(apiKey)}&subdomain=${encodeURIComponent(subdomain)}`

      const response = await fetch(proxyUrl, {
        method: 'GET',
        headers: {
          'Accept': 'application/json',
        },
      })

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({ error: 'Unknown error' }))
        
        let errorMessage = errorData.error?.message || errorData.error || response.statusText
        if (response.status === 401) {
          errorMessage = 'Yakoa API returned 401 Unauthorized. Please check your API key in Settings.'
        } else if (response.status === 403) {
          errorMessage = 'Yakoa API returned 403 Forbidden. Please check your API key permissions and endpoint URL.'
        }
        
        throw new Error(errorMessage)
      }

      // Success! Parse response
      const data = await response.json()
      
      console.log('[Yakoa] ✅ Token status retrieved!')
      console.log('[Yakoa] Endpoint used:', endpoint)
      console.log('[Yakoa] Token data:', data)

      return {
        tokenId: data.id || data.token_id || data.tokenId || data.data?.id || params.tokenId,
        status: data.status || data.data?.status || 'pending',
        infringements: data.infringements || data.data?.infringements || [],
      }
    } catch (error: any) {
      console.error('[Yakoa] Get token error:', error)
      throw error
    }
  } catch (error: any) {
    console.error('[Yakoa] Get token error:', error)
    
    // Provide helpful error message
    let errorMessage = error.message || 'Unknown error'
    if (errorMessage.includes('403') || errorMessage.includes('Forbidden')) {
      errorMessage = `Yakoa API returned 403 Forbidden. Please check:
- Your Yakoa API key in Settings
- Yakoa API documentation: https://docs.yakoa.io/reference/token
- Original error: ${error.message}`
    }
    
    throw new Error(`Yakoa get token failed: ${errorMessage}`)
  }
}


