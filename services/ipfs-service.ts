/**
 * IPFS Service for uploading metadata to IPFS
 * Uses Pinata (free tier available - https://pinata.cloud)
 */

// Request throttling untuk avoid rate limiting
class PinataThrottler {
  private lastRequestTime = 0
  private minDelay = 500 // 500ms between requests
  private queue: Array<() => Promise<any>> = []
  private processing = false

  async throttle(): Promise<void> {
    const now = Date.now()
    const timeSinceLastRequest = now - this.lastRequestTime
    if (timeSinceLastRequest < this.minDelay) {
      await new Promise(resolve => 
        setTimeout(resolve, this.minDelay - timeSinceLastRequest)
      )
    }
    this.lastRequestTime = Date.now()
  }

  async add<T>(fn: () => Promise<T>): Promise<T> {
    return new Promise((resolve, reject) => {
      this.queue.push(async () => {
        try {
          await this.throttle()
          const result = await fn()
          resolve(result)
        } catch (error) {
          reject(error)
        }
      })
      this.process()
    })
  }

  private async process() {
    if (this.processing || this.queue.length === 0) return
    this.processing = true

    while (this.queue.length > 0) {
      const fn = this.queue.shift()
      if (fn) await fn()
    }

    this.processing = false
  }
}

// Metadata cache untuk avoid duplicate requests
const metadataCache = new Map<string, { data: any, timestamp: number }>()
const CACHE_MAX_AGE = 60000 // 1 minute

async function getCachedMetadata(uri: string): Promise<any | null> {
  const cached = metadataCache.get(uri)
  if (cached && Date.now() - cached.timestamp < CACHE_MAX_AGE) {
    return cached.data
  }
  return null
}

function setCachedMetadata(uri: string, data: any): void {
  metadataCache.set(uri, { data, timestamp: Date.now() })
}

// Global throttler instance
const throttler = new PinataThrottler()

// Get Pinata credentials from environment
// Supports both JWT token and API Key + Secret Key
// Priority: API Key + Secret Key > JWT Token (because API Key is more common)
const getPinataCredentials = () => {
  if (typeof window !== 'undefined') {
    const apiKey = localStorage.getItem('pinata_api_key')
    const secretKey = localStorage.getItem('pinata_secret_key')
    const jwtToken = localStorage.getItem('pinata_jwt_token')
    
    // Priority 1: API Key + Secret Key (most common)
    if (apiKey && secretKey && apiKey.trim() !== '' && secretKey.trim() !== '') {
      return { type: 'apikey', apiKey: apiKey.trim(), secretKey: secretKey.trim() }
    }
    
    // Priority 2: JWT Token (if API Key not available)
    if (jwtToken && jwtToken.trim() !== '' && jwtToken !== 'your-pinata-jwt-token') {
      return { type: 'jwt', token: jwtToken.trim() }
    }
  }
  
  // Fallback to env variables
  const envApiKey = process.env.NEXT_PUBLIC_PINATA_API_KEY
  const envSecretKey = process.env.NEXT_PUBLIC_PINATA_SECRET_KEY
  const envJwt = process.env.NEXT_PUBLIC_PINATA_JWT_TOKEN
  
  // Priority 1: API Key + Secret Key
  if (envApiKey && envSecretKey && envApiKey.trim() !== '' && envSecretKey.trim() !== '') {
    return { type: 'apikey', apiKey: envApiKey.trim(), secretKey: envSecretKey.trim() }
  }
  
  // Priority 2: JWT Token
  if (envJwt && envJwt.trim() !== '' && envJwt !== 'your-pinata-jwt-token') {
    return { type: 'jwt', token: envJwt.trim() }
  }
  
  return null
}

/**
 * Upload file to IPFS using Pinata
 */
export async function uploadToIPFS(file: File | Blob, filename?: string): Promise<string> {
  const credentials = getPinataCredentials()
  
  console.log('[IPFS] Checking Pinata credentials...')
  console.log('[IPFS] Credentials type:', credentials?.type || 'none')
  
  if (!credentials) {
    // Check what's missing
    if (typeof window !== 'undefined') {
      const apiKey = localStorage.getItem('pinata_api_key')
      const secretKey = localStorage.getItem('pinata_secret_key')
      
      if (apiKey && !secretKey) {
        const errorMsg = 'Pinata Secret Key is missing! You have API Key but Secret Key is empty. Please set Pinata Secret Key in Settings page.'
        console.error('[IPFS]', errorMsg)
        throw new Error(errorMsg)
      }
      if (!apiKey && secretKey) {
        const errorMsg = 'Pinata API Key is missing! You have Secret Key but API Key is empty. Please set Pinata API Key in Settings page.'
        console.error('[IPFS]', errorMsg)
        throw new Error(errorMsg)
      }
    }
    
    const errorMsg = 'Pinata credentials not configured. Please set either:\n' +
      '1. JWT Token: NEXT_PUBLIC_PINATA_JWT_TOKEN in .env or Settings page, OR\n' +
      '2. API Key + Secret Key: NEXT_PUBLIC_PINATA_API_KEY and NEXT_PUBLIC_PINATA_SECRET_KEY\n' +
      'Get credentials from https://pinata.cloud'
    console.error('[IPFS]', errorMsg)
    throw new Error(errorMsg)
  }
  

  try {
    // Convert file/blob to FormData
    const formData = new FormData()
    const fileToUpload = file instanceof File 
      ? file 
      : new File([file], filename || 'file', { type: file.type || 'application/octet-stream' })
    
    formData.append('file', fileToUpload)
    
    // Pinata pinFileToIPFS options
    const metadata = JSON.stringify({
      name: fileToUpload.name || filename || 'file',
    })
    formData.append('pinataMetadata', metadata)
    
    const options = JSON.stringify({
      cidVersion: 0,
    })
    formData.append('pinataOptions', options)
    
    // Prepare headers based on credential type
    const headers: Record<string, string> = {}
    
    if (credentials.type === 'jwt') {
      headers['Authorization'] = `Bearer ${credentials.token || ''}`
    } else if (credentials.type === 'apikey') {
      headers['pinata_api_key'] = credentials.apiKey || ''
      headers['pinata_secret_api_key'] = credentials.secretKey || ''
    }
    
    // Use throttler untuk avoid rate limiting
    const response = await throttler.add(() => 
      fetch('https://api.pinata.cloud/pinning/pinFileToIPFS', {
        method: 'POST',
        headers,
        body: formData,
      })
    )
    
    if (!response.ok) {
      const errorData = await response.json().catch(() => ({ message: 'Unknown error' }))
      const errorMsg = errorData.error?.details || errorData.message || `Pinata API error: ${response.statusText}`
      console.error('[IPFS] Pinata API error:', errorData)
      throw new Error(errorMsg)
    }
    
    const data = await response.json()
    const cid = data.IpfsHash
    
    if (!cid) {
      throw new Error('No IPFS hash returned from Pinata')
    }
    
    // Return IPFS URL
    const ipfsUrl = `ipfs://${cid}`
    
    return ipfsUrl
  } catch (error: any) {
    console.error('[IPFS] Upload failed:', error)
    throw new Error(`Failed to upload to IPFS: ${error.message}`)
  }
}

/**
 * Upload text/JSON to IPFS
 */
export async function uploadTextToIPFS(content: string, filename: string = 'metadata.json'): Promise<string> {
  const blob = new Blob([content], { type: 'application/json' })
  return uploadToIPFS(blob, filename)
}

/**
 * Upload JSON object to IPFS
 * Following Story Protocol official docs: https://docs.story.foundation/developers/typescript-sdk/register-ip-asset
 */
export async function uploadJSONToIPFS(jsonMetadata: any): Promise<string> {
  const jsonString = JSON.stringify(jsonMetadata)
  const blob = new Blob([jsonString], { type: 'application/json' })
  const ipfsUrl = await uploadToIPFS(blob, 'metadata.json')
  // Extract IPFS hash from URL (ipfs://Qm... or https://gateway.pinata.cloud/ipfs/Qm...)
  const hash = ipfsUrl.replace('ipfs://', '').replace('https://gateway.pinata.cloud/ipfs/', '').replace('https://ipfs.io/ipfs/', '')
  return hash // Return just the hash (Qm...)
}

/**
 * Upload SVG string to IPFS
 */
export async function uploadSVGToIPFS(svgContent: string, filename: string = 'artwork.svg'): Promise<string> {
  const blob = new Blob([svgContent], { type: 'image/svg+xml' })
  return uploadToIPFS(blob, filename)
}

/**
 * Upload base64 data URI to IPFS
 */
export async function uploadDataURIToIPFS(dataUri: string, filename?: string): Promise<string> {
  // Extract mime type and base64 data
  const matches = dataUri.match(/^data:([^;]+);base64,(.+)$/)
  if (!matches) {
    throw new Error('Invalid data URI format')
  }
  
  const mimeType = matches[1]
  const base64Data = matches[2]
  
  // Convert base64 to blob
  const byteCharacters = atob(base64Data)
  const byteNumbers = new Array(byteCharacters.length)
  for (let i = 0; i < byteCharacters.length; i++) {
    byteNumbers[i] = byteCharacters.charCodeAt(i)
  }
  const byteArray = new Uint8Array(byteNumbers)
  
  // Determine file extension from mime type
  const ext = mimeType.includes('svg') ? 'svg' : mimeType.split('/')[1] || 'png'
  const finalFilename = filename || `file.${ext}`
  
  const blob = new Blob([byteArray], { type: mimeType })
  return uploadToIPFS(blob, finalFilename)
}

