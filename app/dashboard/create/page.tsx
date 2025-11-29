'use client'

import { motion } from 'framer-motion'
import { useState, useEffect } from 'react'
import Link from 'next/link'
import { 
  Sparkles, 
  Image as ImageIcon, 
  Upload, 
  Loader2, 
  CheckCircle, 
  Shield,
  Copy,
  ExternalLink,
  Zap,
  AlertCircle,
  Download
} from 'lucide-react'
import { useStoryService } from '@/hooks/useStoryProtocol'
import { embedWatermarkInImage, extractWatermarkFromImage } from '@/lib/watermark'
import { useABVGenerateImageWithRegistration } from '@/hooks/useABVDev'
import { useToast } from '@/contexts/ToastContext'
import { addActivity } from '@/lib/activity-tracker'
import { useAccount, useWalletClient, useChainId, useSwitchChain } from 'wagmi'
import { useQueryClient } from '@tanstack/react-query'
import { createWalletClient, http, custom } from 'viem'
import { aeneidTestnet } from '@/config/wagmi'
import { PROMPT_TEMPLATES, PROMPT_CATEGORIES, getTemplatesByCategory, searchTemplates, type PromptTemplate } from '@/lib/prompt-templates'
import { History, Sparkles as SparklesIcon, X } from 'lucide-react'
import { addRegistrationAttempt } from '@/lib/registration-tracker'
import { parseError, logError } from '@/lib/error-handler'
import { validatePrompt } from '@/lib/validation'
import { sanitizeSVG } from '@/lib/sanitize-svg'
import { trackGenerationTime } from '@/lib/analytics'
import { generateC2PAManifest } from '@/services/c2pa-service'

type GenerationStatus = 'idle' | 'generating' | 'generated' | 'registering' | 'recovering' | 'registered' | 'error'

export default function CreatePage() {
  const queryClient = useQueryClient()
  const [prompt, setPrompt] = useState('')
  const [ipAssetName, setIpAssetName] = useState('') // IP Asset name for easy identification
  const [licenseType, setLicenseType] = useState<'nonCommercial' | 'none'>('none') // License type to attach after registration
  const [generatedImage, setGeneratedImage] = useState<string | null>(null)
  const [generatedSvg, setGeneratedSvg] = useState<string | null>(null)
  const [generatedImageFile, setGeneratedImageFile] = useState<File | null>(null)
  const [watermarkedFile, setWatermarkedFile] = useState<File | null>(null) // File after watermark is added
  const [isWatermarked, setIsWatermarked] = useState(false) // Track if watermark has been added
  const [isAddingWatermark, setIsAddingWatermark] = useState(false) // Track watermark process
  const [status, setStatus] = useState<GenerationStatus>('idle')
  const [ipId, setIpId] = useState<string | null>(null) // IP Asset ID (generated content with prompt as metadata)
  const [promptIpId, setPromptIpId] = useState<string | null>(null) // Not used - prompt is stored as metadata in IP asset
  const [error, setError] = useState<string | null>(null)
  const [traceId, setTraceId] = useState<string | null>(null) // ABV.dev trace ID for querying IP ID (auto-set from response)
  const [abvTraceIdInput, setAbvTraceIdInput] = useState<string>('') // Manual input for Trace ID (input prompt)
  const [abvOutputId, setAbvOutputId] = useState<string>('') // Manual input for Output IP ID (output)
  const [geminiTraceIdInput, setGeminiTraceIdInput] = useState<string>('') // Manual input for Gemini Trace ID (legacy, not used)
  const [geminiOutputId, setGeminiOutputId] = useState<string>('') // Manual input for Gemini Output IP ID (legacy, not used)
  const [isAutoRegistered, setIsAutoRegistered] = useState(false) // Track if IP was auto-registered via ABV.dev
  const [mounted, setMounted] = useState(false)
  const [transactionHash, setTransactionHash] = useState<string | null>(null)
  const [manualTxHash, setManualTxHash] = useState('')
  const [showTemplates, setShowTemplates] = useState(false)
  const [selectedCategory, setSelectedCategory] = useState('All')
  const [templateSearch, setTemplateSearch] = useState('')
  const [promptHistory, setPromptHistory] = useState<string[]>([])
  const { isConnected, address } = useAccount()
  const { data: walletClient, isLoading: isWalletClientLoading } = useWalletClient()
  const chainId = useChainId()
  const { switchChain } = useSwitchChain()
  const storyService = useStoryService()
  const generateImageMutation = useABVGenerateImageWithRegistration()
  const { showToast } = useToast()

  // Prevent hydration warnings - ensure client-side only
  useEffect(() => {
    setMounted(true)
    // Load prompt history
    const history = localStorage.getItem('storyseal_prompt_history')
    if (history) {
      try {
        setPromptHistory(JSON.parse(history))
      } catch (error) {
        console.error('Failed to load prompt history:', error)
      }
    }
  }, [])

  // Save prompt to history
  const saveToHistory = (promptText: string) => {
    if (!promptText.trim()) return
    const updated = [promptText, ...promptHistory.filter(p => p !== promptText)].slice(0, 10)
    setPromptHistory(updated)
    localStorage.setItem('storyseal_prompt_history', JSON.stringify(updated))
  }

  // Use template
  const useTemplate = (template: PromptTemplate) => {
    setPrompt(template.prompt)
    setShowTemplates(false)
    showToast('success', `Template "${template.name}" loaded`)
  }


  // Get filtered templates
  const filteredTemplates = templateSearch
    ? searchTemplates(templateSearch)
    : getTemplatesByCategory(selectedCategory)

  // Convert SVG to PNG for watermark embedding
  // Uses server-side API route for more reliable conversion
  const convertSvgToImage = async (svgCode: string, scale: number = 1): Promise<File> => {
    // Try server-side conversion first (more reliable for complex SVGs)
    try {
      // Extract dimensions from SVG
      let svgWidth = 1024
      let svgHeight = 1024
      const widthMatch = svgCode.match(/width=["']?(\d+)/i)
      const heightMatch = svgCode.match(/height=["']?(\d+)/i)
      const viewBoxMatch = svgCode.match(/viewBox=["']?[\d\s]+(\d+)[\s]+(\d+)/i)
      
      if (widthMatch && heightMatch) {
        svgWidth = parseInt(widthMatch[1])
        svgHeight = parseInt(heightMatch[1])
      } else if (viewBoxMatch) {
        svgWidth = parseInt(viewBoxMatch[1])
        svgHeight = parseInt(viewBoxMatch[2])
      }
      
      // Cap dimensions to prevent memory issues
      if (svgWidth > 2048) svgWidth = 2048
      if (svgHeight > 2048) svgHeight = 2048
      
      // Call server-side API
      const response = await fetch('/api/svg-to-png', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          svgCode,
          width: svgWidth,
          height: svgHeight,
          scale,
        }),
      })
      
      if (!response.ok) {
        const error = await response.json()
        throw new Error(error.error || 'Server-side conversion failed')
      }
      
      const result = await response.json()
      
      // Convert data URL to File
      const base64Data = result.dataUrl.split(',')[1]
      const byteCharacters = atob(base64Data)
      const byteNumbers = new Array(byteCharacters.length)
      for (let i = 0; i < byteCharacters.length; i++) {
        byteNumbers[i] = byteCharacters.charCodeAt(i)
      }
      const byteArray = new Uint8Array(byteNumbers)
      const blob = new Blob([byteArray], { type: 'image/png' })
      
      return new File([blob], 'generated-artwork.png', { type: 'image/png' })
    } catch (serverError: any) {
      // Fallback to client-side conversion (original method)
      return convertSvgToImageClientSide(svgCode, scale)
    }
  }

  // Client-side conversion (fallback method)
  const convertSvgToImageClientSide = async (svgCode: string, scale: number = 1): Promise<File> => {
    return new Promise((resolve, reject) => {
      // Add timeout to prevent hanging
      const timeout = setTimeout(() => {
        reject(new Error('SVG conversion timeout'))
      }, 15000) // 15 second timeout for high-res conversion

      const img = new Image()
      
      // Ensure SVG has proper dimensions and encoding
      let processedSvg = svgCode
      
      // Remove any XML declaration or DOCTYPE that might cause issues
      processedSvg = processedSvg.replace(/<\?xml[^>]*\?>/gi, '')
      processedSvg = processedSvg.replace(/<!DOCTYPE[^>]*>/gi, '')
      
      // Extract or set dimensions - use reasonable resolution
      let svgWidth = 1024 // Default resolution (good balance)
      let svgHeight = 1024
      
      // Try to extract dimensions from SVG
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
      
      // Use actual dimensions or reasonable defaults (don't force too high)
      // For scale > 1, we'll upscale, but base should be reasonable
      if (svgWidth < 512) svgWidth = 1024
      if (svgHeight < 512) svgHeight = 1024
      
      // Cap maximum base resolution to avoid memory issues
      if (svgWidth > 2048) svgWidth = 2048
      if (svgHeight > 2048) svgHeight = 2048
      
      // Fix SVG attributes - ensure width, height, and viewBox with high resolution
      if (!processedSvg.includes('viewBox=')) {
        processedSvg = processedSvg.replace(
          /<svg([^>]*)>/,
          `<svg$1 width="${svgWidth}" height="${svgHeight}" viewBox="0 0 ${svgWidth} ${svgHeight}">`
        )
      } else {
        // Update viewBox if dimensions are too small
        processedSvg = processedSvg.replace(
          /viewBox=["']?([^"']+)["']?/,
          `viewBox="0 0 ${svgWidth} ${svgHeight}"`
        )
      }
      
      // Ensure SVG has width and height with high resolution
      if (!processedSvg.includes('width=')) {
        processedSvg = processedSvg.replace(
          /<svg([^>]*)>/,
          `<svg$1 width="${svgWidth}" height="${svgHeight}">`
        )
      } else {
        // Update width/height to high resolution
        processedSvg = processedSvg.replace(/width=["']?(\d+)/i, `width="${svgWidth}"`)
        processedSvg = processedSvg.replace(/height=["']?(\d+)/i, `height="${svgHeight}"`)
      }

      // Clean up SVG - remove any script tags or external references that might cause issues
      processedSvg = processedSvg.replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '')
      processedSvg = processedSvg.replace(/<foreignObject[^>]*>[\s\S]*?<\/foreignObject>/gi, '')
      processedSvg = processedSvg.replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '') // Remove style tags that might cause issues
      
      // Remove any external references that might cause CORS issues
      processedSvg = processedSvg.replace(/xlink:href=["'][^"']+["']/gi, '')
      processedSvg = processedSvg.replace(/href=["'][^"']+["']/gi, '')
      
      // Remove any data URIs that might be too large
      processedSvg = processedSvg.replace(/data:image\/[^;]+;base64,[A-Za-z0-9+/=]{1000,}/g, '')
      
      // Sanitize SVG - remove any invalid characters or encoding issues
      // Remove null bytes and control characters
      processedSvg = processedSvg.replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g, '')
      
      // Ensure SVG has xmlns attribute (required for proper rendering)
      if (!processedSvg.includes('xmlns=')) {
        processedSvg = processedSvg.replace(
          /<svg([^>]*)>/,
          '<svg$1 xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink">'
        )
      }
      
      // Limit SVG size to prevent memory issues (max 500KB)
      if (processedSvg.length > 500000) {
        processedSvg = processedSvg.substring(0, 500000) + '</svg>'
      }

      // Convert SVG to data URL (more reliable than blob URL)
      try {
        // Use encodeURIComponent instead of btoa for better compatibility
        const svgEncoded = encodeURIComponent(processedSvg)
        const dataUrl = `data:image/svg+xml;charset=utf-8,${svgEncoded}`
        
        img.onload = () => {
          try {
            clearTimeout(timeout)
            const canvas = document.createElement('canvas')
            
            // Use high resolution with scale factor for retina/high DPI
            const baseWidth = svgWidth
            const baseHeight = svgHeight
            const scaledWidth = baseWidth * scale
            const scaledHeight = baseHeight * scale
            
            // Set canvas to high resolution
            canvas.width = scaledWidth
            canvas.height = scaledHeight
            
            const ctx = canvas.getContext('2d', {
              alpha: false, // Opaque background for better quality
              desynchronized: false,
              willReadFrequently: false,
            })
            
            if (!ctx) {
              reject(new Error('Failed to get canvas context'))
              return
            }
            
            // Enable high-quality rendering
            ctx.imageSmoothingEnabled = true
            ctx.imageSmoothingQuality = 'high'
            
            // Fill white background for better rendering
            ctx.fillStyle = '#FFFFFF'
            ctx.fillRect(0, 0, canvas.width, canvas.height)
            
            // Draw SVG at high resolution
            ctx.drawImage(img, 0, 0, scaledWidth, scaledHeight)
            
            // Export with maximum quality
            canvas.toBlob((blob) => {
              if (!blob) {
                reject(new Error('Failed to convert SVG to image blob'))
                return
              }
              const file = new File([blob], 'generated-artwork.png', { type: 'image/png' })
              resolve(file)
            }, 'image/png', 1.0) // Maximum quality (1.0)
          } catch (err) {
            clearTimeout(timeout)
            reject(err)
          }
        }
        
        let retryCount = 0
        const maxRetries = 2
        let hasRetried = false
        
        img.onerror = (err) => {
          if (!hasRetried && retryCount < maxRetries) {
            hasRetried = true
            retryCount++
            // Try alternative encoding method (base64) if URL encoding fails
            try {
              // Use a more robust base64 encoding
              const svgUtf8 = unescape(encodeURIComponent(processedSvg))
              const svgBase64 = btoa(svgUtf8)
              const altDataUrl = `data:image/svg+xml;base64,${svgBase64}`
              
              // Reset timeout for retry
              clearTimeout(timeout)
              const retryTimeout = setTimeout(() => {
                reject(new Error('SVG conversion timeout (retry)'))
              }, 20000) // Longer timeout for retry
              
              // Create new image for retry
              const retryImg = new Image()
              retryImg.onload = (event) => {
                clearTimeout(retryTimeout)
                // Use same onload handler
                if (img.onload) {
                  img.onload.call(retryImg, event)
                }
              }
              retryImg.onerror = () => {
                clearTimeout(retryTimeout)
                console.error('[SVG Conversion] Base64 encoding also failed')
                
                // Last resort: try with simplified SVG (remove complex features)
                if (retryCount < maxRetries) {
                try {
                    // Simplify SVG by removing filters, gradients, etc.
                    let simplifiedSvg = processedSvg
                    simplifiedSvg = simplifiedSvg.replace(/<defs[^>]*>[\s\S]*?<\/defs>/gi, '')
                    simplifiedSvg = simplifiedSvg.replace(/<filter[^>]*>[\s\S]*?<\/filter>/gi, '')
                    simplifiedSvg = simplifiedSvg.replace(/<linearGradient[^>]*>[\s\S]*?<\/linearGradient>/gi, '')
                    simplifiedSvg = simplifiedSvg.replace(/<radialGradient[^>]*>[\s\S]*?<\/radialGradient>/gi, '')
                    
                    const simplifiedUtf8 = unescape(encodeURIComponent(simplifiedSvg))
                    const simplifiedBase64 = btoa(simplifiedUtf8)
                    const simplifiedDataUrl = `data:image/svg+xml;base64,${simplifiedBase64}`
                    
                    const finalRetryImg = new Image()
                    finalRetryImg.onload = (event) => {
                      clearTimeout(retryTimeout)
                      if (img.onload) {
                        img.onload.call(finalRetryImg, event)
                      }
                    }
                    finalRetryImg.onerror = () => {
                      clearTimeout(retryTimeout)
                      reject(new Error('Failed to load SVG image even after simplification. The SVG may be too complex.'))
                    }
                    finalRetryImg.src = simplifiedDataUrl
                    return
                  } catch (simplifyError) {
                    // Fall through
                  }
                }
                
                reject(new Error('Failed to load SVG image. The SVG may contain unsupported features or be too complex.'))
              }
              retryImg.src = altDataUrl
              return // Don't reject yet, retry is in progress
            } catch (retryError: any) {
              console.error('[SVG Conversion] Retry encoding error:', retryError)
              // Fall through to reject
            }
          }
          
          clearTimeout(timeout)
          console.error('[SVG Conversion] SVG load error:', err)
          console.error('[SVG Conversion] SVG data URL length:', dataUrl.length)
          console.error('[SVG Conversion] SVG preview (first 500 chars):', processedSvg.substring(0, 500))
          reject(new Error('Failed to load SVG image. The SVG may contain unsupported features or be too complex.'))
        }
        
        // Don't set crossOrigin for data URLs
        img.src = dataUrl
      } catch (encodeError) {
        clearTimeout(timeout)
        reject(new Error('Failed to encode SVG to base64'))
      }
    })
  }

  const handleGenerate = async () => {
    // Validate prompt
    const validation = validatePrompt(prompt)
    if (!validation.valid) {
      setError(validation.error || null)
      showToast('error', validation.error || 'Invalid prompt')
      return
    }

    setStatus('generating')
    setError(null)
    setGeneratedImage(null)
    setGeneratedImageFile(null)
    setWatermarkedFile(null) // Reset watermarked file
    setIsWatermarked(false) // Reset watermark state
    setIsAddingWatermark(false) // Reset watermark process
    setPromptIpId(null)
    setIpId(null)
    setAbvOutputId('') // Reset ABV output ID input

    const startTime = Date.now()

    try {
      // ABV.dev flow: Auto-tracing, register via dashboard
      const walletAddressToUse = address || '0x4B56166d9E03747f5c66C4b21910Bb43BBCd53Eb'
      console.log('[handleGenerate] Using ABV.dev provider')
      console.log('[handleGenerate] Wallet address:', walletAddressToUse)
      
      const result = await generateImageMutation.mutateAsync({
        prompt: prompt.trim(),
        provider: 'openai',
        model: 'gpt-4o',
        walletAddress: walletAddressToUse,
      })

      if (!result.svgData || !result.svgUrl) {
        throw new Error('Failed to generate SVG: No SVG data returned')
      }

      const duration = Date.now() - startTime
      trackGenerationTime(duration)

      setGeneratedSvg(result.svgData.svg_code)
      setGeneratedImage(result.svgUrl)
      const receivedTraceId = result.traceId || null
      setTraceId(receivedTraceId)
      // Auto-fill trace ID input if available
      if (receivedTraceId) {
        setAbvTraceIdInput(receivedTraceId)
      }
      saveToHistory(prompt.trim())

      // ABV.dev: Always set to generated (user registers via dashboard)
      setStatus('generated')
      setIsAutoRegistered(false) // User will register via dashboard
      showToast('success', '✅ Image generated! Prompt and output are tracked in ABV.dev dashboard. Go to dashboard to register as IP asset.', 5000)
      
      // Start loading animation countdown
      setShowLoadingAnimation(true)
      setLoadingCountdown(10)

      // Convert SVG to PNG (async) and generate C2PA manifest
      convertSvgToImage(result.svgData.svg_code, 1)
        .then(async (imageFile) => {
          setGeneratedImageFile(imageFile)
          
          // Generate C2PA manifest for provenance tracking
          if (imageFile && address) {
            try {
              await generateC2PAManifest({
                imageFile,
                creator: address,
                generator: 'StorySeal-Engine (ABV.dev)',
                ipId: result.ipId || undefined,
                metadata: {
                  prompt: prompt.trim(),
                  provider: 'abvdev',
                  generatedAt: new Date().toISOString(),
                },
              })
              console.log('[handleGenerate] ✅ C2PA manifest generated')
            } catch (c2paError) {
              console.warn('[handleGenerate] C2PA generation failed (non-critical):', c2paError)
            }
          }
        })
        .catch(() => setGeneratedImageFile(null))
    } catch (err: any) {
      logError(err, 'handleGenerate')
      const errorInfo = parseError(err)
      setError(errorInfo.userMessage)
      setStatus('error')
      showToast('error', errorInfo.userMessage)
    }
  }


  // Register IP Asset manually following official Story Protocol docs
  // https://docs.story.foundation/developers/typescript-sdk/register-ip-asset
  const handleRegister = async () => {
    if (!storyService || !generatedImage || !generatedSvg) {
      showToast('error', 'Please generate an image first')
      return
    }

    if (!isConnected || !address) {
      showToast('error', 'Please connect your wallet first')
      return
    }

    // Check if wallet is on correct chain (Aeneid Testnet - Chain ID 1315)
    if (chainId !== aeneidTestnet.id) {
      showToast('warning', `Please switch to Aeneid Testnet (Chain ID: ${aeneidTestnet.id})`, 5000)
      
      try {
        await switchChain({ chainId: aeneidTestnet.id })
        showToast('success', 'Chain switched! Please try registering again.', 3000)
        return // User needs to click register again after chain switch
      } catch (switchError: any) {
        console.error('[handleRegister] Failed to switch chain:', switchError)
        
        // Error 4902: Chain not added to wallet
        // Error -32603: Network already exists but with different chain ID
        if (switchError?.code === 4902 || switchError?.code === -32603 || switchError?.message?.includes('Unrecognized chain ID')) {
          // Try to add chain manually using window.ethereum
          if (typeof window !== 'undefined' && (window as any).ethereum) {
            try {
              await (window as any).ethereum.request({
                method: 'wallet_addEthereumChain',
                params: [{
                  chainId: `0x${aeneidTestnet.id.toString(16)}`, // Convert to hex (0x523 for 1315)
                  chainName: 'Aeneid Testnet',
                  nativeCurrency: {
                    name: 'Ether',
                    symbol: 'ETH',
                    decimals: 18,
                  },
                  rpcUrls: ['https://aeneid.storyrpc.io'],
                  blockExplorerUrls: ['https://explorer.aeneid.storyprotocol.xyz'],
                }],
              })
              // After adding, try to switch again
              await switchChain({ chainId: aeneidTestnet.id })
              showToast('success', 'Chain added and switched! Please try registering again.', 3000)
              return
            } catch (addError: any) {
              console.error('[handleRegister] Failed to add chain:', addError)
              
              // Check if error is about existing network with wrong chain ID
              if (addError?.code === -32603 || addError?.message?.includes('same RPC endpoint') || addError?.message?.includes('existing network')) {
                // User has "Aeneid Testnet" with wrong chain ID
                const errorMessage = `⚠️ Network Conflict Detected!\n\n` +
                  `MetaMask already has a network named "Aeneid Testnet" but with the wrong Chain ID.\n\n` +
                  `Please remove the incorrect network first:\n` +
                  `1. Open MetaMask\n` +
                  `2. Go to Settings → Networks\n` +
                  `3. Find "Aeneid Testnet" (with wrong Chain ID)\n` +
                  `4. Click the trash icon to remove it\n` +
                  `5. Then try registering again\n\n` +
                  `Required Network Details:\n` +
                  `- Network Name: Aeneid Testnet\n` +
                  `- RPC URL: https://aeneid.storyrpc.io\n` +
                  `- Chain ID: 1315 (0x523) ← Must be exactly this!\n` +
                  `- Currency Symbol: ETH\n` +
                  `- Block Explorer: https://explorer.aeneid.storyprotocol.xyz`
                setError(errorMessage)
                setStatus('error')
                showToast('error', 'Please remove incorrect Aeneid Testnet network in MetaMask first!', 8000)
                return
              } else {
                // Other add chain errors
                const errorMessage = `Please add Aeneid Testnet manually to your wallet:\n\n` +
                  `Network Name: Aeneid Testnet\n` +
                  `RPC URL: https://aeneid.storyrpc.io\n` +
                  `Chain ID: 1315 (0x523)\n` +
                  `Currency Symbol: ETH\n` +
                  `Block Explorer: https://explorer.aeneid.storyprotocol.xyz\n\n` +
                  `Error: ${addError?.message || 'Unknown error'}`
                setError(errorMessage)
                setStatus('error')
                showToast('error', 'Failed to add chain. Please add manually in your wallet.', 5000)
                return
              }
            }
          } else {
            // No window.ethereum, show manual instructions
            setError(`Please switch your wallet to Aeneid Testnet (Chain ID: ${aeneidTestnet.id}).

Current Chain ID: ${chainId}
Required Chain ID: ${aeneidTestnet.id}

Click "Switch Network" in your wallet or add Aeneid Testnet manually:
- Network Name: Aeneid Testnet
- RPC URL: https://aeneid.storyrpc.io
- Chain ID: 1315 (0x523)
- Currency Symbol: ETH
- Block Explorer: https://explorer.aeneid.storyprotocol.xyz`)
            setStatus('error')
            showToast('error', `Please switch to Aeneid Testnet (Chain ID: ${aeneidTestnet.id})`)
            return
          }
        } else {
          // Other errors (user rejection, etc.)
          setError(`Failed to switch chain: ${switchError?.message || 'Unknown error'}

Please switch your wallet to Aeneid Testnet (Chain ID: ${aeneidTestnet.id}) manually.`)
          setStatus('error')
          showToast('error', `Please switch to Aeneid Testnet (Chain ID: ${aeneidTestnet.id})`)
          return
        }
      }
    }

    // Get wallet client - create from window.ethereum if hook walletClient is not available
    let signingWalletClient = walletClient
    
    if (!signingWalletClient && typeof window !== 'undefined' && (window as any).ethereum) {
      try {
        // Create wallet client directly from window.ethereum
        signingWalletClient = createWalletClient({
          account: {
            address: address as `0x${string}`,
            type: 'json-rpc',
          },
          chain: aeneidTestnet,
          transport: custom((window as any).ethereum) as any, // Type assertion for custom transport
        }) as any
      } catch (createError: any) {
        console.error('[handleRegister] Failed to create wallet client:', createError)
      }
    }
    
    if (!signingWalletClient) {
      
      if (!isConnected || !address) {
        showToast('error', 'Please connect your wallet first')
        return
      }
      
      showToast('error', 'Wallet client not available. Please try:\n1. Refresh the page\n2. Disconnect and reconnect your wallet\n3. Make sure you\'re on Aeneid Testnet')
      return
    }
    
    // Get account from wallet client
    let account = signingWalletClient.account
    if (!account && address) {
      // Fallback: create account object from address
      account = {
        address: address as `0x${string}`,
        type: 'json-rpc' as const,
      }
    }
    
    if (!account || !account.address) {
      showToast('error', 'Invalid wallet account. Please reconnect your wallet.')
      return
    }

    try {
      setStatus('registering')
      setError(null)
      
      // Use direct contract call (SDK doesn't support json-rpc account type)
      // SDK requires private key account, but we're using wallet extension (json-rpc)
      
      const ipAsset = await storyService.registerIPAssetDirectContract(
        {
          name: ipAssetName.trim() || `StorySeal IP Asset - ${new Date().toISOString()}`,
          description: `AI-generated artwork with invisible watermark protection. Prompt: ${prompt.trim()}`,
          imageUrl: generatedImage, // SVG data URL
          metadata: {
            prompt: prompt.trim(),
            generatedAt: new Date().toISOString(),
            source: 'storyseal-direct-contract',
            ipSignature: generatedSvg.match(/<!-- SEAL-IP:([^>]+) -->/)?.[1] || 'unknown',
          },
          account: account,
        },
        signingWalletClient
      )

      console.log('[handleRegister] ✅ IP Asset registered successfully!')
      console.log('[handleRegister] IP ID:', ipAsset.id)
      console.log('[handleRegister] View on explorer: https://aeneid.explorer.story.foundation/ipa/' + ipAsset.id)
      
      // Set IP ID and status
      setIpId(ipAsset.id)
      setStatus('registered')
      
      // Auto-embed watermark if possible
      if (generatedImageFile && ipAsset.id && ipAsset.id.startsWith('0x') && ipAsset.id.length >= 42) {
        // ABV: Auto-embed watermark if possible
        try {
          console.log('[handleRegister] Auto-embedding watermark with IP ID:', ipAsset.id)
          setIsAddingWatermark(true)
          console.log('[handleRegister] Embedding watermark with IP ID:', ipAsset.id)
          const watermarkedFile = await embedWatermarkInImage(generatedImageFile, ipAsset.id)
          
          // Verify watermark was embedded correctly
          console.log('[handleRegister] 🔍 Verifying watermark...')
          const verifiedIpId = await extractWatermarkFromImage(watermarkedFile)
          
          if (!verifiedIpId || verifiedIpId.toLowerCase().substring(0, 42) !== ipAsset.id.toLowerCase().substring(0, 42)) {
            throw new Error('Watermark verification failed after embedding')
          }
          
          setWatermarkedFile(watermarkedFile)
          setIsWatermarked(true)
          setIsAddingWatermark(false)
          console.log('[handleRegister] ✅ Watermark embedded and verified successfully with IP ID:', ipAsset.id)
          showToast('success', 'IP Asset registered and watermark added & verified!', 4000)
        } catch (watermarkError: any) {
          console.error('[handleRegister] Failed to auto-embed watermark:', watermarkError)
          setIsAddingWatermark(false)
          setIsWatermarked(false) // Reset so user can try again
          showToast('warning', `IP Asset registered but watermark failed. Please add watermark manually.`, 5000)
        }
      } else {
        // Fallback: Reset watermark state
        setIsWatermarked(false)
        console.warn('[handleRegister] ⚠️ Cannot auto-embed watermark:', {
          ipId: ipAsset.id,
          hasImageFile: !!generatedImageFile,
        })
      }
      
      // Attach license if selected
      if (licenseType !== 'none' && storyService && walletClient && account) {
        try {
          console.log('[handleRegister] Attaching license type:', licenseType)
          showToast('info', `Attaching ${licenseType} license to IP Asset...`, 3000)
          
          const licenseResult = await storyService.createLicense(ipAsset.id, licenseType, account, walletClient)
          
          console.log('[handleRegister] ✅ License attached successfully:', licenseResult)
          showToast('success', `✅ IP Asset registered and ${licenseType} license attached!`, 5000)
          
          // Save license to localStorage (same format as licenses page)
          try {
            const storedLicenses = localStorage.getItem('storyseal_licenses')
            const existingLicenses = storedLicenses ? JSON.parse(storedLicenses) : []
            
            const newLicense = {
              id: `license_${Date.now()}`,
              name: `${licenseType} License`,
              ipAssetId: ipAsset.id,
              licenseTermsId: licenseResult.licenseTermsId.toString(),
              type: licenseType as 'commercial' | 'nonCommercial' | 'commercialRemix',
              createdAt: new Date().toISOString(),
              status: 'active' as const,
            }
            
            const updatedLicenses = [newLicense, ...existingLicenses]
            localStorage.setItem('storyseal_licenses', JSON.stringify(updatedLicenses))
            console.log('[handleRegister] ✅ License saved to localStorage')
          } catch (storageError) {
            console.error('[handleRegister] Failed to save license to localStorage:', storageError)
            // Don't fail if localStorage save fails
          }
          
          // Track activity
          addActivity({
            type: 'license_created',
            title: 'License Created',
            description: `Created ${licenseType} license for IP Asset ${ipAsset.id.slice(0, 10)}...${ipAsset.id.slice(-8)}`,
            metadata: {
              ipId: ipAsset.id,
              licenseType: licenseType,
              licenseTermsId: licenseResult.licenseTermsId.toString(),
              txHash: licenseResult.txHash,
              attachTxHash: licenseResult.attachTxHash,
            },
          })
        } catch (licenseError: any) {
          console.error('[handleRegister] Failed to attach license:', licenseError)
          // Don't fail the whole registration if license attachment fails
          showToast('warning', `IP Asset registered but license attachment failed: ${licenseError.message}`, 5000)
        }
      }
      
      // Don't auto-embed watermark - user will add it manually via "Add Watermark" button
      // Watermark will be added after registration, before download
      
      // Save to localStorage for manual IP assets
      if (address) {
        const manualAssetsKey = `storyseal_manual_ip_assets_${address}`
        const existingAssets = JSON.parse(localStorage.getItem(manualAssetsKey) || '[]')
        
        // Check if already exists
        if (!existingAssets.some((a: any) => a.id === ipAsset.id.toLowerCase())) {
          // Add new manual IP asset
          const newAsset = {
            id: ipAsset.id,
            name: ipAssetName.trim() || `IP Asset ${ipAsset.id.slice(0, 10)}...`,
            owner: address,
            registeredAt: new Date().toISOString(),
            metadata: {
              tokenId: null,
              traceId: null,
              prompt: prompt.trim() || null,
              provider: 'abv',
              method: 'handleRegister-direct-contract',
              mediaUrl: generatedImage || ipAsset.metadata?.mediaUrl || null,
            },
          }
          
          existingAssets.push(newAsset)
          localStorage.setItem(manualAssetsKey, JSON.stringify(existingAssets))
          console.log('[handleRegister] ✅ Saved IP asset to localStorage')
        }
      }
      
      setIpId(ipAsset.id)
      setStatus('registered')
      setIsAutoRegistered(false) // Manual registration
      
      // Show success message with full IP ID
      const ipIdShort = ipAsset.id.length > 20 ? `${ipAsset.id.slice(0, 10)}...${ipAsset.id.slice(-8)}` : ipAsset.id
      showToast('success', `✅ IP Asset registered! IP ID: ${ipIdShort}. It will appear in My IP Assets now.`, 10000)
      
      // Track successful registration
      addRegistrationAttempt('success', {
        ipId: ipAsset.id,
        prompt: prompt.trim(),
        duration: 0,
        metadata: {
          imageUrl: generatedImage,
          type: 'svg_artwork',
          source: 'story-protocol-official-docs',
          registrationMethod: 'manual-sdk',
        },
      })
      
      // Track activity
      addActivity({
        type: 'ip_registered',
        title: 'IP Asset Registered',
        description: `Registered IP Asset ${ipIdShort}`,
        metadata: {
          ipId: ipAsset.id,
          prompt: prompt.trim(),
          method: 'manual',
        },
      })
      
      // Invalidate and refetch queries to refresh My IP Assets and Dashboard
      // Wait a bit for transaction to be confirmed and indexed on blockchain
      if (address) {
        // Multiple retry attempts with increasing delays
        // Blockchain indexing can take time, especially on testnets
        const retryDelays = [3000, 8000, 15000, 30000] // 3s, 8s, 15s, 30s
        
        retryDelays.forEach((delay, index) => {
          setTimeout(() => {
            console.log(`[handleRegister] 🔄 Refetch attempt ${index + 1}/${retryDelays.length} after ${delay}ms...`)
            queryClient.invalidateQueries({ queryKey: ['ip-assets', 'owner', address] })
            queryClient.invalidateQueries({ queryKey: ['ip-assets'] })
            
            // Force refetch after invalidation
            queryClient.refetchQueries({ queryKey: ['ip-assets', 'owner', address] })
            console.log(`[handleRegister] ✅ Refetch attempt ${index + 1} completed`)
          }, delay)
        })
        
        console.log('[handleRegister] ⏳ Scheduled multiple refetch attempts to ensure data appears in My IP Assets')
      }
    } catch (err: any) {
      console.error('[handleRegister] Registration failed:', err)
      logError(err, 'handleRegister')
      const errorInfo = parseError(err)
      setError(errorInfo.userMessage)
      setStatus('error')
      showToast('error', errorInfo.userMessage)
      
      // Track failed registration
      addRegistrationAttempt('failure', {
        prompt: prompt.trim(),
        error: errorInfo.userMessage,
        metadata: {
          imageUrl: generatedImage,
          type: 'svg_artwork',
          source: 'story-protocol-official-docs',
        },
      })
    }
  }

  const handleCopyIpId = () => {
    if (ipId) {
      navigator.clipboard.writeText(ipId)
      showToast('success', 'IP Asset ID copied to clipboard!')
    }
  }

  const [imageUrl, setImageUrl] = useState<string | null>(null)
  const [isUploadingToIPFS, setIsUploadingToIPFS] = useState(false)
  const [showLoadingAnimation, setShowLoadingAnimation] = useState(false)
  const [loadingCountdown, setLoadingCountdown] = useState(10)

  // Loading animation countdown timer
  useEffect(() => {
    if (!showLoadingAnimation) {
      return
    }

    console.log('[Countdown] Starting countdown timer from 10')

    const timer = setInterval(() => {
      setLoadingCountdown(prev => {
        const newCount = prev - 1
        console.log('[Countdown] Countdown:', newCount)
        
        if (newCount <= 0) {
          console.log('[Countdown] Countdown finished!')
          clearInterval(timer)
          // Countdown finished, hide animation after a brief moment
          setTimeout(() => {
            setShowLoadingAnimation(false)
          }, 500)
          return 0
        }
        return newCount
      })
    }, 1000)

    return () => {
      console.log('[Countdown] Cleaning up timer')
      clearInterval(timer)
    }
  }, [showLoadingAnimation])

  const handleGetImageUrl = async () => {
    if (!generatedImage && !generatedImageFile) {
      showToast('error', 'No image available. Please generate an image first.')
      return
    }

    try {
      // If we have generatedImageFile, use that (PNG file)
      if (generatedImageFile) {
        // Convert file to data URL
        const reader = new FileReader()
        reader.onload = () => {
          const dataUrl = reader.result as string
          navigator.clipboard.writeText(dataUrl)
          setImageUrl(dataUrl)
          showToast('success', 'Image data URL copied! Paste it in Monitor page URL field to test.')
        }
        reader.onerror = () => {
          showToast('error', 'Failed to read image file')
        }
        reader.readAsDataURL(generatedImageFile)
        return
      }

      // Fallback: Use generatedImage (could be data URL or regular URL)
      if (generatedImage) {
        // If it's already a data URL or http URL, copy it
        if (generatedImage.startsWith('data:') || generatedImage.startsWith('http')) {
          navigator.clipboard.writeText(generatedImage)
          setImageUrl(generatedImage)
          showToast('success', 'Image URL copied! Paste it in Monitor page URL field to test.')
          return
        }
      }

      // If we have SVG, convert to data URL
      if (generatedSvg) {
        const svgDataUrl = `data:image/svg+xml;base64,${btoa(unescape(encodeURIComponent(generatedSvg)))}`
        navigator.clipboard.writeText(svgDataUrl)
        setImageUrl(svgDataUrl)
        showToast('success', 'SVG data URL copied! Paste it in Monitor page URL field to test.')
        return
      }

      showToast('error', 'No image data available')
    } catch (error: any) {
      showToast('error', `Failed to get image URL: ${error.message}`)
    }
  }

  const handleUploadToIPFS = async () => {
    if (!generatedImage || !generatedImageFile) {
      showToast('error', 'No image available. Please generate an image first.')
      return
    }

    setIsUploadingToIPFS(true)
    try {
      const { uploadToIPFS } = await import('@/services/ipfs-service')
      const ipfsUrl = await uploadToIPFS(generatedImageFile, `storyseal-${Date.now()}.png`)
      
      // Convert IPFS URL to gateway URL
      const cid = ipfsUrl.replace('ipfs://', '')
      const gatewayUrl = `https://gateway.pinata.cloud/ipfs/${cid}`
      
      setImageUrl(gatewayUrl)
      navigator.clipboard.writeText(gatewayUrl)
      showToast('success', `Image uploaded to IPFS! URL copied to clipboard: ${gatewayUrl}`)
    } catch (error: any) {
      console.error('IPFS upload error:', error)
      if (error.message?.includes('Pinata credentials')) {
        showToast('error', 'Pinata credentials not configured. Please set up Pinata API keys in Settings page.')
      } else {
        showToast('error', `Failed to upload to IPFS: ${error.message}`)
      }
    } finally {
      setIsUploadingToIPFS(false)
    }
  }

  const handleExtractIpIdFromTx = async () => {
    if (!manualTxHash.trim() || !storyService) {
      showToast('error', 'Please enter a valid transaction hash')
      return
    }

    setStatus('registering')
    setError(null)

    try {
      const extractedIpId = await storyService.getIPIdFromTransaction(manualTxHash.trim())
      
      if (extractedIpId) {
        setIpId(extractedIpId)
        setStatus('registered')
        showToast('success', `IP ID extracted from transaction: ${extractedIpId.slice(0, 10)}...`)
        
        // Track activity
        addActivity({
          type: 'ip_registered',
          title: 'IP Asset Registered',
          description: `Extracted IP ID from transaction ${manualTxHash.slice(0, 10)}...`,
          metadata: {
            ipId: extractedIpId,
            transactionHash: manualTxHash,
            prompt,
            imageUrl: generatedImage || undefined,
          },
        })
      } else {
        setError('No IP ID found in transaction. Make sure this is a register IP asset transaction.')
        setStatus('error')
        showToast('error', 'No IP ID found in transaction logs')
      }
    } catch (err: any) {
      logError(err, 'handleExtractIpIdFromTx')
      setError(err.message || 'Failed to extract IP ID from transaction')
      setStatus('error')
      showToast('error', 'Failed to extract IP ID from transaction')
    }
  }

  // Add watermark function - called after registration
  const handleAddWatermark = async () => {
    console.log('[AddWatermark] Starting watermark process...', {
      hasIpId: !!ipId,
      ipId,
      hasGeneratedImageFile: !!generatedImageFile,
      hasGeneratedSvg: !!generatedSvg,
      status,
    })

    // Check if IP ID is available
    if (!ipId) {
      const errorMsg = status === 'registered' 
        ? 'IP ID not found. Please make sure you saved the IP ID after registration.'
        : 'Please register the IP Asset first and save the IP ID before adding watermark'
      showToast('error', errorMsg)
      console.error('[AddWatermark] IP ID not available:', { ipId, status })
      return
    }

    setIsAddingWatermark(true)

    // Check if image file is available - if not, try to convert from SVG
    let imageFileToUse = generatedImageFile
    if (!imageFileToUse) {
      if (generatedSvg) {
        // Try to convert SVG to image file first
        try {
          console.log('[AddWatermark] Converting SVG to image file for watermark...')
          imageFileToUse = await convertSvgToImage(generatedSvg, 1)
          setGeneratedImageFile(imageFileToUse)
          console.log('[AddWatermark] ✅ SVG converted to image file')
        } catch (convertError: any) {
          console.error('[AddWatermark] Failed to convert SVG:', convertError)
          
          // Try with lower scale (1x instead of 2x) as fallback
          try {
            console.log('[AddWatermark] Retrying with lower scale (1x)...')
            imageFileToUse = await convertSvgToImage(generatedSvg, 1)
            setGeneratedImageFile(imageFileToUse)
            console.log('[AddWatermark] ✅ SVG converted with lower scale')
          } catch (retryError: any) {
            console.error('[AddWatermark] Retry with lower scale also failed:', retryError)
            showToast('error', `Failed to convert SVG to image. The SVG may be too complex. Error: ${convertError.message}`)
            setIsAddingWatermark(false)
            return
          }
        }
      } else {
        showToast('error', 'Image file not available. Please regenerate the image.')
        console.error('[AddWatermark] Image file not available:', { generatedImageFile, generatedSvg, generatedImage })
        setIsAddingWatermark(false)
        return
      }
    }

    // Now we should have both ipId and imageFileToUse
    if (!imageFileToUse) {
      showToast('error', 'Failed to prepare image file for watermark')
      setIsAddingWatermark(false)
      return
    }

    try {
      console.log('[AddWatermark] Embedding watermark with IP ID:', ipId)
      console.log('[AddWatermark] Image file info:', {
        name: imageFileToUse.name,
        type: imageFileToUse.type,
        size: imageFileToUse.size,
        lastModified: new Date(imageFileToUse.lastModified).toISOString()
      })
      
      // Embed watermark (includes automatic verification)
      const watermarked = await embedWatermarkInImage(imageFileToUse, ipId)
      
      // Additional verification step (double-check)
      console.log('[AddWatermark] 🔍 Performing additional verification...')
      const verifiedIpId = await extractWatermarkFromImage(watermarked)
      
      if (!verifiedIpId) {
        throw new Error('Watermark verification failed: Could not extract watermark from embedded image')
      }
      
      // Normalize for comparison
      const normalizedOriginal = ipId.toLowerCase().substring(0, 42)
      const normalizedVerified = verifiedIpId.toLowerCase().substring(0, 42)
      
      if (normalizedOriginal !== normalizedVerified) {
        throw new Error(`Watermark verification failed: Original IP ID (${normalizedOriginal}) does not match verified IP ID (${normalizedVerified})`)
      }
      
      // All checks passed - watermark is correctly embedded
      setWatermarkedFile(watermarked)
      setIsWatermarked(true)
      
      // Update preview with watermarked version
      const watermarkedUrl = URL.createObjectURL(watermarked)
      setGeneratedImage(watermarkedUrl)
      
      console.log('[AddWatermark] ✅ Watermark embedded and verified successfully!', {
        ipId: normalizedOriginal,
        verified: true,
        watermarkedFileSize: watermarked.size
      })
      
      showToast('success', '✅ Watermark added and verified! Your image is now protected. You can download it safely.', 5000)
      
      // Track successful watermark addition
      addActivity({
        type: 'watermark_embedded',
        title: 'Watermark Added',
        description: `Watermark with IP ID ${ipId.substring(0, 10)}... successfully embedded and verified`,
      })
    } catch (error: any) {
      console.error('[AddWatermark] Error:', error)
      const errorMessage = error.message || 'Failed to add watermark'
      showToast('error', `❌ ${errorMessage}`, 6000)
      
      // Reset watermark state on error
      setIsWatermarked(false)
      setWatermarkedFile(null)
    } finally {
      setIsAddingWatermark(false)
    }
  }

  const handleDownloadImage = async () => {
    // Only allow download if watermark has been added
    if (!isWatermarked || !watermarkedFile) {
      showToast('error', 'Please add watermark first before downloading. The watermark protects your IP Asset.')
      return
    }

    if (!watermarkedFile) return

    try {
      // Download watermarked PNG file
      const url = URL.createObjectURL(watermarkedFile)
      const link = document.createElement('a')
      link.href = url
      link.download = `storyseal-protected-${ipId?.slice(0, 10)}-${Date.now()}.png`
      document.body.appendChild(link)
      link.click()
      document.body.removeChild(link)
      URL.revokeObjectURL(url)
      showToast('success', '✅ Protected image downloaded! This file contains your IP Asset watermark.')
    } catch (error) {
      console.error('Download error:', error)
      showToast('error', 'Failed to download image')
    }
  }

  return (
    <div className="max-w-6xl mx-auto">
      <motion.div
        initial={{ opacity: 0, y: -20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.6 }}
        className="mb-8"
      >
        <h1 className="text-3xl font-bold text-white mb-2">Create & Register</h1>
        <p className="text-white/90 font-medium">Generate SVG artwork with StorySeal-Engine and register them as IP on Story Protocol</p>
      </motion.div>

      <div className="grid lg:grid-cols-2 gap-6">
        {/* Left: Input Form */}
        <motion.div
          initial={{ opacity: 0, x: -20 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ duration: 0.6, delay: 0.2 }}
          className="space-y-6"
        >
          {/* ABV.dev Info */}
          <div className="glass-card rounded-xl border border-white/10 p-4">
            <h3 className="text-sm font-semibold text-white mb-3">✨ ABV.dev Integration</h3>
            <div className="p-3 bg-blue-500/10 glass-card border border-blue-400/30 rounded-lg">
              <p className="text-xs font-semibold text-white mb-2">✨ ABV.dev Benefits:</p>
              <ul className="text-xs text-white/90 font-medium space-y-1 list-disc list-inside">
                <li>Automatic tracing: Prompt & output tracked in ABV.dev dashboard</li>
                <li>Auto-registration: Register IP assets directly from ABV.dev dashboard</li>
                <li>Story Protocol connector: Built-in integration for seamless IP registration</li>
                <li>Two-step process: Generate in StorySeal → Register in ABV.dev dashboard</li>
              </ul>
              <div className="mt-3 space-y-2">
                <a
                  href="https://app.abv.dev"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center space-x-1 text-xs text-blue-300 hover:text-blue-200 hover:underline mr-3"
                >
                  <ExternalLink className="w-3 h-3" />
                  <span>Go to Connectors → Manage Dashboard (Story Protocol)</span>
                </a>
                <a
                  href="https://app.abv.dev"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center space-x-1 text-xs text-blue-300 hover:text-blue-200 hover:underline"
                >
                  <ExternalLink className="w-3 h-3" />
                  <span>Go to Connectors → Dashboard Story Protocol</span>
                </a>
              </div>
            </div>
          </div>

          {/* Mode Toggle */}

          {/* Prompt Templates & History */}
          <div className="glass-card rounded-xl border border-white/10 p-4">
            <div className="flex items-center space-x-2">
              <button
                onClick={() => setShowTemplates(!showTemplates)}
                className="flex-1 px-4 py-2 glass text-white/90 font-medium rounded-lg hover:bg-white/10 transition-colors text-sm"
              >
                <SparklesIcon className="w-4 h-4 inline mr-2" />
                Templates
              </button>
              {promptHistory.length > 0 && (
                <button
                  onClick={() => {
                    const history = promptHistory[0]
                    setPrompt(history)
                    showToast('info', 'Prompt loaded from history')
                  }}
                  className="px-4 py-2 glass text-white/90 font-medium rounded-lg hover:bg-white/10 transition-colors text-sm"
                >
                  <History className="w-4 h-4 inline mr-2" />
                  History
                </button>
              )}
            </div>

            {/* Templates Modal */}
            {showTemplates && (
              <div className="mt-4 p-4 glass rounded-lg border border-white/10 max-h-96 overflow-y-auto">
                <div className="mb-4">
                  <input
                    type="text"
                    value={templateSearch}
                    onChange={(e) => setTemplateSearch(e.target.value)}
                    placeholder="Search templates..."
                    className="w-full px-3 py-2 border border-gray-300 border-white/20/50 rounded-lg glass-card text-white text-sm"
                  />
                </div>
                <div className="mb-4 flex flex-wrap gap-2">
                  {PROMPT_CATEGORIES.map((cat) => (
                    <button
                      key={cat}
                      onClick={() => setSelectedCategory(cat)}
                      className={`px-3 py-1 rounded-full text-xs font-medium transition-colors ${
                        selectedCategory === cat
                          ? 'bg-indigo-600 text-white'
                          : 'glass-card text-white/90 font-medium border border-white/20'
                      }`}
                    >
                      {cat}
                    </button>
                  ))}
                </div>
                <div className="space-y-2">
                  {filteredTemplates.map((template) => (
                    <button
                      key={template.id}
                      onClick={() => useTemplate(template)}
                      className="w-full text-left p-3 glass-card rounded-lg border border-white/10 hover:border-indigo-400 transition-colors"
                    >
                      <div className="font-semibold text-sm text-white">{template.name}</div>
                      <div className="text-xs text-white/80 font-medium mt-1">{template.description}</div>
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>

          {/* Story Protocol Registration Info - ABV.dev Flow */}
          <div className="bg-indigo-500/10 glass-card border border-indigo-400/30 rounded-xl p-4">
            <div className="flex items-start space-x-3">
              <Shield className="w-5 h-5 text-indigo-400 mt-0.5 flex-shrink-0" />
              <div className="flex-1">
                <h3 className="text-sm font-semibold text-white mb-2">
                  📚 Using Official Story Protocol Method (ABV.dev)
                </h3>
                <p className="text-xs text-white/90 font-medium mb-2">
                  Following <a href="https://docs.story.foundation/developers/typescript-sdk/register-ip-asset" target="_blank" rel="noopener noreferrer" className="underline text-indigo-300 hover:text-indigo-200 font-semibold">official Story Protocol documentation</a> for IP asset registration with automatic tracing via ABV.dev.
                </p>
                <div className="glass-card rounded-lg p-3 mb-2 border border-indigo-400/20">
                  <p className="text-xs font-bold text-white mb-2">💡 ABV.dev Registration Process:</p>
                  <ol className="text-xs text-white/90 font-medium space-y-1 list-decimal list-inside">
                    <li>Enter your prompt in the input field below</li>
                    <li>Go to <a href="https://app.abv.dev" target="_blank" rel="noopener noreferrer" className="underline text-indigo-300 hover:text-indigo-200 font-semibold">ABV.dev</a> and log in to your account</li>
                    <li>Navigate to <strong>Connectors</strong> in the sidebar</li>
                    <li>Click <strong>"Manage Dashboard"</strong> for Story Protocol</li>
                    <li>Activate the <strong>Story Protocol</strong> connector if not already enabled</li>
                    <li>Return to StorySeal and generate your image using the prompt</li>
                    <li>After generation, go back to ABV.dev dashboard → <strong>Connectors</strong> → <strong>Dashboard Story Protocol</strong></li>
                    <li>You should see <strong>2 items</strong> appear (trace and output)</li>
                    <li>Click the <strong>"Register"</strong> button and wait for the registration to complete</li>
                    <li>Copy the <strong>IP Asset ID</strong> from the dashboard and paste it in the input field below (optional - for tracking)</li>
                  </ol>
                </div>
                <p className="text-xs text-white/90 font-medium">
                  <strong className="font-bold">Required:</strong> Pinata credentials for IPFS upload. Configure in <a href="/dashboard/settings" className="underline text-indigo-300 hover:text-indigo-200 font-semibold">Settings page</a>.
                </p>
              </div>
            </div>
          </div>

          {/* Removed Gemini AI Flow */}
          {false && (
            <div className="bg-indigo-500/10 glass-card border border-indigo-400/30 rounded-xl p-4">
              <div className="flex items-start space-x-3">
                <Shield className="w-5 h-5 text-indigo-400 mt-0.5 flex-shrink-0" />
                <div className="flex-1">
                  <h3 className="text-sm font-semibold text-white mb-2">
                    📚 Using Official Story Protocol Method (Gemini AI)
                  </h3>
                  <p className="text-xs text-white/90 font-medium mb-2">
                    Following <a href="https://docs.story.foundation/developers/typescript-sdk/register-ip-asset" target="_blank" rel="noopener noreferrer" className="underline text-indigo-300 hover:text-indigo-200 font-semibold">official Story Protocol documentation</a> for manual IP asset registration via StorySeal.
                  </p>
                  <div className="glass-card rounded-lg p-3 mb-2 border border-indigo-400/20">
                    <p className="text-xs font-bold text-white mb-2">💡 Gemini AI Registration Process:</p>
                    <ol className="text-xs text-white/90 font-medium space-y-1 list-decimal list-inside">
                      <li>Enter your prompt for image generation</li>
                      <li>Generate image using Gemini AI</li>
                      <li>Verify the generated image looks correct</li>
                      <li>Click "Register as IP Asset" button below</li>
                      <li>Upload metadata to IPFS (Pinata)</li>
                      <li>Register on Story Protocol blockchain</li>
                      <li>Get IP Asset ID from transaction</li>
                    </ol>
                  </div>
                  <p className="text-xs text-white/90 font-medium">
                    <strong className="font-bold">Required:</strong> Pinata credentials for IPFS upload. Configure in <a href="/dashboard/settings" className="underline text-indigo-300 hover:text-indigo-200 font-semibold">Settings page</a>.
                  </p>
                </div>
              </div>
            </div>
          )}

          {/* IP Asset Name Input */}
          <div className="glass-card rounded-xl border border-white/10 p-6">
            <label className="block text-sm font-semibold text-white mb-3">
              IP Asset Name <span className="text-white/60 font-normal">(Optional)</span>
            </label>
            <input
              type="text"
              value={ipAssetName}
              onChange={(e) => setIpAssetName(e.target.value)}
              placeholder="e.g., My Cybernetic Cat Logo, Abstract Art #1, etc."
              className="w-full px-4 py-3 border border-white/20 rounded-lg glass-card text-white font-medium placeholder-white/50 focus:ring-2 focus:ring-indigo focus:border-transparent outline-none"
              disabled={status === 'generating' || status === 'registering' || status === 'recovering'}
            />
            <p className="mt-2 text-xs text-white/60">
              Give your IP Asset a name to easily identify it in "My IP Assets" page
            </p>
          </div>

          {/* License Type Selection */}
          <div className="glass-card rounded-xl border border-white/10 p-6">
              <label className="block text-sm font-semibold text-white mb-3">
                License Type <span className="text-white/60 font-normal">(Optional)</span>
              </label>
              <select
                value={licenseType}
                onChange={(e) => setLicenseType(e.target.value as 'nonCommercial' | 'none')}
                className="w-full px-4 py-3 border border-white/20 rounded-lg glass-card text-white font-medium focus:ring-2 focus:ring-indigo focus:border-transparent outline-none bg-gray-900/95"
                style={{ 
                  color: 'white',
                  backgroundColor: 'rgba(17, 24, 39, 0.95)'
                }}
                disabled={status === 'generating' || status === 'registering' || status === 'recovering'}
              >
                <option value="none" style={{ backgroundColor: 'rgba(17, 24, 39, 0.95)', color: 'white' }}>No License (Register Only)</option>
                <option value="nonCommercial" style={{ backgroundColor: 'rgba(17, 24, 39, 0.95)', color: 'white' }}>Non-Commercial Social Remixing (Free)</option>
              </select>
              <p className="mt-2 text-xs text-white/60">
                {licenseType === 'none' && 'Register IP Asset without license. You can add license later in Licenses page.'}
                {licenseType === 'nonCommercial' && '✅ Free license - No currency token needed. Allows non-commercial social remixing.'}
              </p>
          </div>

          {/* Prompt Input */}
          <div className="glass-card rounded-xl border border-white/10 p-6">
              <label className="block text-sm font-semibold text-white mb-3">
                AI Prompt
              </label>
              <textarea
                value={prompt}
                onChange={(e) => setPrompt(e.target.value)}
                placeholder="Describe the SVG artwork you want to generate... e.g., 'Create a logo of a cybernetic cat with neon blue eyes, dark background'"
                className="w-full h-32 px-4 py-3 border border-white/20 rounded-lg glass-card text-white font-medium placeholder-white/50 focus:ring-2 focus:ring-indigo focus:border-transparent outline-none resize-none"
                disabled={status === 'generating' || status === 'registering' || status === 'recovering'}
              />
              <div className="mt-3 flex items-center justify-between text-xs text-white/80 font-medium">
                <span>Powered by StorySeal-Engine (GPT-4 via ABV.dev)</span>
                <span>{prompt.length} characters</span>
              </div>
              
              {/* Info about automatic tracing */}
              {prompt.trim() && (
                <div className="mt-3 p-2 bg-blue-500/10 glass-card border border-blue-400/30 rounded-lg">
                  <p className="text-xs text-white/90 font-medium">
                    💡 <strong className="font-bold">Automatic Tracing:</strong> Your prompt will be automatically traced to ABV.dev dashboard when you generate an image. 
                    <strong className="text-white"> Before generating:</strong> Go to <a href="https://app.abv.dev" target="_blank" rel="noopener noreferrer" className="underline text-blue-300 hover:text-blue-200 font-semibold">ABV.dev</a> → <strong>Connectors</strong> (sidebar) → Click <strong>"Manage Dashboard"</strong> for Story Protocol → Activate the connector. 
                    After generation, go to <strong>Connectors</strong> → <strong>Dashboard Story Protocol</strong> in ABV.dev to register your asset.
                  </p>
                </div>
              )}
            </div>


          {/* Generate Button */}
          <button
            onClick={handleGenerate}
            disabled={
              !prompt.trim() ||
              status === 'generating' ||
              status === 'registering'
            }
            className="w-full flex items-center justify-center space-x-2 px-6 py-4 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 active:bg-indigo-800 transition-all disabled:opacity-60 disabled:cursor-not-allowed disabled:hover:bg-indigo-600 font-medium shadow-lg shadow-indigo-500/40 border-2 border-indigo-500 hover:border-indigo-400 disabled:border-indigo-600"
          >
            {status === 'generating' ? (
              <>
                <Loader2 className="w-5 h-5 animate-spin" />
                <span>Generating...</span>
              </>
            ) : (
              <>
                <Sparkles className="w-5 h-5" />
                <span>Generate Image</span>
              </>
            )}
          </button>


          {/* Status Card */}
          {status !== 'idle' && (
            <motion.div
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              className={`rounded-xl border p-6 ${
                status === 'error'
                  ? 'bg-red-500/10 border-red-400/30'
                  : 'glass-card border-white/10'
              }`}
            >
              <div className="flex items-center space-x-3 mb-4">
                {status === 'generating' && (
                  <>
                    <Loader2 className="w-5 h-5 text-indigo-400 animate-spin" />
                    <div>
                      <span className="text-sm font-medium text-white block">Generating AI image...</span>
                      <span className="text-xs text-white/80 font-medium">This may take a few moments</span>
                    </div>
                  </>
                )}
                {status === 'generated' && (
                  <>
                    <CheckCircle className="w-5 h-5 text-green-300" />
                    <div>
                      <span className="text-sm font-bold text-white block">SVG artwork generated successfully!</span>
                      <span className="text-xs text-white/80 font-medium">Ready to register as IP asset</span>
                    </div>
                  </>
                )}
                {status === 'registering' && (
                  <>
                    <Loader2 className="w-5 h-5 text-indigo-400 animate-spin" />
                    <div>
                      <span className="text-sm font-bold text-white block">Registering to Story Protocol...</span>
                      <span className="text-xs text-white/80 font-medium">Embedding watermark and registering on-chain</span>
                    </div>
                  </>
                )}
                {status === 'recovering' && (
                  <>
                    <Loader2 className="w-5 h-5 text-yellow-400 animate-spin" />
                    <div>
                      <span className="text-sm font-bold text-yellow-400 block">Auto-Recovering IP Asset...</span>
                      <span className="text-xs text-yellow-200 font-medium">Transaction may have succeeded. Searching for IP ID...</span>
                    </div>
                  </>
                )}
                {status === 'registered' && (
                  <>
                    <Shield className="w-5 h-5 text-green-300" />
                    <div>
                      <span className="text-sm font-bold text-white block">Registered as IP!</span>
                      <span className="text-xs text-white/80 font-medium">Your image is now protected</span>
                    </div>
                  </>
                )}
                {status === 'error' && (
                  <>
                    <AlertCircle className="w-5 h-5 text-red-400" />
                    <div>
                      <span className="text-sm font-medium text-red-400 block">Error occurred</span>
                      <span className="text-xs text-red-300">Please try again or check your configuration</span>
                    </div>
                  </>
                )}
              </div>
              {error && (
                <div className="mt-3 p-3 bg-red-500/10 rounded-lg">
                  <p className="text-sm text-red-300 font-medium mb-2 whitespace-pre-line">{error}</p>
                  
                  {/* Show trace ID and dashboard links if available */}
                  {(traceId || error.includes('ABV.dev') || error.includes('Story Protocol')) && (
                    <div className="mt-3 p-3 bg-blue-500/10 border border-blue-400/30 rounded-lg">
                      <p className="text-xs font-semibold text-white mb-2">
                        🔗 Quick Links to Check IP Assets:
                      </p>
                      <div className="space-y-2">
                        {traceId && (
                          <a
                            href={`https://app.abv.dev/traces/${traceId}`}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="block text-xs text-blue-300 hover:text-blue-200 underline"
                          >
                            📊 View Trace: {traceId.slice(0, 20)}...
                          </a>
                        )}
                        <a
                          href="https://app.abv.dev/connectors"
                          target="_blank"
                          rel="noopener noreferrer"
                          className="block text-xs text-blue-300 hover:text-blue-200 underline"
                        >
                          🔗 Story Protocol Connector Dashboard
                        </a>
                        <a
                          href="https://app.abv.dev/traces"
                          target="_blank"
                          rel="noopener noreferrer"
                          className="block text-xs text-blue-300 hover:text-blue-200 underline"
                        >
                          📈 Recent Traces
                        </a>
                      </div>
                      {traceId && (
                        <p className="text-xs text-white/70 mt-2">
                          💡 According to <a href="https://docs.abv.dev/developer/prompt-management/link-prompts-to-traces" target="_blank" rel="noopener noreferrer" className="underline text-blue-300">ABV.dev docs</a>, IP ID might be in trace metadata. Check the trace above.
                        </p>
                      )}
                    </div>
                  )}
                  
                  {error.includes('API key') && (
                    <p className="text-xs text-red-300 mt-2">
                      Please set NEXT_PUBLIC_ABV_API_KEY in your environment variables
                    </p>
                  )}
                  {(error.includes('Contract') || error.includes('reverted') || error.includes('0x3bdad64c')) && (
                    <div className="mt-2 space-y-2 text-xs text-red-300">
                      <p className="font-semibold">Troubleshooting:</p>
                      <ul className="list-disc list-inside space-y-1 ml-2">
                        <li>Check your IP token balance (get from faucet if needed)</li>
                        <li>Verify network connection and RPC endpoint</li>
                        <li>Check Tenderly dashboard for detailed error logs</li>
                        <li>Try again in a few moments</li>
                        <li>SPG NFT contract may need to be recreated</li>
                      </ul>
                      <div className="mt-3 p-3 bg-yellow-500/10 border border-yellow-400/30 rounded-lg">
                        <p className="text-xs font-semibold text-yellow-300 mb-2">
                          🔧 Try This: Clear SPG NFT Contract
                        </p>
                        <p className="text-xs text-yellow-200 mb-2">
                          If contract revert persists, the SPG NFT contract may have state issues. Try clearing it to force creation of a new one.
                        </p>
                        <div className="space-y-2">
                          <div className="flex space-x-2">
                            <button
                              onClick={() => {
                                if (typeof window !== 'undefined') {
                                  localStorage.removeItem('storyseal_spg_nft_contract')
                                  showToast('success', 'SPG NFT contract cleared. Will try public contract or create new one on next registration.')
                                  setError(null)
                                  setStatus('generated')
                                }
                              }}
                              className="px-3 py-1.5 text-xs bg-yellow-600 text-white rounded-lg hover:bg-yellow-700 transition-colors font-medium"
                            >
                              Clear & Use Public Contract
                            </button>
                            <button
                              onClick={() => {
                                if (typeof window !== 'undefined') {
                                  localStorage.setItem('storyseal_force_clear_contract', 'true')
                                  localStorage.removeItem('storyseal_spg_nft_contract')
                                  showToast('success', 'Force clear enabled. Will create brand new contract on next registration.')
                                  setError(null)
                                  setStatus('generated')
                                }
                              }}
                              className="px-3 py-1.5 text-xs bg-red-600 text-white rounded-lg hover:bg-red-700 transition-colors font-medium"
                            >
                              Force Create New
                            </button>
                          </div>
                          <p className="text-xs text-white/90 mt-2">
                            💡 <strong className="text-white">Tip:</strong> Unverified contract in Tenderly may cause this error. 
                            <br />
                            • <strong className="text-white">Clear & Use Public:</strong> Use public verified contract (more reliable)
                            <br />
                            • <strong className="text-white">Force Create New:</strong> Create new contract (may be more compatible with Tenderly)
                          </p>
                          {typeof window !== 'undefined' && localStorage.getItem('storyseal_spg_nft_contract') && (
                            <a
                              href={`https://dashboard.tenderly.co/storyseal/contract/virtual/${localStorage.getItem('storyseal_spg_nft_contract')}`}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="text-xs text-indigo-300 hover:text-indigo-200 hover:underline inline-flex items-center space-x-1"
                            >
                              <ExternalLink className="w-3 h-3" />
                              <span>View Contract in Tenderly →</span>
                            </a>
                          )}
                        </div>
                      </div>
                      <p className="mt-2">
                        <a 
                          href="https://openchain.xyz/signatures?query=0x3bdad64c" 
                          target="_blank" 
                          rel="noopener noreferrer"
                          className="text-white/90 hover:text-red-300 underline"
                        >
                          Look up error signature →
                        </a>
                      </p>
                      
                      {/* Manual Transaction Hash Input */}
                      {(transactionHash || manualTxHash) && (
                        <div className="mt-3 p-3 bg-blue-500/10 border border-blue-400/30 rounded-lg">
                          <p className="text-xs font-semibold text-white mb-2">
                            💡 Transaction succeeded in Tenderly? Extract IP ID from transaction hash:
                          </p>
                          <div className="mb-2 p-2 bg-yellow-500/10 border border-yellow-400/30 rounded text-xs text-white/90">
                            <strong className="text-white">⚠️ Important:</strong> Make sure you use the correct <strong className="text-white">transaction hash</strong> from Tenderly dashboard, not metadata hash. Transaction hash can be found in Tenderly transaction detail page.
                          </div>
                          <div className="flex space-x-2">
                            <input
                              type="text"
                              value={manualTxHash || transactionHash || ''}
                              onChange={(e) => setManualTxHash(e.target.value)}
                              placeholder="0x... (transaction hash from Tenderly)"
                              className="flex-1 px-3 py-2 border border-white/20 rounded-lg glass-card text-white text-xs font-mono placeholder-white/50"
                            />
                            <button
                              onClick={handleExtractIpIdFromTx}
                              className="px-3 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 transition-colors text-xs font-medium"
                            >
                              Extract IP ID
                            </button>
                          </div>
                          {transactionHash && (
                            <p className="text-xs text-white/90 mt-2">
                              <strong className="text-white">Note:</strong> Detected hash: {transactionHash.slice(0, 20)}... 
                              <br />
                              If this is not the correct transaction hash, copy from Tenderly dashboard.
                            </p>
                          )}
                          <p className="text-xs text-white/90 mt-2">
                            <strong className="text-white">How to find transaction hash:</strong>
                            <br />
                            1. Open Tenderly dashboard
                            <br />
                            2. Find the latest transaction from your wallet
                            <br />
                            3. Find the transaction that calls <code className="bg-white/10 text-white px-1 rounded border border-white/20">mintAndRegisterIp</code>
                            <br />
                            4. Copy transaction hash from transaction detail page
                          </p>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              )}
            </motion.div>
          )}

          {/* ABV.dev Flow: Output Input & Dashboard Link */}
          {status === 'generated' && generatedImage && !ipId && (
            <motion.div
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              className="bg-white glass-card rounded-xl border border-gray-200 border-white/10 p-6"
            >
              <h3 className="text-lg font-semibold text-white mb-4">
                Register via ABV.dev Dashboard
              </h3>
              
              <div className="mb-4 p-4 bg-green-500/10 border border-green-400/30 rounded-lg">
                <p className="text-sm font-semibold text-white mb-2">
                  ✅ Auto-Tracing Active
                </p>
                <p className="text-xs text-white/90 mb-3">
                  Your prompt and output are automatically traced to ABV.dev dashboard. Make sure you have activated the Story Protocol connector in ABV.dev before generating images.
                </p>
                {traceId && (
                  <div className="mb-3">
                    <p className="text-xs text-white/90 mb-2">
                      <strong className="text-white">Trace ID:</strong> <code className="bg-white/10 text-white px-2 py-1 rounded font-mono text-xs border border-white/20">{traceId}</code>
                    </p>
                    <a
                      href={`https://app.abv.dev/traces/${traceId}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center space-x-1 text-xs text-indigo-300 hover:text-indigo-200 hover:underline"
                    >
                      <ExternalLink className="w-3 h-3" />
                      <span>View Trace in Dashboard</span>
                    </a>
                  </div>
                )}
                <a
                  href="https://app.abv.dev"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center space-x-2 px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 transition-colors text-sm font-medium"
                >
                  <ExternalLink className="w-4 h-4" />
                  <span>Go to Connectors → Dashboard Story Protocol</span>
                </a>
              </div>

              <div className="mb-4 p-4 bg-blue-500/10 border border-blue-400/30 rounded-lg">
                <p className="text-xs font-semibold text-white mb-2">
                  📋 Steps to Register via ABV.dev Dashboard:
                </p>
                <ol className="text-xs text-white/90 list-decimal list-inside space-y-1">
                  <li>Go to <a href="https://app.abv.dev" target="_blank" rel="noopener noreferrer" className="underline text-indigo-300 hover:text-indigo-200 font-semibold">ABV.dev</a> and log in</li>
                  <li>Navigate to <strong>Connectors</strong> in the sidebar</li>
                  <li>Click <strong>"Manage Dashboard"</strong> for Story Protocol</li>
                  <li>Activate the <strong>Story Protocol</strong> connector if not already enabled</li>
                  <li>Return to StorySeal and generate your image</li>
                  <li>Go to ABV.dev dashboard → <strong>Connectors</strong> → <strong>Dashboard Story Protocol</strong></li>
                  <li>You should see <strong>2 items</strong> (trace and output)</li>
                  <li>Click the <strong>"Register"</strong> button and wait for completion</li>
                  <li>Copy the <strong>IP Asset ID</strong> from the dashboard</li>
                  <li>Paste it in the input field below (optional - for tracking in StorySeal)</li>
                </ol>
                <p className="text-xs text-white/90 mt-2">
                  ⚠️ <strong className="text-white">Important:</strong> Make sure Story Protocol connector is activated in ABV.dev Connectors (via Manage Dashboard) before generating images. Use ABV.dev dashboard for registration, not the manual registration button here.
                </p>
              </div>

              <div className="space-y-4">
                {/* Input 1: Trace ID (Input Prompt) */}
                <div>
                  <label className="block text-sm font-medium text-white/90 mb-2">
                    Trace ID (Input Prompt)
                  </label>
                  <input
                    type="text"
                    value={abvTraceIdInput}
                    onChange={(e) => setAbvTraceIdInput(e.target.value)}
                    placeholder="Paste Trace ID from ABV.dev dashboard (for input prompt)"
                    className="w-full px-4 py-2 border border-white/20 rounded-lg glass-card text-white text-sm placeholder-white/50"
                  />
                  <p className="text-xs text-white/70 mt-1">
                    Optional: Paste the Trace ID for the input prompt from ABV.dev dashboard
                  </p>
                </div>

                {/* Input 2: Output IP ID */}
                <div>
                  <label className="block text-sm font-medium text-white/90 mb-2">
                    Output IP ID
                  </label>
                  <input
                    type="text"
                    value={abvOutputId}
                    onChange={(e) => setAbvOutputId(e.target.value)}
                    placeholder="Paste IP Asset ID from ABV.dev dashboard (for output)"
                    className="w-full px-4 py-2 border border-white/20 rounded-lg glass-card text-white text-sm placeholder-white/50"
                  />
                  <p className="text-xs text-white/70 mt-1">
                    Optional: Paste the IP Asset ID for the output from ABV.dev dashboard
                  </p>
                </div>

                {(abvTraceIdInput || abvOutputId) && (
                  <button
                    onClick={() => {
                      if (abvTraceIdInput) {
                        setTraceId(abvTraceIdInput)
                      }
                      if (abvOutputId) {
                        // Save to localStorage for manual IP assets
                        const manualAssetsKey = `storyseal_manual_ip_assets_${address}`
                        const existingAssets = JSON.parse(localStorage.getItem(manualAssetsKey) || '[]')
                        
                        // Check if already exists
                        if (!existingAssets.some((a: any) => a.id === abvOutputId.trim())) {
                          // Add new manual IP asset
                          const newAsset = {
                            id: abvOutputId.trim(),
                            name: ipAssetName.trim() || `IP Asset ${abvOutputId.trim().slice(0, 10)}...`,
                            owner: address,
                            registeredAt: new Date().toISOString(),
                            metadata: {
                              tokenId: null,
                              traceId: abvTraceIdInput.trim() || null,
                              prompt: prompt || null,
                              provider: 'abv',
                              method: 'abv-dev-manual-input',
                              // Save image URL if available
                              image: generatedImage || null,
                              mediaUrl: generatedImage || null,
                              thumbnail: generatedImage || null,
                            },
                          }
                          
                          existingAssets.push(newAsset)
                          localStorage.setItem(manualAssetsKey, JSON.stringify(existingAssets))
                          console.log('[ABV Manual] ✅ Saved IP asset to localStorage')
                        }
                        
                        setIpId(abvOutputId.trim())
                        setStatus('registered') // Set status to registered so watermark section appears
                        setIsWatermarked(false) // Reset watermark state when new IP ID is set
                        setWatermarkedFile(null) // Clear previous watermarked file
                        setIsAutoRegistered(true) // Mark as auto-registered via ABV.dev
                        
                        // Ensure generatedImageFile is available for watermark
                        if (!generatedImageFile && generatedSvg) {
                          console.log('[ABV Manual] Converting SVG to image file for watermark...')
                          convertSvgToImage(generatedSvg, 1)
                            .then((imageFile) => {
                              setGeneratedImageFile(imageFile)
                              console.log('[ABV Manual] ✅ Image file ready for watermark')
                            })
                            .catch((error) => {
                              console.warn('[ABV Manual] Failed to convert SVG for watermark:', error)
                            })
                        }
                        
                        // Invalidate queries to refresh My IP Assets and Dashboard
                        if (address) {
                          queryClient.invalidateQueries({ queryKey: ['ip-assets', 'owner', address] })
                          queryClient.invalidateQueries({ queryKey: ['ip-assets'] })
                          console.log('[Save IDs] ✅ Invalidated IP assets queries - My IP Assets will refresh')
                        }
                        
                        // Track activity
                        addActivity({
                          type: 'ip_registered',
                          title: 'IP Asset Registered (ABV.dev)',
                          description: `Registered IP Asset ${abvOutputId.slice(0, 10)}...${abvOutputId.slice(-8)} via ABV.dev`,
                          metadata: {
                            ipId: abvOutputId,
                            method: 'abv-dev-auto',
                            traceId: abvTraceIdInput || undefined,
                          },
                        })
                      }
                      showToast('success', '✅ IP Asset saved! It will appear in My IP Assets now.')
                    }}
                    className="w-full px-4 py-2 bg-indigo-600 dark:bg-indigo-500 text-white rounded-lg hover:bg-indigo-700 dark:hover:bg-indigo-600 transition-colors text-sm font-medium"
                  >
                    Save IDs & Sync to My IP Assets
                  </button>
                )}
              </div>
            </motion.div>
          )}

          {/* Removed Gemini AI Flow */}
          {false && status === 'generated' && generatedImage && !ipId && (
            <motion.div
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              className="bg-white glass-card rounded-xl border border-gray-200 border-white/10 p-6"
            >
              <h3 className="text-lg font-semibold text-white mb-4">
                Verify & Register as IP Asset
              </h3>
              
              <div className="mb-4 p-4 bg-yellow-500/10 border border-yellow-400/30 rounded-lg">
                <p className="text-sm font-semibold text-white mb-2">
                  ⚠️ Manual Registration Required
                </p>
                <p className="text-xs text-white/90">
                  Gemini AI requires manual verification and registration. You can either register via button below or manually input trace ID and output IP ID.
                </p>
              </div>

              <div className="mb-4 p-4 bg-blue-500/10 border border-blue-400/30 rounded-lg">
                <p className="text-xs font-semibold text-white mb-2">
                  📋 Registration Process:
                </p>
                <ol className="text-xs text-white/90 list-decimal list-inside space-y-1">
                  <li>Verify the generated image looks correct</li>
                  <li>Option 1: Click "Register as IP Asset" below (automatic)</li>
                  <li>Option 2: Manually input trace ID and output IP ID below</li>
                  <li>After registration, IP Asset will appear in "My IP Assets"</li>
                </ol>
              </div>

              {/* Manual Input Section */}
              <div className="mb-4 space-y-4">
                <div>
                  <label className="block text-sm font-medium text-white/70 mb-2">
                    Trace ID (Input Prompt) - Optional
                  </label>
                  <input
                    type="text"
                    value={geminiTraceIdInput}
                    onChange={(e) => setGeminiTraceIdInput(e.target.value)}
                    placeholder="Paste Trace ID (optional)"
                    className="w-full px-4 py-2 border border-white/20 rounded-lg glass-card text-white text-sm"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-white/70 mb-2">
                    Output IP ID <span className="text-red-400">*</span>
                  </label>
                  <input
                    type="text"
                    value={geminiOutputId}
                    onChange={(e) => setGeminiOutputId(e.target.value)}
                    placeholder="Paste IP Asset ID (required)"
                    className="w-full px-4 py-2 border border-white/20 rounded-lg glass-card text-white text-sm"
                  />
                  <p className="text-xs text-white/60 mt-1">
                    Paste the IP Asset ID from your registration transaction
                  </p>
                </div>

                {geminiOutputId && (
                  <button
                    onClick={() => {
                      if (!geminiOutputId.trim()) {
                        showToast('error', 'Please enter Output IP ID')
                        return
                      }

                      // Save to localStorage for manual IP assets
                      const manualAssetsKey = `storyseal_manual_ip_assets_${address}`
                      const existingAssets = JSON.parse(localStorage.getItem(manualAssetsKey) || '[]')
                      
                      // Check if already exists
                      if (existingAssets.some((a: any) => a.id === geminiOutputId.trim())) {
                        showToast('info', 'This IP Asset is already saved')
                        return
                      }

                      // Add new manual IP asset
                      const newAsset = {
                        id: geminiOutputId.trim(),
                        name: ipAssetName.trim() || `IP Asset ${geminiOutputId.trim().slice(0, 10)}...`,
                        owner: address,
                        registeredAt: new Date().toISOString(),
                        metadata: {
                          tokenId: null,
                          traceId: geminiTraceIdInput.trim() || null,
                          prompt: prompt || null,
                          provider: 'gemini',
                          method: 'manual-input',
                          // Save image URL if available
                          image: generatedImage || null,
                          mediaUrl: generatedImage || null,
                          thumbnail: generatedImage || null,
                        },
                      }
                      
                      existingAssets.push(newAsset)
                      localStorage.setItem(manualAssetsKey, JSON.stringify(existingAssets))
                      
                      // Update state
                      setIpId(geminiOutputId.trim())
                      setStatus('registered')
                      setIsAutoRegistered(true)
                      
                      // Reset watermark state - user needs to add watermark after registration
                      setIsWatermarked(false)
                      setWatermarkedFile(null)
                      
                      // Invalidate queries to refresh My IP Assets
                      if (address) {
                        queryClient.invalidateQueries({ queryKey: ['ip-assets', 'owner', address] })
                        queryClient.invalidateQueries({ queryKey: ['ip-assets'] })
                        console.log('[Gemini Manual] ✅ Saved IP asset to localStorage and invalidated queries')
                      }
                      
                      // Track activity
                      addActivity({
                        type: 'ip_registered',
                        title: 'IP Asset Registered (Manual)',
                        description: `Registered IP Asset ${geminiOutputId.trim().slice(0, 10)}...${geminiOutputId.trim().slice(-8)} via manual input`,
                        metadata: {
                          ipId: geminiOutputId.trim(),
                          method: 'gemini-manual-input',
                          traceId: geminiTraceIdInput.trim() || undefined,
                        },
                      })
                      
                      showToast('success', '✅ IP Asset saved! Now add watermark to protect your asset.', 5000)
                    }}
                    className="w-full px-4 py-2 bg-green-600 dark:bg-green-500 text-white rounded-lg hover:bg-green-700 dark:hover:bg-green-600 transition-colors text-sm font-medium"
                  >
                    Save IP Asset to My IP Assets
                  </button>
                )}
              </div>
              
              <div className="border-t border-white/10 pt-4 mt-4">
                <p className="text-xs text-white/60 mb-3 text-center">OR</p>
                <button
                  onClick={handleRegister}
                  disabled={status === 'registering' || !isConnected || !storyService}
                  className="w-full px-6 py-3 bg-indigo-600 dark:bg-indigo-500 text-white rounded-lg hover:bg-indigo-700 dark:hover:bg-indigo-600 transition-colors font-medium disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center space-x-2"
                >
                  {status === 'registering' ? (
                    <>
                      <Loader2 className="w-5 h-5 animate-spin" />
                      <span>Registering IP Asset...</span>
                    </>
                  ) : (
                    <>
                      <Shield className="w-5 h-5" />
                      <span>Register as IP Asset (Automatic)</span>
                    </>
                  )}
                </button>
              </div>
              
              {!isConnected && (
                <p className="text-xs text-white/70 mt-2 text-center">
                  Please connect your wallet to register IP assets
                </p>
              )}
              
              {isConnected && isWalletClientLoading && (
                <p className="text-xs text-white/90 mt-2 text-center">
                  ⏳ Waiting for wallet to be ready...
                </p>
              )}
              
              {isConnected && !isWalletClientLoading && !walletClient?.account && (
                <p className="text-xs text-yellow-300 mt-2 text-center">
                  ⚠️ Wallet account not available. Please reconnect your wallet.
                </p>
              )}
            </motion.div>
          )}

          {/* Registered Success Card */}
          {status === 'registered' && ipId && (
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              className="bg-green-50 dark:bg-green-900/20 rounded-xl border border-green-200 dark:border-green-800 p-6"
            >
              <div className="flex items-center space-x-3 mb-4">
                <CheckCircle className="w-6 h-6 text-green-300" />
                <h3 className="text-lg font-semibold text-white">
                  Successfully Registered!
                </h3>
              </div>
              <p className="text-sm text-white/90 mb-4">
                Your generated content has been registered as an IP asset on Story Protocol with invisible watermark protection. The prompt is included as metadata within the IP asset.
              </p>
              
              {/* ABV.dev Registration Info */}
              {(
                <div className="mb-4 p-4 bg-green-500/10 border border-green-400/30 rounded-lg">
                  <div className="flex items-start space-x-2 mb-2">
                    <div className="flex-shrink-0 w-6 h-6 rounded-full bg-green-500/20 flex items-center justify-center mt-0.5">
                      <span className="text-xs font-bold text-white">ABV</span>
                    </div>
                    <div className="flex-1">
                      <p className="text-xs font-semibold text-white mb-1">
                        ✅ Registered via ABV.dev Dashboard
                      </p>
                      <p className="text-xs text-white/90 mb-2">
                        This IP asset was registered through ABV.dev's Story Protocol integration. Your prompt and generated image were automatically traced.
                      </p>
                      {traceId && (
                        <p className="text-xs text-white/90">
                          💡 <strong className="text-white">View in dashboard:</strong> 
                          <a href={`https://app.abv.dev/traces/${traceId}`} target="_blank" rel="noopener noreferrer" className="text-indigo-300 hover:text-indigo-200 underline ml-1">View Trace</a> | 
                          <a href="https://app.abv.dev" target="_blank" rel="noopener noreferrer" className="text-indigo-300 hover:text-indigo-200 underline ml-1">Connectors → Dashboard Story Protocol</a>
                        </p>
                      )}
                    </div>
                  </div>
                </div>
              )}
              
              {/* Add Watermark Section - Show after registration (for both ABV.dev and Gemini) */}
              {!isWatermarked && ipId && (
                <div className="mb-4 p-4 bg-yellow-500/10 border-2 border-yellow-400/50 rounded-lg">
                  <div className="flex items-start space-x-3">
                    <Shield className="w-5 h-5 text-yellow-300 flex-shrink-0 mt-0.5" />
                    <div className="flex-1">
                      <h4 className="text-sm font-semibold text-white mb-2">
                        🔒 Add Watermark Protection
                      </h4>
                      <p className="text-xs text-white/90 mb-3">
                        Add an invisible watermark to your image before downloading. This watermark contains your IP Asset ID ({ipId.slice(0, 10)}...{ipId.slice(-8)}) and will help verify ownership even if metadata is removed.
                      </p>
                      <button
                        onClick={handleAddWatermark}
                        disabled={isAddingWatermark || !ipId || !generatedImageFile}
                        className="w-full flex items-center justify-center space-x-2 px-6 py-3 bg-gradient-to-r from-yellow-600 to-yellow-500 dark:from-yellow-700 dark:to-yellow-600 text-white rounded-lg hover:from-yellow-700 hover:to-yellow-600 dark:hover:from-yellow-800 dark:hover:to-yellow-700 transition-all font-semibold disabled:opacity-50 disabled:cursor-not-allowed shadow-lg shadow-yellow-500/30 hover:shadow-yellow-500/50"
                      >
                        {isAddingWatermark ? (
                          <>
                            <Loader2 className="w-5 h-5 animate-spin" />
                            <span>Adding Watermark...</span>
                          </>
                        ) : (
                          <>
                            <Shield className="w-5 h-5" />
                            <span>Add Watermark Now</span>
                          </>
                        )}
                      </button>
                      {(!ipId || !generatedImageFile) && (
                        <p className="text-xs text-red-300 mt-2">
                          {!ipId ? 'IP Asset ID is required' : 'Generated image file is required'}
                        </p>
                      )}
                    </div>
                  </div>
                </div>
              )}

              {/* Watermark Added Success */}
              {isWatermarked && (
                <div className="mb-4 p-4 bg-green-500/10 border border-green-400/30 rounded-lg">
                  <div className="flex items-center space-x-3">
                    <CheckCircle className="w-5 h-5 text-green-300" />
                    <div>
                      <h4 className="text-sm font-semibold text-white">
                        ✅ Watermark Added
                      </h4>
                      <p className="text-xs text-white/90 mt-1">
                        Your image is now protected. You can download the watermarked version.
                      </p>
                    </div>
                  </div>
                </div>
              )}

              
              {/* IP Asset ID - Prominent Display */}
              <div className="glass-card rounded-lg p-4 mb-4 border-2 border-green-200 dark:border-green-800/50">
                <div className="flex items-start justify-between gap-4">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center space-x-2 mb-2">
                      <Shield className="w-4 h-4 text-green-300" />
                      <p className="text-xs font-semibold text-white/90 uppercase tracking-wide">
                        IP Asset ID
                      </p>
                    </div>
                    <p className="text-base font-mono text-white break-all glass px-3 py-2 rounded border border-white/10">
                      {ipId}
                    </p>
                    <p className="text-xs text-white/70 mt-3 flex items-center space-x-1">
                      <span>💡</span>
                      <span>Prompt is stored as metadata in this IP asset</span>
                    </p>
                  </div>
                  <button
                    onClick={handleCopyIpId}
                    className="p-2 hover:bg-white/10 rounded transition-colors flex-shrink-0"
                    title="Copy IP Asset ID"
                  >
                    <Copy className="w-5 h-5 text-white/70 hover:text-white" />
                  </button>
                </div>
                
                {/* Info: IP Asset will appear in My IP Assets */}
                <div className="mt-3 p-3 bg-indigo-500/10 border border-indigo-400/30 rounded-lg">
                  <p className="text-xs text-white/90 flex items-center space-x-2">
                    <CheckCircle className="w-4 h-4 flex-shrink-0" />
                    <span>
                      <strong>✅ This IP Asset is now registered!</strong> It will appear in <strong>My IP Assets</strong> and be counted in your <strong>Dashboard</strong> statistics (Total IP Assets, Protected Images).
                    </span>
                  </p>
                </div>
                
                <div className="mt-3 flex flex-col sm:flex-row gap-2">
                  <a
                    href={`https://aeneid.explorer.story.foundation/ipa/${ipId}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center justify-center space-x-2 px-4 py-2 bg-indigo-600 dark:bg-indigo-500 text-white rounded-lg hover:bg-indigo-700 dark:hover:bg-indigo-600 transition-colors text-sm font-medium"
                  >
                    <ExternalLink className="w-4 h-4" />
                    <span>View on Story Protocol Explorer</span>
                  </a>
                  <Link
                    href="/dashboard/assets"
                    onClick={() => {
                      // Force refetch when navigating to My IP Assets
                      if (address) {
                        setTimeout(() => {
                          queryClient.invalidateQueries({ queryKey: ['ip-assets', 'owner', address] })
                          queryClient.refetchQueries({ queryKey: ['ip-assets', 'owner', address] })
                        }, 500)
                      }
                    }}
                    className="inline-flex items-center justify-center space-x-2 px-4 py-2 bg-green-600 dark:bg-green-500 text-white rounded-lg hover:bg-green-700 dark:hover:bg-green-600 transition-colors text-sm font-medium"
                  >
                    <ImageIcon className="w-4 h-4" />
                    <span>View in My IP Assets</span>
                  </Link>
                </div>
              </div>
              <div className="flex space-x-3">
                <button
                  onClick={() => {
                    setPrompt('')
                    setGeneratedImage(null)
                    setGeneratedSvg(null)
                    setStatus('idle')
                    setIpId(null)
                    setPromptIpId(null)
                  }}
                  className="px-4 py-2 border border-white/20 text-white/90 rounded-lg hover:bg-white/10 transition-colors text-sm font-medium"
                >
                  Create New
                </button>
              </div>
            </motion.div>
          )}
        </motion.div>

        {/* Right: Preview */}
        <motion.div
          initial={{ opacity: 0, x: 20 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ duration: 0.6, delay: 0.3 }}
          className="space-y-6"
        >
          <div className="glass-card rounded-xl border border-white/10 p-6">
            <h3 className="text-lg font-semibold text-white mb-4">Preview</h3>
            <div className="aspect-square bg-white/5 rounded-lg overflow-hidden flex items-center justify-center">
              {generatedSvg || generatedImage ? (
                generatedSvg ? (
                  <div 
                    className="w-full h-full flex items-center justify-center p-4"
                    dangerouslySetInnerHTML={{ __html: sanitizeSVG(generatedSvg) }}
                  />
                ) : generatedImage ? (
                  <img
                    src={generatedImage}
                    alt="Generated"
                    className="w-full h-full object-contain"
                    onError={(e) => {
                      console.error('Failed to load preview image')
                    }}
                  />
                ) : null
              ) : (
                <div className="text-center p-8">
                  <ImageIcon className="w-16 h-16 text-white/40 mx-auto mb-4" />
                  <p className="text-white/60">Generated SVG artwork will appear here</p>
                </div>
              )}
            </div>
            {/* Show buttons only after registration is complete */}
            {(generatedImage || generatedSvg) && status === 'registered' && (
              <div className="mt-4 space-y-3">
                <button
                  onClick={handleDownloadImage}
                  disabled={!isWatermarked}
                  className={`w-full flex items-center justify-center space-x-2 px-4 py-3 rounded-lg transition-all font-medium ${
                    !isWatermarked
                      ? 'bg-white/10 text-white/50 cursor-not-allowed'
                      : 'bg-indigo-600 text-white hover:bg-indigo-700'
                  }`}
                >
                  <Download className="w-4 h-4" />
                  <span>
                    {!isWatermarked
                      ? 'Add Watermark First'
                      : 'Download Protected Image'}
                  </span>
                </button>
                
                {/* Get Image URL for Testing - Only after registration */}
                <div className="space-y-2">
                  <button
                    onClick={handleGetImageUrl}
                    className="w-full flex items-center justify-center space-x-2 px-4 py-3 rounded-lg transition-all font-medium bg-purple-600 text-white hover:bg-purple-700"
                  >
                    <Copy className="w-4 h-4" />
                    <span>Copy Image URL (for Testing)</span>
                  </button>
                  
                  {/* Upload to IPFS option */}
                  <button
                    onClick={handleUploadToIPFS}
                    disabled={isUploadingToIPFS}
                    className="w-full flex items-center justify-center space-x-2 px-4 py-3 rounded-lg transition-all font-medium bg-green-600 text-white hover:bg-green-700 disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    {isUploadingToIPFS ? (
                      <>
                        <Loader2 className="w-4 h-4 animate-spin" />
                        <span>Uploading to IPFS...</span>
                      </>
                    ) : (
                      <>
                        <ExternalLink className="w-4 h-4" />
                        <span>Upload to IPFS (Get Public URL)</span>
                      </>
                    )}
                  </button>
                  
                  {imageUrl && (
                    <div className="p-3 bg-green-500/10 rounded-lg border border-green-400/30">
                      <p className="text-xs font-semibold text-white mb-2">✅ Image URL Ready!</p>
                      <p className="text-xs text-white/70 mb-2 break-all">{imageUrl.substring(0, 80)}...</p>
                      <p className="text-xs text-white/70">
                        💡 Paste this URL in <strong>Monitor page</strong> to test reverse search and watermark detection.
                      </p>
                    </div>
                  )}
                </div>
                
                {!isWatermarked && (
                  <div className="p-3 bg-yellow-500/10 rounded-lg border border-yellow-400/30">
                    <div className="flex items-center space-x-2 text-sm text-yellow-300">
                      <Shield className="w-4 h-4" />
                      <span>Add watermark before downloading to protect your IP Asset</span>
                    </div>
                  </div>
                )}
              </div>
            )}
            
            {/* Loading Animation - Show for 10 seconds after generation */}
            {showLoadingAnimation && status === 'generated' && loadingCountdown > 0 && (
              <motion.div
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -20 }}
                className="mt-4 p-6 bg-gradient-to-br from-indigo-500/20 via-purple-500/20 to-pink-500/20 rounded-xl border border-indigo-400/30 backdrop-blur-sm"
              >
                <div className="text-center">
                  <motion.div
                    animate={{ rotate: 360 }}
                    transition={{ duration: 2, repeat: Infinity, ease: "linear" }}
                    className="w-16 h-16 mx-auto mb-4"
                  >
                    <Sparkles className="w-16 h-16 text-indigo-400" />
                  </motion.div>
                  
                  <h3 className="text-lg font-semibold text-white mb-2">
                    ✨ Image Generated Successfully!
                  </h3>
                  
                  <p className="text-sm text-white/80 mb-4">
                    Processing complete. Please wait while we prepare everything...
                  </p>
                  
                  {/* Progress Bar */}
                  <div className="w-full bg-white/10 rounded-full h-2 mb-4 overflow-hidden">
                    <motion.div
                      initial={{ width: '0%' }}
                      animate={{ width: `${((10 - loadingCountdown) / 10) * 100}%` }}
                      transition={{ duration: 1, ease: "linear" }}
                      className="h-full bg-gradient-to-r from-indigo-500 via-purple-500 to-pink-500 rounded-full"
                    />
                  </div>
                  
                  {/* Countdown - Shows counting down */}
                  <div className="flex items-center justify-center space-x-2">
                    <Loader2 className="w-4 h-4 text-indigo-400 animate-spin" />
                    <span className="text-sm text-white/70">
                      Ready in <span className="font-bold text-white text-lg">{loadingCountdown}</span> second{loadingCountdown !== 1 ? 's' : ''}...
                    </span>
                  </div>
                </div>
              </motion.div>
            )}
            
            {/* Success message after countdown finishes */}
            {(generatedImage || generatedSvg) && status === 'generated' && !showLoadingAnimation && loadingCountdown === 0 && (
              <motion.div
                initial={{ opacity: 0, scale: 0.9 }}
                animate={{ opacity: 1, scale: 1 }}
                className="mt-4 p-6 bg-gradient-to-br from-green-500/20 via-emerald-500/20 to-teal-500/20 rounded-xl border border-green-400/30 backdrop-blur-sm"
              >
                <div className="text-center">
                  <motion.div
                    initial={{ scale: 0 }}
                    animate={{ scale: 1 }}
                    transition={{ type: "spring", stiffness: 200, damping: 10 }}
                    className="w-16 h-16 mx-auto mb-4"
                  >
                    <CheckCircle className="w-16 h-16 text-green-400" />
                  </motion.div>
                  
                  <h3 className="text-lg font-semibold text-white mb-2">
                    ✅ Success! Image Generated Successfully!
                  </h3>
                  
                  <p className="text-sm text-white/90 mb-4 font-medium">
                    Please register as IP asset to protect your creation.
                  </p>
                  
                  <div className="flex items-center justify-center space-x-2 text-sm text-green-300">
                    <Shield className="w-4 h-4" />
                    <span>Ready to register and protect your IP Asset</span>
                  </div>
                </div>
              </motion.div>
            )}
            
            {/* Fallback info message (if countdown state is reset) */}
            {(generatedImage || generatedSvg) && status === 'generated' && !showLoadingAnimation && loadingCountdown > 0 && (
              <div className="mt-4 p-3 bg-indigo-500/10 rounded-lg border border-indigo-400/30">
                <div className="flex items-center space-x-2 text-sm text-indigo-300">
                  <Zap className="w-4 h-4" />
                  <span>Image generated! Register as IP asset to get download and URL options.</span>
                </div>
              </div>
            )}
          </div>

          {/* Info Card */}
          <div className="glass-card rounded-xl border border-white/20 p-6">
            <h4 className="text-sm font-semibold text-white mb-3">How it works</h4>
            <ul className="space-y-2 text-sm text-white/70">
              <li className="flex items-start space-x-2">
                <span className="text-indigo-400 mt-1">1.</span>
                <span>Enter a prompt to generate SVG artwork using StorySeal-Engine (GPT-4)</span>
              </li>
              <li className="flex items-start space-x-2">
                <span className="text-indigo-400 mt-1">2.</span>
                <span>Review the generated SVG artwork in the preview</span>
              </li>
              <li className="flex items-start space-x-2">
                <span className="text-indigo-600 dark:text-indigo-400 mt-1">3.</span>
                <span>Register it on Story Protocol to get an IP Asset ID</span>
              </li>
              <li className="flex items-start space-x-2">
                <span className="text-indigo-600 dark:text-indigo-400 mt-1">4.</span>
                <span>An invisible watermark is automatically embedded in the image</span>
              </li>
            </ul>
          </div>
        </motion.div>
      </div>
    </div>
  )
}
