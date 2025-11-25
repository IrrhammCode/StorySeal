/**
 * Image Similarity Detection
 * AI-powered detection untuk find similar images even without watermark
 */

export interface SimilarityResult {
  score: number // 0-1, higher = more similar
  isSimilar: boolean
  confidence: 'high' | 'medium' | 'low'
}

/**
 * Calculate image similarity using perceptual hashing
 * This is a simple implementation - in production, use more advanced ML models
 */
export async function detectImageSimilarity(
  image1: File | string,
  image2: File | string
): Promise<SimilarityResult> {
  try {
    // Convert to image elements
    const img1 = await loadImage(image1)
    const img2 = await loadImage(image2)

    // Calculate perceptual hash (simplified)
    const hash1 = await calculatePerceptualHash(img1)
    const hash2 = await calculatePerceptualHash(img2)

    // Calculate hamming distance
    const distance = hammingDistance(hash1, hash2)
    const maxDistance = hash1.length * 8 // Max possible distance
    const score = 1 - distance / maxDistance

    return {
      score,
      isSimilar: score > 0.7, // Threshold for similarity
      confidence: score > 0.9 ? 'high' : score > 0.7 ? 'medium' : 'low',
    }
  } catch (error) {
    console.error('Similarity detection error:', error)
    return {
      score: 0,
      isSimilar: false,
      confidence: 'low',
    }
  }
}

/**
 * Load image from File or URL
 */
function loadImage(source: File | string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image()
    
    if (source instanceof File) {
      const url = URL.createObjectURL(source)
      img.onload = () => {
        URL.revokeObjectURL(url)
        resolve(img)
      }
      img.onerror = reject
      img.src = url
    } else {
      img.crossOrigin = 'anonymous'
      img.onload = () => resolve(img)
      img.onerror = reject
      img.src = source
    }
  })
}

/**
 * Calculate perceptual hash (simplified version)
 * In production, use more sophisticated algorithms like pHash, dHash, or ML models
 */
async function calculatePerceptualHash(img: HTMLImageElement): Promise<string> {
  const canvas = document.createElement('canvas')
  const ctx = canvas.getContext('2d')
  if (!ctx) throw new Error('Failed to get canvas context')

  // Resize to small size for hash calculation
  const size = 8
  canvas.width = size
  canvas.height = size

  ctx.drawImage(img, 0, 0, size, size)
  const imageData = ctx.getImageData(0, 0, size, size)
  const pixels = imageData.data

  // Calculate average brightness
  let sum = 0
  for (let i = 0; i < pixels.length; i += 4) {
    sum += (pixels[i] + pixels[i + 1] + pixels[i + 2]) / 3
  }
  const avg = sum / (pixels.length / 4)

  // Generate hash based on brightness
  let hash = ''
  for (let i = 0; i < pixels.length; i += 4) {
    const brightness = (pixels[i] + pixels[i + 1] + pixels[i + 2]) / 3
    hash += brightness > avg ? '1' : '0'
  }

  return hash
}

/**
 * Calculate Hamming distance between two hashes
 */
function hammingDistance(hash1: string, hash2: string): number {
  if (hash1.length !== hash2.length) return Infinity

  let distance = 0
  for (let i = 0; i < hash1.length; i++) {
    if (hash1[i] !== hash2[i]) distance++
  }

  return distance
}

/**
 * Check if image might be a violation (similar to registered IP)
 * This would compare against database of registered IP assets
 */
export async function checkForViolations(
  image: File | string,
  registeredIPs: Array<{ ipId: string; imageUrl: string }>
): Promise<Array<{ ipId: string; similarity: SimilarityResult }>> {
  const results: Array<{ ipId: string; similarity: SimilarityResult }> = []

  for (const registeredIP of registeredIPs) {
    try {
      const similarity = await detectImageSimilarity(image, registeredIP.imageUrl)
      if (similarity.isSimilar) {
        results.push({
          ipId: registeredIP.ipId,
          similarity,
        })
      }
    } catch (error) {
      console.error(`Failed to compare with IP ${registeredIP.ipId}:`, error)
    }
  }

  return results.sort((a, b) => b.similarity.score - a.similarity.score)
}

