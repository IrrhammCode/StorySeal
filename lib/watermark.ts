/**
 * Extract IP ID from watermark in image using LSB steganography
 */
export async function extractWatermarkFromImage(imageFile: File): Promise<string | null> {
  try {
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
        if (length <= 0 || length > 1000) {
          URL.revokeObjectURL(imageUrl)
          resolve(null)
          return
        }
        
        // Extract the actual data
        for (let i = 32; i < 32 + length * 8; i++) {
          const pixelIndex = Math.floor(i / 4)
          const channelIndex = i % 4
          if (pixelIndex * 4 + channelIndex < pixels.length) {
            const bit = pixels[pixelIndex * 4 + channelIndex] & 1
            binaryData.push(bit)
          }
        }
        
        // Convert binary to string
        let extractedString = ''
        for (let i = 0; i < binaryData.length; i += 8) {
          let charCode = 0
          for (let j = 0; j < 8 && i + j < binaryData.length; j++) {
            charCode |= (binaryData[i + j] << (7 - j))
          }
          if (charCode === 0) break // Null terminator
          extractedString += String.fromCharCode(charCode)
        }
        
        URL.revokeObjectURL(imageUrl)
        
        // Validate extracted string (should be a valid IP ID format)
        if (extractedString.startsWith('0x') && extractedString.length >= 42) {
          resolve(extractedString)
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
          resolve(watermarkedFile)
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

