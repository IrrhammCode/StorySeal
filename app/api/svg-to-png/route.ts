import { NextRequest, NextResponse } from 'next/server'
import sharp from 'sharp'

/**
 * Convert SVG to PNG on server-side
 * This is more reliable than client-side conversion for complex SVGs
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const { svgCode, width = 1024, height = 1024, scale = 1 } = body

    // Input validation
    if (!svgCode || typeof svgCode !== 'string') {
      return NextResponse.json({ error: 'SVG code is required and must be a string' }, { status: 400 })
    }

    // Validate dimensions
    const finalWidth = Math.floor((width || 1024) * (scale || 1))
    const finalHeight = Math.floor((height || 1024) * (scale || 1))

    if (finalWidth <= 0 || finalWidth > 4096) {
      return NextResponse.json({ error: 'Width must be between 1 and 4096 pixels' }, { status: 400 })
    }

    if (finalHeight <= 0 || finalHeight > 4096) {
      return NextResponse.json({ error: 'Height must be between 1 and 4096 pixels' }, { status: 400 })
    }

    // Limit SVG size to prevent DoS
    if (svgCode.length > 5 * 1024 * 1024) { // 5MB max
      return NextResponse.json({ error: 'SVG code is too large (max 5MB)' }, { status: 400 })
    }

    // Sanitize SVG - remove any problematic elements
    let sanitizedSvg = svgCode
    // Remove XML declaration if present
    sanitizedSvg = sanitizedSvg.replace(/<\?xml[^>]*\?>/gi, '')
    sanitizedSvg = sanitizedSvg.replace(/<!DOCTYPE[^>]*>/gi, '')
    // Remove script tags
    sanitizedSvg = sanitizedSvg.replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '')
    sanitizedSvg = sanitizedSvg.replace(/<script[^>]*\/>/gi, '')
    // Remove event handlers
    sanitizedSvg = sanitizedSvg.replace(/\s*on\w+\s*=\s*["'][^"']*["']/gi, '')
    // Remove javascript: and data:text/html URLs
    sanitizedSvg = sanitizedSvg.replace(/xlink:href\s*=\s*["']?javascript:[^"'\s>]*["']?/gi, '')
    sanitizedSvg = sanitizedSvg.replace(/href\s*=\s*["']?javascript:[^"'\s>]*["']?/gi, '')
    // Remove dangerous elements
    sanitizedSvg = sanitizedSvg.replace(/<iframe[^>]*>[\s\S]*?<\/iframe>/gi, '')
    sanitizedSvg = sanitizedSvg.replace(/<embed[^>]*>/gi, '')
    sanitizedSvg = sanitizedSvg.replace(/<object[^>]*>[\s\S]*?<\/object>/gi, '')
    sanitizedSvg = sanitizedSvg.replace(/<foreignObject[^>]*>[\s\S]*?<\/foreignObject>/gi, '')
    // Remove null bytes and control characters
    sanitizedSvg = sanitizedSvg.replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g, '')
    // Ensure SVG has proper namespace
    if (!sanitizedSvg.includes('xmlns=')) {
      sanitizedSvg = sanitizedSvg.replace(
        /<svg([^>]*)>/,
        '<svg$1 xmlns="http://www.w3.org/2000/svg">'
      )
    }

    // Convert SVG string to Buffer
    const svgBuffer = Buffer.from(sanitizedSvg, 'utf-8')

    // Convert SVG to PNG using sharp
    // Sharp handles complex SVGs much better than browser Image element
    const pngBuffer = await sharp(svgBuffer)
      .resize(finalWidth, finalHeight, {
        fit: 'contain',
        background: { r: 255, g: 255, b: 255, alpha: 1 }, // White background
      })
      .png({
        quality: 100,
        compressionLevel: 6,
      })
      .toBuffer()


    // Return PNG as base64 data URL for client
    const base64 = pngBuffer.toString('base64')
    const dataUrl = `data:image/png;base64,${base64}`

    return NextResponse.json({
      success: true,
      dataUrl,
      width: finalWidth,
      height: finalHeight,
      size: pngBuffer.length,
    })
  } catch (error: any) {
    console.error('[SVG to PNG API] Error:', error)
    return NextResponse.json(
      {
        error: error.message || 'Failed to convert SVG to PNG',
        details: process.env.NODE_ENV === 'development' ? error.stack : undefined,
      },
      { status: 500 }
    )
  }
}

