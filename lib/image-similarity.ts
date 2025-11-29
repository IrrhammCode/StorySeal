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

    // Calculate dHash (more accurate)
    const hash1 = await calculatePerceptualHash(img1)
    const hash2 = await calculatePerceptualHash(img2)

    // Calculate hamming distance
    const distance = hammingDistance(hash1, hash2)
    const maxDistance = hash1.length // For dHash, max distance is hash length
    const score = 1 - distance / maxDistance

    // Improved thresholds based on dHash characteristics
    // dHash is more accurate, so we can use tighter thresholds
    const isSimilar = score > 0.85 // Higher threshold for dHash
    const confidence = score > 0.95 ? 'high' : score > 0.85 ? 'medium' : 'low'

    return {
      score,
      isSimilar,
      confidence,
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
 * Calculate dHash (Difference Hash) - more accurate than simple brightness comparison
 * dHash compares adjacent pixels horizontally, making it more robust to minor changes
 * Algorithm: Resize to 9x8, convert to grayscale, compare adjacent pixels
 */
async function calculatePerceptualHash(img: HTMLImageElement): Promise<string> {
  const canvas = document.createElement('canvas')
  const ctx = canvas.getContext('2d')
  if (!ctx) throw new Error('Failed to get canvas context')

  // Resize to 9x8 for dHash (9 width for 8 comparisons)
  const width = 9
  const height = 8
  canvas.width = width
  canvas.height = height

  ctx.drawImage(img, 0, 0, width, height)
  const imageData = ctx.getImageData(0, 0, width, height)
  const pixels = imageData.data

  // Convert to grayscale and store in 2D array
  const grayscale: number[][] = []
  for (let y = 0; y < height; y++) {
    grayscale[y] = []
    for (let x = 0; x < width; x++) {
      const idx = (y * width + x) * 4
      const r = pixels[idx]
      const g = pixels[idx + 1]
      const b = pixels[idx + 2]
      // Convert to grayscale using luminance formula
      const gray = 0.299 * r + 0.587 * g + 0.114 * b
      grayscale[y][x] = gray
    }
  }

  // Calculate dHash: compare each pixel with its right neighbor
  let hash = ''
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width - 1; x++) {
      // Compare current pixel with right neighbor
      hash += grayscale[y][x] < grayscale[y][x + 1] ? '1' : '0'
    }
  }

  return hash
}

/**
 * Calculate average hash (aHash) as fallback
 * Uses average brightness comparison
 */
async function calculateAverageHash(img: HTMLImageElement): Promise<string> {
  const canvas = document.createElement('canvas')
  const ctx = canvas.getContext('2d')
  if (!ctx) throw new Error('Failed to get canvas context')

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
 * Compares against database of registered IP assets using improved similarity detection
 * Uses batch processing for better performance
 */
export async function checkForViolations(
  image: File | string,
  registeredIPs: Array<{ ipId: string; imageUrl: string }>
): Promise<Array<{ ipId: string; similarity: SimilarityResult }>> {
  const results: Array<{ ipId: string; similarity: SimilarityResult }> = []

  // Process in batches to avoid overwhelming the browser
  const batchSize = 5
  for (let i = 0; i < registeredIPs.length; i += batchSize) {
    const batch = registeredIPs.slice(i, i + batchSize)
    
    const batchPromises = batch.map(async (registeredIP) => {
      try {
        const similarity = await detectImageSimilarity(image, registeredIP.imageUrl)
        if (similarity.isSimilar) {
          return {
            ipId: registeredIP.ipId,
            similarity,
          }
        }
        return null
      } catch (error) {
        console.error(`Failed to compare with IP ${registeredIP.ipId}:`, error)
        return null
      }
    })

    const batchResults = await Promise.all(batchPromises)
    results.push(...batchResults.filter((r): r is { ipId: string; similarity: SimilarityResult } => r !== null))
  }

  // Sort by similarity score (highest first)
  return results.sort((a, b) => b.similarity.score - a.similarity.score)
}

