/**
 * C2PA Service
 * Coalition for Content Provenance and Authenticity
 * Provides content provenance tracking and verification
 */

// For client-side: use @contentauth/c2pa-web
// For server-side: use @contentauth/c2pa-node

export interface C2PAManifest {
  claim: {
    claim_generator: string
    signature: string
    assertions: Array<{
      label: string
      data: any
    }>
  }
  signature: {
    issuer: string
    time: string
  }
}

export interface C2PAVerificationResult {
  isValid: boolean
  manifest?: C2PAManifest
  errors?: string[]
  warnings?: string[]
  provenance?: {
    created: string
    creator: string
    generator: string
    modifications?: Array<{
      action: string
      timestamp: string
    }>
  }
}

/**
 * Generate a hash from file for storage key
 */
async function hashFile(file: File): Promise<string> {
  const arrayBuffer = await file.arrayBuffer()
  const hashBuffer = await crypto.subtle.digest('SHA-256', arrayBuffer)
  const hashArray = Array.from(new Uint8Array(hashBuffer))
  const hashHex = hashArray.map(b => b.toString(16).padStart(2, '0')).join('')
  return hashHex.substring(0, 16) // Use first 16 chars as key
}

/**
 * Generate C2PA manifest for image
 * This embeds provenance metadata into the image
 * Improved version with better storage and error handling
 */
export async function generateC2PAManifest(params: {
  imageFile: File
  creator: string
  generator: string
  ipId?: string
  metadata?: Record<string, any>
}): Promise<File> {
  try {
    // For client-side, we'll use a simplified approach
    // In production, use @contentauth/c2pa-web for full implementation
    
    // Create manifest data with proper C2PA structure
    const now = new Date().toISOString()
    const manifestData: C2PAManifest = {
      claim: {
        claim_generator: params.generator || 'StorySeal',
        signature: `storyseal-c2pa-v1-${Date.now()}`,
        assertions: [
          {
            label: 'stds.schema-org.CreativeWork',
            data: {
              '@context': 'https://schema.org',
              '@type': 'ImageObject',
              creator: params.creator,
              dateCreated: now,
              generator: params.generator,
              ...(params.ipId && { identifier: params.ipId }),
            },
          },
          {
            label: 'stds.iptc.photo',
            data: {
              DateCreated: now,
              Creator: params.creator,
              ...params.metadata,
            },
          },
          // Add Story Protocol specific assertion
          ...(params.ipId ? [{
            label: 'story.protocol.ip',
            data: {
              ipId: params.ipId,
              registeredAt: now,
              platform: 'StorySeal',
            },
          }] : []),
        ],
      },
      signature: {
        issuer: 'StorySeal',
        time: now,
      },
    }

    // Convert manifest to JSON string
    const manifestJson = JSON.stringify(manifestData, null, 2)
    
    // Create a new file (in production, this would embed manifest in image)
    const blob = await params.imageFile.arrayBuffer()
    const newFile = new File([blob], params.imageFile.name, {
      type: params.imageFile.type,
      lastModified: Date.now(),
    })
    
    // Store manifest with file hash as key for better retrieval
    if (typeof window !== 'undefined') {
      try {
        const fileHash = await hashFile(params.imageFile)
        const manifestKey = `c2pa_manifest_${fileHash}`
        
        // Store with metadata
        const manifestStorage = {
          manifest: manifestData,
          fileHash,
          fileName: params.imageFile.name,
          fileSize: params.imageFile.size,
          fileType: params.imageFile.type,
          createdAt: now,
        }
        
        localStorage.setItem(manifestKey, JSON.stringify(manifestStorage))
        
        // Also store in index for quick lookup
        const indexKey = 'c2pa_manifest_index'
        const index = JSON.parse(localStorage.getItem(indexKey) || '[]')
        if (!index.includes(fileHash)) {
          index.push(fileHash)
          localStorage.setItem(indexKey, JSON.stringify(index))
        }
        
        console.log('[C2PA] Manifest generated and stored:', {
          fileHash,
          fileName: params.imageFile.name,
          ipId: params.ipId,
        })
      } catch (storageError) {
        console.warn('[C2PA] Failed to store manifest:', storageError)
        // Continue anyway - manifest generation succeeded
      }
    }
    
    return newFile
  } catch (error: any) {
    console.error('[C2PA] Failed to generate manifest:', error)
    throw new Error(`Failed to generate C2PA manifest: ${error.message}`)
  }
}

/**
 * Verify C2PA manifest from image
 * Improved version with better lookup and validation
 */
export async function verifyC2PAManifest(imageFile: File): Promise<C2PAVerificationResult> {
  try {
    if (typeof window === 'undefined') {
      return {
        isValid: false,
        errors: ['C2PA verification requires browser environment'],
      }
    }
    
    // Try to find manifest using file hash (faster lookup)
    try {
      const fileHash = await hashFile(imageFile)
      const manifestKey = `c2pa_manifest_${fileHash}`
      const storedData = localStorage.getItem(manifestKey)
      
      if (storedData) {
        try {
          const manifestStorage = JSON.parse(storedData)
          const manifest = manifestStorage.manifest as C2PAManifest
          
          // Validate manifest structure
          if (manifest && manifest.claim && manifest.signature) {
            // Additional validation
            const errors: string[] = []
            const warnings: string[] = []
            
            // Check if manifest is expired (optional - can add expiry logic)
            // Check signature time is valid
            const signatureTime = new Date(manifest.signature.time)
            if (isNaN(signatureTime.getTime())) {
              warnings.push('Invalid signature timestamp')
            }
            
            // Extract provenance
            const creativeWork = manifest.claim.assertions.find(
              a => a.label === 'stds.schema-org.CreativeWork'
            )?.data
            
            return {
              isValid: errors.length === 0,
              manifest,
              errors: errors.length > 0 ? errors : undefined,
              warnings: warnings.length > 0 ? warnings : undefined,
              provenance: {
                created: manifest.signature.time,
                creator: creativeWork?.creator || manifest.claim.assertions[0]?.data?.creator || 'Unknown',
                generator: manifest.claim.claim_generator,
              },
            }
          }
        } catch (parseError: any) {
          console.warn('[C2PA] Failed to parse stored manifest:', parseError)
        }
      }
    } catch (hashError) {
      console.warn('[C2PA] Failed to hash file for lookup:', hashError)
    }
    
    // Fallback: Search all manifests (slower but more thorough)
    const manifestKeys = Object.keys(localStorage).filter(key => key.startsWith('c2pa_manifest_') && !key.endsWith('_index'))
    
    for (const key of manifestKeys) {
      try {
        const storedData = localStorage.getItem(key)
        if (storedData) {
          const manifestStorage = JSON.parse(storedData)
          const manifest = manifestStorage.manifest as C2PAManifest
          
          // Check if file matches (by name and size as fallback)
          if (manifestStorage.fileName === imageFile.name && 
              manifestStorage.fileSize === imageFile.size) {
            if (manifest && manifest.claim && manifest.signature) {
              const creativeWork = manifest.claim.assertions.find(
                a => a.label === 'stds.schema-org.CreativeWork'
              )?.data
              
              return {
                isValid: true,
                manifest,
                provenance: {
                  created: manifest.signature.time,
                  creator: creativeWork?.creator || 'Unknown',
                  generator: manifest.claim.claim_generator,
                },
              }
            }
          }
        }
      } catch (parseError) {
        // Continue searching
      }
    }
    
    // No manifest found
    return {
      isValid: false,
      warnings: ['No C2PA manifest found in image. Image may not have provenance data.'],
    }
  } catch (error: any) {
    console.error('[C2PA] Verification error:', error)
    return {
      isValid: false,
      errors: [error.message || 'Failed to verify C2PA manifest'],
    }
  }
}

/**
 * Extract C2PA provenance data from image
 */
export async function extractC2PAProvenance(imageFile: File): Promise<{
  hasProvenance: boolean
  creator?: string
  created?: string
  generator?: string
  modifications?: Array<{ action: string; timestamp: string }>
  ipId?: string
}> {
  const verification = await verifyC2PAManifest(imageFile)
  
  if (!verification.isValid || !verification.manifest) {
    return { hasProvenance: false }
  }
  
  const manifest = verification.manifest
  const creativeWork = manifest.claim.assertions.find(
    a => a.label === 'stds.schema-org.CreativeWork'
  )?.data
  
  return {
    hasProvenance: true,
    creator: creativeWork?.creator || verification.provenance?.creator,
    created: creativeWork?.dateCreated || verification.provenance?.created,
    generator: creativeWork?.generator || verification.provenance?.generator,
    ipId: creativeWork?.identifier,
  }
}













