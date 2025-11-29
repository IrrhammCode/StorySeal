/**
 * Extract IP ID from SVG comment (for SVG files)
 */
export async function extractWatermarkFromSVG(svgFile: File): Promise<string | null> {
  try {
    const svgText = await svgFile.text()
    const sealMatch = svgText.match(/<!-- SEAL-IP:([^>]+) -->/)
    if (sealMatch) {
      const sealId = sealMatch[1]
      // Return the signature, but note it's not an IP ID yet
      // This will be replaced with actual IP ID after registration
      return sealId
    }
    return null
  } catch (error) {
    console.error('[Watermark] Error extracting from SVG:', error)
    return null
  }
}

/**
 * Extract IP ID from watermark in image using LSB steganography
 */
export async function extractWatermarkFromImage(imageFile: File): Promise<string | null> {
  try {
    // For SVG files, try to extract from comment first
    if (imageFile.type === 'image/svg+xml' || imageFile.name.endsWith('.svg')) {
      const svgWatermark = await extractWatermarkFromSVG(imageFile)
      if (svgWatermark) {
        // If it's a SEAL signature, we can't verify it on-chain yet
        // But we return it so verify page can show that watermark exists
        return svgWatermark
      }
    }
    
    // Create image element
    const img = new Image()
    const imageUrl = URL.createObjectURL(imageFile)
    
    return new Promise((resolve) => {
      img.onload = () => {
        // Create canvas
        const canvas = document.createElement('canvas')
        const ctx = canvas.getContext('2d')
        if (!ctx) {
          URL.revokeObjectURL(imageUrl)
          console.error('[Watermark Extract] Failed to get canvas context')
          resolve(null)
          return
        }
        
        canvas.width = img.width
        canvas.height = img.height
        ctx.drawImage(img, 0, 0)
        
        // Get image data
        const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height)
        const pixels = imageData.data
        
        // Extract LSB from pixels
        const binaryData: number[] = []
        let bitIndex = 0
        
        // Read length first (32 bits = 4 bytes)
        let length = 0
        for (let i = 0; i < 32; i++) {
          const pixelIndex = Math.floor(i / 4)
          const channelIndex = i % 4
          if (pixelIndex * 4 + channelIndex < pixels.length) {
            const bit = pixels[pixelIndex * 4 + channelIndex] & 1
            length |= (bit << (31 - i))
          }
        }
        
        // Check if length is valid (reasonable size)
        // IP ID is 42 characters = 42 bytes = 336 bits, plus null terminator = 8 bits = 344 bits total
        // So valid range should be around 40-400 bits
        if (length <= 0 || length > 1000) {
          URL.revokeObjectURL(imageUrl)
          resolve(null)
          return
        }
        
        // Extract the actual data
        // NOTE: length is already in BITS, not bytes, so we don't multiply by 8
        for (let i = 32; i < 32 + length; i++) {
          const pixelIndex = Math.floor(i / 4)
          const channelIndex = i % 4
          if (pixelIndex * 4 + channelIndex < pixels.length) {
            const bit = pixels[pixelIndex * 4 + channelIndex] & 1
            binaryData.push(bit)
          }
        }
        
        // Convert binary to string
        let extractedString = ''
        const charCodes: number[] = []
        for (let i = 0; i < binaryData.length; i += 8) {
          let charCode = 0
          for (let j = 0; j < 8 && i + j < binaryData.length; j++) {
            charCode |= (binaryData[i + j] << (7 - j))
          }
          if (charCode === 0) break // Null terminator
          charCodes.push(charCode)
          extractedString += String.fromCharCode(charCode)
        }
        
        URL.revokeObjectURL(imageUrl)
        
        // Try to clean up the string - remove any non-printable characters at the start
        let cleanedString = extractedString.trim()
        
        // If it doesn't start with 0x, try to find it in the string
        if (!cleanedString.startsWith('0x')) {
          const indexOf0x = cleanedString.indexOf('0x')
          if (indexOf0x !== -1) {
            cleanedString = cleanedString.substring(indexOf0x)
          } else {
            // Try to find just 'x' followed by hex
            const indexOfX = cleanedString.indexOf('x')
            if (indexOfX > 0 && cleanedString[indexOfX - 1] === '0') {
              cleanedString = cleanedString.substring(indexOfX - 1)
            }
          }
        }
        
        // Validate extracted string (should be a valid IP ID format)
        if (cleanedString.startsWith('0x') && cleanedString.length >= 42) {
          // Check if it's a valid hex string
          const hexPart = cleanedString.substring(2)
          if (/^[0-9a-fA-F]{40,}$/.test(hexPart)) {
            // Take only first 42 characters (0x + 40 hex chars)
            const validIpId = cleanedString.substring(0, 42)
            resolve(validIpId)
          } else {
            resolve(null)
          }
        } else {
          resolve(null)
        }
      }
      
      img.onerror = () => {
        URL.revokeObjectURL(imageUrl)
        resolve(null)
      }
      
      img.src = imageUrl
    })
  } catch (error) {
    console.error('Error extracting watermark:', error)
    return null
  }
}

/**
 * Embed watermark (IP ID) into image using LSB steganography
 */
export async function embedWatermarkInImage(
  imageFile: File,
  ipId: string
): Promise<File> {
  try {
    // Validate IP ID format
    if (!ipId.startsWith('0x') || ipId.length < 42) {
      console.error('[Watermark Embed] ❌ Invalid IP ID format:', {
        ipId,
        length: ipId.length,
        expectedFormat: '0x followed by 40 hex characters (42 total)'
      })
      throw new Error(`Invalid IP ID format. Expected format: 0x followed by 40 hex characters (42 total), got: ${ipId.length} characters`)
    }
    
    // Create image element
    const img = new Image()
    const imageUrl = URL.createObjectURL(imageFile)
    
    return new Promise((resolve, reject) => {
      img.onload = () => {
        // Create canvas
        const canvas = document.createElement('canvas')
        const ctx = canvas.getContext('2d')
        if (!ctx) {
          URL.revokeObjectURL(imageUrl)
          reject(new Error('Failed to get canvas context'))
          return
        }
        
        canvas.width = img.width
        canvas.height = img.height
        ctx.drawImage(img, 0, 0)
        
        // Get image data
        const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height)
        const pixels = imageData.data
        
        // Convert IP ID to binary
        const dataToEmbed = ipId
        const binaryData: number[] = []
        
        // Convert string to binary
        for (let i = 0; i < dataToEmbed.length; i++) {
          const charCode = dataToEmbed.charCodeAt(i)
          for (let j = 7; j >= 0; j--) {
            binaryData.push((charCode >> j) & 1)
          }
        }
        
        // Add null terminator
        for (let j = 7; j >= 0; j--) {
          binaryData.push(0)
        }
        
        const dataLength = binaryData.length
        
        // Check if image is large enough
        const requiredPixels = Math.ceil((32 + dataLength) / 4) // 32 bits for length + data
        if (pixels.length / 4 < requiredPixels) {
          URL.revokeObjectURL(imageUrl)
          reject(new Error('Image too small to embed watermark'))
          return
        }
        
        // Embed length first (32 bits)
        for (let i = 0; i < 32; i++) {
          const pixelIndex = Math.floor(i / 4)
          const channelIndex = i % 4
          const bit = (dataLength >> (31 - i)) & 1
          
          // Clear LSB and set new bit
          pixels[pixelIndex * 4 + channelIndex] = 
            (pixels[pixelIndex * 4 + channelIndex] & 0xFE) | bit
        }
        
        // Embed the actual data
        for (let i = 0; i < dataLength; i++) {
          const bitIndex = 32 + i
          const pixelIndex = Math.floor(bitIndex / 4)
          const channelIndex = bitIndex % 4
          const bit = binaryData[i]
          
          // Clear LSB and set new bit
          pixels[pixelIndex * 4 + channelIndex] = 
            (pixels[pixelIndex * 4 + channelIndex] & 0xFE) | bit
        }
        
        // Put image data back
        ctx.putImageData(imageData, 0, 0)
        
        // Convert canvas to blob
        canvas.toBlob((blob) => {
          URL.revokeObjectURL(imageUrl)
          if (!blob) {
            reject(new Error('Failed to create blob'))
            return
          }
          
          // Create new file with same name
          const watermarkedFile = new File([blob], imageFile.name, {
            type: imageFile.type || 'image/png',
          })
          
          // CRITICAL: Verify watermark was embedded correctly
          // Use Promise to handle async verification
          extractWatermarkFromImage(watermarkedFile)
            .then((extractedIpId) => {
              if (!extractedIpId) {
                console.error('[Watermark Embed] ❌ Verification failed: No watermark found in embedded image')
                reject(new Error('Watermark verification failed: No watermark detected in the embedded image. Please try again.'))
                return
              }
              
              // Normalize IP IDs for comparison (lowercase, exact length)
              const normalizedEmbedded = ipId.toLowerCase().substring(0, 42)
              const normalizedExtracted = extractedIpId.toLowerCase().substring(0, 42)
              
              if (normalizedEmbedded !== normalizedExtracted) {
                console.error('[Watermark Embed] ❌ Verification failed: IP ID mismatch', {
                  embedded: normalizedEmbedded,
                  extracted: normalizedExtracted,
                  match: normalizedEmbedded === normalizedExtracted
                })
                reject(new Error(`Watermark verification failed: Embedded IP ID (${normalizedEmbedded}) does not match extracted IP ID (${normalizedExtracted}). The watermark may be corrupted.`))
                return
              }
              
              console.log('[Watermark Embed] ✅ Verification successful! Watermark correctly embedded:', {
                ipId: normalizedEmbedded,
                verified: true
              })
              
              resolve(watermarkedFile)
            })
            .catch((verifyError: any) => {
              console.error('[Watermark Embed] ❌ Verification error:', verifyError)
              reject(new Error(`Watermark verification failed: ${verifyError.message || 'Unknown error'}`))
            })
        }, imageFile.type || 'image/png')
      }
      
      img.onerror = () => {
        URL.revokeObjectURL(imageUrl)
        reject(new Error('Failed to load image'))
      }
      
      img.src = imageUrl
    })
  } catch (error) {
    console.error('Error embedding watermark:', error)
    throw error
  }
}

/**
 * Check if image has watermark
 */
export async function hasWatermark(imageFile: File): Promise<boolean> {
  const ipId = await extractWatermarkFromImage(imageFile)
  return ipId !== null
}

