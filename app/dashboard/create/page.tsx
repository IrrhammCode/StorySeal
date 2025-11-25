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
import { embedWatermarkInImage } from '@/lib/watermark'
import { useABVGenerateImageWithRegistration } from '@/hooks/useABVDev'
import { useGeminiGenerateImage } from '@/hooks/useGeminiAI'
import { useToast } from '@/contexts/ToastContext'
import { addActivity } from '@/lib/activity-tracker'
import { useAccount, useWalletClient, useChainId, useSwitchChain } from 'wagmi'
import { useQueryClient } from '@tanstack/react-query'
import { createWalletClient, http, custom } from 'viem'
import { aeneidTestnet } from '@/config/wagmi'
import { PROMPT_TEMPLATES, PROMPT_CATEGORIES, getTemplatesByCategory, searchTemplates, type PromptTemplate } from '@/lib/prompt-templates'
import { batchProcessor, type BatchJob } from '@/lib/batch-processor'
import { Layers, History, Sparkles as SparklesIcon, X } from 'lucide-react'
import { addRegistrationAttempt } from '@/lib/registration-tracker'
import { parseError, logError } from '@/lib/error-handler'
import { validatePrompt, validateBatchPrompts } from '@/lib/validation'
import { trackGenerationTime } from '@/lib/analytics'
import { generateC2PAManifest } from '@/services/c2pa-service'

type GenerationStatus = 'idle' | 'generating' | 'generated' | 'registering' | 'recovering' | 'registered' | 'error'
type GenerationMode = 'single' | 'batch'
type Provider = 'abv' | 'gemini'

export default function CreatePage() {
  const queryClient = useQueryClient()
  const [provider, setProvider] = useState<Provider>('abv') // Provider selection: ABV.dev or Gemini
  const [prompt, setPrompt] = useState('')
  const [generatedImage, setGeneratedImage] = useState<string | null>(null)
  const [generatedSvg, setGeneratedSvg] = useState<string | null>(null)
  const [generatedImageFile, setGeneratedImageFile] = useState<File | null>(null)
  const [status, setStatus] = useState<GenerationStatus>('idle')
  const [ipId, setIpId] = useState<string | null>(null) // IP Asset ID (generated content with prompt as metadata)
  const [promptIpId, setPromptIpId] = useState<string | null>(null) // Not used - prompt is stored as metadata in IP asset
  const [error, setError] = useState<string | null>(null)
  const [traceId, setTraceId] = useState<string | null>(null) // ABV.dev trace ID for querying IP ID (auto-set from response)
  const [abvTraceIdInput, setAbvTraceIdInput] = useState<string>('') // Manual input for Trace ID (input prompt)
  const [abvOutputId, setAbvOutputId] = useState<string>('') // Manual input for Output IP ID (output)
  const [geminiTraceIdInput, setGeminiTraceIdInput] = useState<string>('') // Manual input for Trace ID (Gemini AI)
  const [geminiOutputId, setGeminiOutputId] = useState<string>('') // Manual input for Output IP ID (Gemini AI)
  const [isAutoRegistered, setIsAutoRegistered] = useState(false) // Track if IP was auto-registered via ABV.dev
  const [mounted, setMounted] = useState(false)
  const [mode, setMode] = useState<GenerationMode>('single')
  const [transactionHash, setTransactionHash] = useState<string | null>(null)
  const [manualTxHash, setManualTxHash] = useState('')
  const [batchPrompts, setBatchPrompts] = useState<string[]>([''])
  const [batchJob, setBatchJob] = useState<BatchJob | null>(null)
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
  const generateGeminiMutation = useGeminiGenerateImage()
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

  // Add batch prompt field
  const addBatchPrompt = () => {
    setBatchPrompts([...batchPrompts, ''])
  }

  // Remove batch prompt field
  const removeBatchPrompt = (index: number) => {
    setBatchPrompts(batchPrompts.filter((_, i) => i !== index))
  }

  // Update batch prompt
  const updateBatchPrompt = (index: number, value: string) => {
    const updated = [...batchPrompts]
    updated[index] = value
    setBatchPrompts(updated)
  }

  // Get filtered templates
  const filteredTemplates = templateSearch
    ? searchTemplates(templateSearch)
    : getTemplatesByCategory(selectedCategory)

  // Convert SVG to PNG for watermark embedding - HIGH QUALITY VERSION
  const convertSvgToImage = async (svgCode: string, scale: number = 2): Promise<File> => {
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
      
      // Remove any external references that might cause CORS issues
      processedSvg = processedSvg.replace(/xlink:href=["'][^"']+["']/gi, '')
      processedSvg = processedSvg.replace(/href=["'][^"']+["']/gi, '')
      
      // Ensure SVG has xmlns attribute (required for proper rendering)
      if (!processedSvg.includes('xmlns=')) {
        processedSvg = processedSvg.replace(
          /<svg([^>]*)>/,
          '<svg$1 xmlns="http://www.w3.org/2000/svg">'
        )
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
        const maxRetries = 1
        let hasRetried = false
        
        img.onerror = (err) => {
          if (!hasRetried && retryCount < maxRetries) {
            hasRetried = true
            retryCount++
            console.log('[SVG Conversion] Retrying with base64 encoding...')
            
            // Try alternative encoding method (base64) if URL encoding fails
            try {
              const svgBase64 = btoa(unescape(encodeURIComponent(processedSvg)))
              const altDataUrl = `data:image/svg+xml;base64,${svgBase64}`
              
              // Reset timeout for retry
              clearTimeout(timeout)
              const retryTimeout = setTimeout(() => {
                reject(new Error('SVG conversion timeout (retry)'))
              }, 15000)
              
              // Create new image for retry
              const retryImg = new Image()
              retryImg.onload = img.onload // Use same onload handler
              retryImg.onerror = () => {
                clearTimeout(retryTimeout)
                console.error('[SVG Conversion] Base64 encoding also failed')
                reject(new Error('Failed to load SVG image. The SVG may contain unsupported features or be too complex.'))
              }
              retryImg.src = altDataUrl
              return // Don't reject yet, retry is in progress
            } catch (retryError) {
              // Fall through to reject
            }
          }
          
          clearTimeout(timeout)
          console.error('[SVG Conversion] SVG load error:', err)
          console.error('[SVG Conversion] SVG data URL length:', dataUrl.length)
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
    if (mode === 'batch') {
      await handleBatchGenerate()
      return
    }

    // Validate prompt
    const validation = validatePrompt(prompt)
    if (!validation.valid) {
      setError(validation.error)
      showToast('error', validation.error || 'Invalid prompt')
      return
    }

    setStatus('generating')
    setError(null)
    setGeneratedImage(null)
    setGeneratedImageFile(null)
    setPromptIpId(null)
    setIpId(null)
    setAbvOutputId('') // Reset ABV output ID input

    const startTime = Date.now()

    try {
      if (provider === 'abv') {
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
      } else if (provider === 'gemini') {
        // Gemini AI flow: Manual generation, manual registration
        console.log('[handleGenerate] Using Gemini AI provider')
        
        console.log('[handleGenerate] Calling Gemini AI mutation...')
        const result = await generateGeminiMutation.mutateAsync({
          prompt: prompt.trim(),
        })

        console.log('[handleGenerate] ✅ Gemini AI response received:', {
          hasSvgData: !!result.svgData,
          hasSvgUrl: !!result.svgUrl,
          svgDataKeys: result.svgData ? Object.keys(result.svgData) : [],
        })

        if (!result.svgData || !result.svgUrl) {
          throw new Error('Failed to generate SVG: No SVG data returned from Gemini AI')
        }

        const duration = Date.now() - startTime
        trackGenerationTime(duration)

        setGeneratedSvg(result.svgData.svg_code)
        setGeneratedImage(result.svgUrl)
        setTraceId(null) // Gemini AI doesn't have auto-tracing
        saveToHistory(prompt.trim())

        // Gemini AI: Set to generated (user will register manually)
        setStatus('generated')
        setIsAutoRegistered(false) // Manual registration required
        console.log('[handleGenerate] ✅ Image generated successfully with Gemini AI')
        showToast('success', '✅ Image generated with Gemini AI! Please verify and register manually.', 5000)

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
                  generator: 'StorySeal-Engine (Gemini AI)',
                  metadata: {
                    prompt: prompt.trim(),
                    provider: 'gemini',
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
      }
    } catch (err: any) {
      logError(err, 'handleGenerate')
      const errorInfo = parseError(err)
      setError(errorInfo.userMessage)
      setStatus('error')
      showToast('error', errorInfo.userMessage)
    }
  }

  const handleBatchGenerate = async () => {
    const validPrompts = batchPrompts.filter(p => p.trim())
    
    // Validate batch prompts
    const validation = validateBatchPrompts(validPrompts)
    if (!validation.valid) {
      showToast('error', validation.error || 'Invalid prompts')
      return
    }

    setStatus('generating')
    setError(null)

    // Create batch job
    const job = batchProcessor.createJob(validPrompts)
    setBatchJob(job)
    batchProcessor.updateJob(job.id, { status: 'generating' })

    showToast('info', `Starting batch generation for ${validPrompts.length} prompts...`)

    // Process each prompt
    for (let i = 0; i < validPrompts.length; i++) {
      const promptText = validPrompts[i]
      
      try {
        // Generate - Use gpt-4o for better quality
        const result = await generateImageMutation.mutateAsync({
          prompt: promptText.trim(),
          provider: 'openai',
          model: 'gpt-4o', // Use gpt-4o for better quality SVG generation
        })

        if (result.svgData && result.svgUrl) {
          // Check if ABV.dev already registered IP on-chain
          if (result.ipId) {
            console.log('[handleBatchGenerate] ABV.dev already registered IP:', result.ipId)
            // Track successful registration (from ABV.dev)
            addRegistrationAttempt('success', {
              ipId: result.ipId,
              prompt: promptText,
              duration: 0, // ABV.dev registration is instant
              metadata: {
                imageUrl: result.svgUrl,
                type: 'svg_artwork',
                source: 'abv-dev-auto-register',
              },
            })

            batchProcessor.addResult(job.id, {
              prompt: promptText,
              status: 'success',
              ipId: result.ipId,
              imageUrl: result.svgUrl,
            })
          } else {
            // ABV.dev didn't register - show message
            console.log('[handleBatchGenerate] No IP ID from ABV.dev for prompt:', promptText)
            batchProcessor.addResult(job.id, {
              prompt: promptText,
              status: 'success',
              imageUrl: result.svgUrl,
              note: 'Enable Story Protocol integration in ABV.dev dashboard to auto-register IP assets',
            })
          }
        } else {
          batchProcessor.addResult(job.id, {
            prompt: promptText,
            status: 'failed',
            error: 'No SVG data returned',
          })
        }
      } catch (err: any) {
        logError(err, 'handleBatchGenerate-generate')
        const errorInfo = parseError(err)
        
        batchProcessor.addResult(job.id, {
          prompt: promptText,
          status: 'failed',
          error: errorInfo.userMessage || 'Generation failed',
        })
      }

      // Update job status
      const updatedJob = batchProcessor.getJob(job.id)
      if (updatedJob) {
        setBatchJob(updatedJob)
      }
    }

    const finalJob = batchProcessor.getJob(job.id)
    if (finalJob) {
      setBatchJob(finalJob)
      setStatus('generated')
      const successCount = finalJob.results.filter(r => r.status === 'success').length
      showToast('success', `Batch complete! ${successCount}/${validPrompts.length} successful`)
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
      console.log(`[handleRegister] ⚠️ Wrong chain! Current: ${chainId}, Required: ${aeneidTestnet.id}`)
      showToast('warning', `Please switch to Aeneid Testnet (Chain ID: ${aeneidTestnet.id})`, 5000)
      
      try {
        console.log('[handleRegister] Attempting to switch chain...')
        await switchChain({ chainId: aeneidTestnet.id })
        console.log('[handleRegister] ✅ Chain switched successfully')
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
              console.log('[handleRegister] Attempting to add chain to wallet...')
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
              console.log('[handleRegister] Chain added, attempting to switch...')
              await switchChain({ chainId: aeneidTestnet.id })
              console.log('[handleRegister] ✅ Chain switched successfully after adding')
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
      console.log('[handleRegister] Hook walletClient not available, creating wallet client from window.ethereum...')
      try {
        // Create wallet client directly from window.ethereum
        signingWalletClient = createWalletClient({
          account: {
            address: address as `0x${string}`,
            type: 'json-rpc',
          },
          chain: aeneidTestnet,
          transport: custom((window as any).ethereum),
        })
        console.log('[handleRegister] ✅ Created wallet client from window.ethereum')
      } catch (createError: any) {
        console.error('[handleRegister] Failed to create wallet client:', createError)
      }
    }
    
    if (!signingWalletClient) {
      console.error('[handleRegister] ❌ Wallet client not available')
      console.error('[handleRegister] walletClient:', walletClient)
      console.error('[handleRegister] isWalletClientLoading:', isWalletClientLoading)
      console.error('[handleRegister] isConnected:', isConnected)
      console.error('[handleRegister] address:', address)
      
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
      console.log('[handleRegister] Created account from address (fallback):', account)
    }
    
    if (!account || !account.address) {
      showToast('error', 'Invalid wallet account. Please reconnect your wallet.')
      return
    }
    
    console.log('[handleRegister] ✅ Using account:', account)
    console.log('[handleRegister] Account type:', account.type)
    console.log('[handleRegister] Account address:', account.address)

    try {
      setStatus('registering')
      setError(null)
      
      console.log('[handleRegister] Starting manual registration following official Story Protocol docs...')
      console.log('[handleRegister] Image URL:', generatedImage)
      console.log('[handleRegister] Wallet address:', address)
      console.log('[handleRegister] Account:', account)
      
      // Use direct contract call (SDK doesn't support json-rpc account type)
      // SDK requires private key account, but we're using wallet extension (json-rpc)
      console.log('[handleRegister] Using direct smart contract call (SDK doesn\'t support wallet extension accounts)')
      
      const ipAsset = await storyService.registerIPAssetDirectContract(
        {
          name: `StorySeal IP Asset - ${new Date().toISOString()}`,
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
      
      // Save to localStorage for manual IP assets
      if (address) {
        const manualAssetsKey = `storyseal_manual_ip_assets_${address}`
        const existingAssets = JSON.parse(localStorage.getItem(manualAssetsKey) || '[]')
        
        // Check if already exists
        if (!existingAssets.some((a: any) => a.id === ipAsset.id.toLowerCase())) {
          // Add new manual IP asset
          const newAsset = {
            id: ipAsset.id,
            name: `IP Asset ${ipAsset.id.slice(0, 10)}...`,
            owner: address,
            registeredAt: new Date().toISOString(),
            metadata: {
              tokenId: null,
              traceId: null,
              prompt: prompt.trim() || null,
              provider: provider,
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
      addRegistrationAttempt('failed', {
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
            imageUrl: generatedImage,
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

  const handleDownloadImage = async () => {
    if (!generatedImage && !generatedSvg) return

    try {
      // Try to download PNG first if available, otherwise download SVG
      if (generatedImageFile) {
        // Download PNG file directly
        const url = URL.createObjectURL(generatedImageFile)
        const link = document.createElement('a')
        link.href = url
        link.download = `storyseal-artwork-${Date.now()}.png`
        document.body.appendChild(link)
        link.click()
        document.body.removeChild(link)
        URL.revokeObjectURL(url)
        showToast('success', 'PNG image downloaded!')
      } else if (generatedSvg) {
        // Try to convert SVG to PNG for download - HIGH QUALITY
        try {
          // Use 2x scale for high-quality download
          const pngFile = await convertSvgToImage(generatedSvg, 2)
          const url = URL.createObjectURL(pngFile)
          const link = document.createElement('a')
          link.href = url
          link.download = `storyseal-artwork-${Date.now()}.png`
          document.body.appendChild(link)
          link.click()
          document.body.removeChild(link)
          URL.revokeObjectURL(url)
          showToast('success', 'High-quality PNG downloaded!')
        } catch (convertError) {
          // Fallback to SVG download if PNG conversion fails
          console.warn('PNG conversion failed, downloading SVG instead:', convertError)
          const svgBlob = new Blob([generatedSvg], { type: 'image/svg+xml' })
          const url = URL.createObjectURL(svgBlob)
          const link = document.createElement('a')
          link.href = url
          link.download = `storyseal-artwork-${Date.now()}.svg`
          document.body.appendChild(link)
          link.click()
          document.body.removeChild(link)
          URL.revokeObjectURL(url)
          showToast('success', 'SVG artwork downloaded!')
        }
      } else if (generatedImage) {
        // Download from data URL (PNG)
        const link = document.createElement('a')
        link.href = generatedImage
        link.download = `storyseal-artwork-${Date.now()}.png`
        document.body.appendChild(link)
        link.click()
        document.body.removeChild(link)
        showToast('success', 'Image downloaded!')
      }
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
          {/* Provider Selection */}
          <div className="glass-card rounded-xl border border-white/10 p-4">
            <h3 className="text-sm font-semibold text-white mb-3">Choose Provider</h3>
            <div className="grid grid-cols-2 gap-3">
              {/* ABV.dev Option */}
              <button
                onClick={() => setProvider('abv')}
                className={`p-4 rounded-lg border-2 transition-all text-left ${
                  provider === 'abv'
                    ? 'border-indigo-500 bg-indigo-500/10 glass-card'
                    : 'border-white/10 glass'
                }`}
              >
                <div className="flex items-start space-x-3">
                  <div className={`flex-shrink-0 w-5 h-5 rounded-full border-2 flex items-center justify-center ${
                    provider === 'abv' ? 'border-indigo-500 bg-indigo-500' : 'border-gray-300 border-white/20'
                  }`}>
                    {provider === 'abv' && <div className="w-2 h-2 rounded-full bg-white" />}
                  </div>
                  <div className="flex-1">
                    <div className="font-semibold text-white mb-1">ABV.dev</div>
                    <div className="text-xs text-white/90 font-medium space-y-1">
                      <div className="flex items-center space-x-1">
                        <Zap className="w-3 h-3 text-green-300" />
                        <span>Auto-tracing & registration</span>
                      </div>
                      <div className="flex items-center space-x-1">
                        <Shield className="w-3 h-3 text-blue-300" />
                        <span>Story Protocol integration</span>
                      </div>
                      <div className="flex items-center space-x-1">
                        <CheckCircle className="w-3 h-3 text-purple-300" />
                        <span>No manual registration needed</span>
                      </div>
                    </div>
                  </div>
                </div>
              </button>

              {/* Gemini AI Option */}
              <button
                onClick={() => setProvider('gemini')}
                className={`p-4 rounded-lg border-2 transition-all text-left ${
                  provider === 'gemini'
                    ? 'border-indigo-500 bg-indigo-500/10 glass-card'
                    : 'border-white/10 glass'
                }`}
              >
                <div className="flex items-start space-x-3">
                  <div className={`flex-shrink-0 w-5 h-5 rounded-full border-2 flex items-center justify-center ${
                    provider === 'gemini' ? 'border-indigo-500 bg-indigo-500' : 'border-gray-300 border-white/20'
                  }`}>
                    {provider === 'gemini' && <div className="w-2 h-2 rounded-full bg-white" />}
                  </div>
                  <div className="flex-1">
                  <div className="font-semibold text-white mb-1">Gemini AI</div>
                  <div className="text-xs text-white/90 font-medium space-y-1">
                      <div className="flex items-center space-x-1">
                        <ImageIcon className="w-3 h-3 text-orange-300" />
                        <span>Direct AI generation</span>
                      </div>
                      <div className="flex items-center space-x-1">
                        <Shield className="w-3 h-3 text-white/80" />
                        <span>Manual verification & registration</span>
                      </div>
                      <div className="flex items-center space-x-1">
                        <AlertCircle className="w-3 h-3 text-yellow-300" />
                        <span>Requires manual IP registration</span>
                      </div>
                    </div>
                  </div>
                </div>
              </button>
            </div>

            {/* ABV.dev Benefits Info */}
            {provider === 'abv' && (
              <div className="mt-3 p-3 bg-blue-500/10 glass-card border border-blue-400/30 rounded-lg">
                <p className="text-xs font-semibold text-white mb-2">✨ ABV.dev Benefits:</p>
                <ul className="text-xs text-white/90 font-medium space-y-1 list-disc list-inside">
                  <li>Automatic tracing: Prompt & output tracked in ABV.dev dashboard</li>
                  <li>Auto-registration: Register IP assets directly from ABV.dev dashboard</li>
                  <li>No manual steps: Generate → Check dashboard → Register (one click)</li>
                  <li>Story Protocol integration: Built-in connector for seamless IP registration</li>
                </ul>
                <a
                  href="https://app.abv.dev/asset-registration"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="mt-2 inline-flex items-center space-x-1 text-xs text-blue-300 hover:text-blue-200 hover:underline"
                >
                  <ExternalLink className="w-3 h-3" />
                  <span>Open ABV.dev Dashboard</span>
                </a>
              </div>
            )}
          </div>

          {/* Mode Toggle */}
          <div className="glass-card rounded-xl border border-white/10 p-4">
            <div className="flex items-center space-x-2">
              <button
                onClick={() => setMode('single')}
                className={`flex-1 px-4 py-2 rounded-lg transition-colors ${
                  mode === 'single'
                    ? 'bg-indigo-600 text-white'
                    : 'glass text-white/90 font-medium'
                }`}
              >
                Single
              </button>
              <button
                onClick={() => setMode('batch')}
                className={`flex-1 px-4 py-2 rounded-lg transition-colors ${
                  mode === 'batch'
                    ? 'bg-indigo-600 text-white'
                    : 'glass text-white/90 font-medium'
                }`}
              >
                <Layers className="w-4 h-4 inline mr-2" />
                Batch
              </button>
            </div>
          </div>

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
          {provider === 'abv' && (
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
                      <li>Enter your prompt (automatically traced to ABV.dev dashboard)</li>
                      <li>Generate image using the prompt</li>
                      <li>Output automatically traced to ABV.dev dashboard</li>
                      <li>Go to ABV.dev dashboard → Asset Registration page</li>
                      <li>Find your trace and click "Register" button</li>
                      <li>Copy IP Asset ID from dashboard and paste it here (optional)</li>
                    </ol>
                  </div>
                  <p className="text-xs text-white/90 font-medium">
                    <strong className="font-bold">Required:</strong> Pinata credentials for IPFS upload. Configure in <a href="/dashboard/settings" className="underline text-indigo-300 hover:text-indigo-200 font-semibold">Settings page</a>.
                  </p>
                </div>
              </div>
            </div>
          )}

          {/* Story Protocol Registration Info - Gemini AI Flow */}
          {provider === 'gemini' && (
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

          {/* Prompt Input - Single Mode */}
          {mode === 'single' && (
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
                    💡 <strong className="font-bold">Automatic Tracing:</strong> Your prompt will be automatically tracked in ABV.dev dashboard when you generate an image. 
                    You can register it as IP asset in the <a href="https://app.abv.dev/asset-registration" target="_blank" rel="noopener noreferrer" className="underline text-blue-300 hover:text-blue-200 font-semibold">ABV.dev Asset Registration</a> page.
                  </p>
                </div>
              )}
            </div>
          )}

          {/* Batch Prompts Input */}
          {mode === 'batch' && (
            <div className="glass-card rounded-xl border border-white/10 p-6">
              <div className="flex items-center justify-between mb-4">
                <label className="block text-sm font-semibold text-white">
                  Batch Prompts ({batchPrompts.filter(p => p.trim()).length} prompts)
                </label>
                <button
                  onClick={addBatchPrompt}
                  className="px-3 py-1 bg-indigo-600 text-white rounded-lg text-xs font-medium hover:bg-indigo-700 transition-colors"
                >
                  + Add
                </button>
              </div>
              <div className="space-y-3 max-h-96 overflow-y-auto">
                {batchPrompts.map((batchPrompt, index) => (
                  <div key={index} className="flex items-start space-x-2">
                    <textarea
                      value={batchPrompt}
                      onChange={(e) => updateBatchPrompt(index, e.target.value)}
                      placeholder={`Prompt ${index + 1}...`}
                      className="flex-1 px-4 py-2 border border-white/20 rounded-lg glass-card text-white font-medium placeholder-white/50 focus:ring-2 focus:ring-indigo focus:border-transparent outline-none resize-none text-sm"
                      rows={2}
                      disabled={status === 'generating' || status === 'registering' || status === 'recovering'}
                    />
                    {batchPrompts.length > 1 && (
                      <button
                        onClick={() => removeBatchPrompt(index)}
                        className="p-2 text-white/80 hover:text-red-400 transition-colors"
                      >
                        <X className="w-4 h-4" />
                      </button>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Generate Button */}
          <button
            onClick={handleGenerate}
            disabled={
              (mode === 'single' && !prompt.trim()) ||
              (mode === 'batch' && batchPrompts.filter(p => p.trim()).length === 0) ||
              status === 'generating' ||
              status === 'registering'
            }
            className="w-full flex items-center justify-center space-x-2 px-6 py-4 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 active:bg-indigo-800 transition-all disabled:opacity-60 disabled:cursor-not-allowed disabled:hover:bg-indigo-600 font-medium shadow-lg shadow-indigo-500/40 border-2 border-indigo-500 hover:border-indigo-400 disabled:border-indigo-600"
          >
            {status === 'generating' ? (
              <>
                <Loader2 className="w-5 h-5 animate-spin" />
                <span>
                  {mode === 'batch' && batchJob
                    ? `Generating... ${batchJob.progress.completed}/${batchJob.progress.total}`
                    : 'Generating...'}
                </span>
              </>
            ) : (
              <>
                <Sparkles className="w-5 h-5" />
                <span>
                  {mode === 'batch'
                    ? `Generate ${batchPrompts.filter(p => p.trim()).length} Images`
                    : 'Generate Image'}
                </span>
              </>
            )}
          </button>

          {/* Batch Job Progress */}
          {mode === 'batch' && batchJob && (
            <div className="glass-card rounded-xl border border-white/10 p-6">
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-lg font-semibold text-white">Batch Progress</h3>
                <span className="text-sm text-white/90 font-semibold">
                  {batchJob.progress.completed}/{batchJob.progress.total}
                </span>
              </div>
              <div className="w-full bg-white/10 rounded-full h-2 mb-4">
                <div
                  className="bg-indigo-600 h-2 rounded-full transition-all duration-300"
                  style={{
                    width: `${(batchJob.progress.completed / batchJob.progress.total) * 100}%`,
                  }}
                />
              </div>
              <div className="space-y-2 max-h-48 overflow-y-auto">
                {batchJob.results.map((result, index) => (
                  <div
                    key={index}
                    className={`p-3 rounded-lg border ${
                      result.status === 'success'
                        ? 'bg-green-500/10 border-green-400/30'
                        : 'bg-red-500/10 border-red-400/30'
                    }`}
                  >
                    <div className="flex items-start justify-between">
                      <div className="flex-1">
                        <p className="text-sm font-medium text-white truncate">
                          {result.prompt}
                        </p>
                        {result.status === 'success' && result.ipId && (
                          <p className="text-xs text-white/80 font-medium mt-1">
                            IP ID: {result.ipId.slice(0, 10)}...
                          </p>
                        )}
                        {result.status === 'failed' && result.error && (
                          <p className="text-xs text-red-400 mt-1">{result.error}</p>
                        )}
                      </div>
                      {result.status === 'success' ? (
                        <CheckCircle className="w-5 h-5 text-green-300 flex-shrink-0 ml-2" />
                      ) : (
                        <XCircle className="w-5 h-5 text-red-400 flex-shrink-0 ml-2" />
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

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
                          <p className="text-xs text-white/60 mt-2">
                            💡 <strong>Tip:</strong> Contract tidak terverifikasi di Tenderly menyebabkan error ini. 
                            <br />
                            • <strong>Clear & Use Public:</strong> Gunakan public verified contract (lebih reliable)
                            <br />
                            • <strong>Force Create New:</strong> Buat contract baru (mungkin lebih compatible dengan Tenderly)
                          </p>
                          {typeof window !== 'undefined' && localStorage.getItem('storyseal_spg_nft_contract') && (
                            <a
                              href={`https://dashboard.tenderly.co/storyseal/contract/virtual/${localStorage.getItem('storyseal_spg_nft_contract')}`}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="text-xs text-indigo-600 dark:text-indigo-400 hover:underline inline-flex items-center space-x-1"
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
                          className="underline hover:text-red-800 dark:hover:text-red-300"
                        >
                          Look up error signature →
                        </a>
                      </p>
                      
                      {/* Manual Transaction Hash Input */}
                      {(transactionHash || manualTxHash) && (
                        <div className="mt-3 p-3 bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-lg">
                          <p className="text-xs font-semibold text-blue-900 dark:text-blue-300 mb-2">
                            💡 Transaction berhasil di Tenderly? Extract IP ID dari transaction hash:
                          </p>
                          <div className="mb-2 p-2 bg-yellow-50 dark:bg-yellow-900/20 border border-yellow-200 dark:border-yellow-800 rounded text-xs text-yellow-800 dark:text-yellow-300">
                            <strong>⚠️ Important:</strong> Pastikan Anda menggunakan <strong>transaction hash</strong> yang benar dari Tenderly dashboard, bukan metadata hash. Transaction hash bisa ditemukan di Tenderly transaction detail page.
                          </div>
                          <div className="flex space-x-2">
                            <input
                              type="text"
                              value={manualTxHash || transactionHash || ''}
                              onChange={(e) => setManualTxHash(e.target.value)}
                              placeholder="0x... (transaction hash dari Tenderly)"
                              className="flex-1 px-3 py-2 border border-blue-300 dark:border-blue-700/50 rounded-lg glass-card text-white text-xs font-mono"
                            />
                            <button
                              onClick={handleExtractIpIdFromTx}
                              className="px-3 py-2 bg-blue-600 dark:bg-blue-500 text-white rounded-lg hover:bg-blue-700 dark:hover:bg-blue-600 transition-colors text-xs font-medium"
                            >
                              Extract IP ID
                            </button>
                          </div>
                          {transactionHash && (
                            <p className="text-xs text-blue-700 text-blue-300 mt-2">
                              <strong>Note:</strong> Hash yang terdeteksi: {transactionHash.slice(0, 20)}... 
                              <br />
                              Jika ini bukan transaction hash yang benar, copy dari Tenderly dashboard.
                            </p>
                          )}
                          <p className="text-xs text-blue-600 text-blue-300 mt-2">
                            <strong>How to find transaction hash:</strong>
                            <br />
                            1. Buka Tenderly dashboard
                            <br />
                            2. Cari transaction terbaru dari wallet Anda
                            <br />
                            3. Cari transaction yang memanggil <code className="bg-blue-100 dark:bg-blue-900/50 text-blue-800 dark:text-blue-300 px-1 rounded border border-blue-200 dark:border-blue-800">mintAndRegisterIp</code>
                            <br />
                            4. Copy transaction hash dari transaction detail page
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
          {provider === 'abv' && status === 'generated' && generatedImage && !ipId && (
            <motion.div
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              className="bg-white glass-card rounded-xl border border-gray-200 border-white/10 p-6"
            >
              <h3 className="text-lg font-semibold text-white mb-4">
                Register via ABV.dev Dashboard
              </h3>
              
              <div className="mb-4 p-4 bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800 rounded-lg">
                <p className="text-sm font-semibold text-green-900 dark:text-green-300 mb-2">
                  ✅ Auto-Tracing Active
                </p>
                <p className="text-xs text-green-800 text-green-300 mb-3">
                  Your prompt and output are automatically tracked in ABV.dev dashboard. Register via ABV.dev dashboard - no manual registration button needed here!
                </p>
                {traceId && (
                  <div className="mb-3">
                    <p className="text-xs text-green-700 dark:text-green-500 mb-2">
                      <strong>Trace ID:</strong> <code className="bg-green-100 dark:bg-green-900/50 text-green-800 dark:text-green-300 px-2 py-1 rounded font-mono text-xs border border-green-200 dark:border-green-800">{traceId}</code>
                    </p>
                    <a
                      href={`https://app.abv.dev/traces/${traceId}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center space-x-1 text-xs text-green-700 text-green-300 hover:underline"
                    >
                      <ExternalLink className="w-3 h-3" />
                      <span>View Trace in Dashboard</span>
                    </a>
                  </div>
                )}
                <a
                  href="https://app.abv.dev/asset-registration"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center space-x-2 px-4 py-2 bg-green-600 dark:bg-green-500 text-white rounded-lg hover:bg-green-700 dark:hover:bg-green-600 transition-colors text-sm font-medium"
                >
                  <ExternalLink className="w-4 h-4" />
                  <span>Open ABV.dev Dashboard</span>
                </a>
              </div>

              <div className="mb-4 p-4 bg-blue-50 glass-card/95 border border-blue-200 border-white/10/50 rounded-lg">
                <p className="text-xs font-semibold text-blue-900 text-white mb-2">
                  📋 Steps to Register via ABV.dev Dashboard:
                </p>
                <ol className="text-xs text-blue-800 text-white/70 list-decimal list-inside space-y-1">
                  <li>Click "Open ABV.dev Dashboard" button above</li>
                  <li>Go to "Asset Registration" page</li>
                  <li>Find your trace (prompt + output are automatically tracked)</li>
                  <li>Click "Register" button on the trace</li>
                  <li>Copy the IP Asset ID from dashboard</li>
                  <li>Paste it below to save it here (optional - for tracking)</li>
                </ol>
                <p className="text-xs text-blue-700 dark:text-gray-400 mt-2">
                  ⚠️ <strong>Note:</strong> Do not use manual registration button here. Use ABV.dev dashboard instead for automatic registration.
                </p>
              </div>

              <div className="space-y-4">
                {/* Input 1: Trace ID (Input Prompt) */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 text-white/70 mb-2">
                    Trace ID (Input Prompt)
                  </label>
                  <input
                    type="text"
                    value={abvTraceIdInput}
                    onChange={(e) => setAbvTraceIdInput(e.target.value)}
                    placeholder="Paste Trace ID from ABV.dev dashboard (for input prompt)"
                    className="w-full px-4 py-2 border border-gray-300 border-white/20/50 rounded-lg glass-card text-white text-sm"
                  />
                  <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                    Optional: Paste the Trace ID for the input prompt from ABV.dev dashboard
                  </p>
                </div>

                {/* Input 2: Output IP ID */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 text-white/70 mb-2">
                    Output IP ID
                  </label>
                  <input
                    type="text"
                    value={abvOutputId}
                    onChange={(e) => setAbvOutputId(e.target.value)}
                    placeholder="Paste IP Asset ID from ABV.dev dashboard (for output)"
                    className="w-full px-4 py-2 border border-gray-300 border-white/20/50 rounded-lg glass-card text-white text-sm"
                  />
                  <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
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
                            name: `IP Asset ${abvOutputId.trim().slice(0, 10)}...`,
                            owner: address,
                            registeredAt: new Date().toISOString(),
                            metadata: {
                              tokenId: null,
                              traceId: abvTraceIdInput.trim() || null,
                              prompt: prompt || null,
                              provider: 'abv',
                              method: 'abv-dev-manual-input',
                            },
                          }
                          
                          existingAssets.push(newAsset)
                          localStorage.setItem(manualAssetsKey, JSON.stringify(existingAssets))
                          console.log('[ABV Manual] ✅ Saved IP asset to localStorage')
                        }
                        
                        setIpId(abvOutputId)
                        setStatus('registered')
                        setIsAutoRegistered(true) // Mark as auto-registered via ABV.dev
                        
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

          {/* Gemini AI Flow: Manual Verify & Register */}
          {provider === 'gemini' && status === 'generated' && generatedImage && !ipId && (
            <motion.div
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              className="bg-white glass-card rounded-xl border border-gray-200 border-white/10 p-6"
            >
              <h3 className="text-lg font-semibold text-white mb-4">
                Verify & Register as IP Asset
              </h3>
              
              <div className="mb-4 p-4 bg-yellow-50 dark:bg-yellow-900/20 border border-yellow-200 dark:border-yellow-800 rounded-lg">
                <p className="text-sm font-semibold text-yellow-900 dark:text-yellow-300 mb-2">
                  ⚠️ Manual Registration Required
                </p>
                <p className="text-xs text-yellow-800 dark:text-yellow-400">
                  Gemini AI requires manual verification and registration. You can either register via button below or manually input trace ID and output IP ID.
                </p>
              </div>

              <div className="mb-4 p-4 bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-lg">
                <p className="text-xs font-semibold text-blue-900 dark:text-blue-300 mb-2">
                  📋 Registration Process:
                </p>
                <ol className="text-xs text-blue-800 text-blue-300 list-decimal list-inside space-y-1">
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
                        name: `IP Asset ${geminiOutputId.trim().slice(0, 10)}...`,
                        owner: address,
                        registeredAt: new Date().toISOString(),
                        metadata: {
                          tokenId: null,
                          traceId: geminiTraceIdInput.trim() || null,
                          prompt: prompt || null,
                          provider: 'gemini',
                          method: 'manual-input',
                        },
                      }
                      
                      existingAssets.push(newAsset)
                      localStorage.setItem(manualAssetsKey, JSON.stringify(existingAssets))
                      
                      // Update state
                      setIpId(geminiOutputId.trim())
                      setStatus('registered')
                      setIsAutoRegistered(true)
                      
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
                      
                      showToast('success', '✅ IP Asset saved! It will appear in My IP Assets now.')
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
                <p className="text-xs text-gray-500 dark:text-gray-400 mt-2 text-center">
                  Please connect your wallet to register IP assets
                </p>
              )}
              
              {isConnected && isWalletClientLoading && (
                <p className="text-xs text-blue-600 text-blue-300 mt-2 text-center">
                  ⏳ Waiting for wallet to be ready...
                </p>
              )}
              
              {isConnected && !isWalletClientLoading && !walletClient?.account && (
                <p className="text-xs text-yellow-600 dark:text-yellow-400 mt-2 text-center">
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
                <CheckCircle className="w-6 h-6 text-green-600 text-green-300" />
                <h3 className="text-lg font-semibold text-green-900 dark:text-green-300">
                  Successfully Registered!
                </h3>
              </div>
              <p className="text-sm text-green-700 text-green-300 mb-4">
                Your generated content has been registered as an IP asset on Story Protocol with invisible watermark protection. The prompt is included as metadata within the IP asset.
              </p>
              
              {/* ABV.dev Registration Info */}
              {provider === 'abv' && (
                <div className="mb-4 p-4 bg-green-100 dark:bg-green-900/30 border border-green-300 dark:border-green-700 rounded-lg">
                  <div className="flex items-start space-x-2 mb-2">
                    <div className="flex-shrink-0 w-6 h-6 rounded-full bg-green-200 dark:bg-green-800 flex items-center justify-center mt-0.5">
                      <span className="text-xs font-bold text-green-700 dark:text-green-300">ABV</span>
                    </div>
                    <div className="flex-1">
                      <p className="text-xs font-semibold text-green-800 dark:text-green-300 mb-1">
                        ✅ Registered via ABV.dev Dashboard
                      </p>
                      <p className="text-xs text-green-700 text-green-300 mb-2">
                        This IP asset was registered through ABV.dev's Story Protocol integration. Your prompt and generated image were automatically traced.
                      </p>
                      {traceId && (
                        <p className="text-xs text-green-600 dark:text-green-500">
                          💡 <strong>View in dashboard:</strong> 
                          <a href={`https://app.abv.dev/traces/${traceId}`} target="_blank" rel="noopener noreferrer" className="underline ml-1">View Trace</a> | 
                          <a href="https://app.abv.dev/asset-registration" target="_blank" rel="noopener noreferrer" className="underline ml-1">Asset Registration</a>
                        </p>
                      )}
                    </div>
                  </div>
                </div>
              )}
              
              {/* Gemini AI Manual Registration Info */}
              {provider === 'gemini' && (
                <div className="mb-4 p-3 bg-blue-100 dark:bg-blue-900/30 border border-blue-300 dark:border-blue-700 rounded-lg">
                  <p className="text-xs text-blue-800 dark:text-blue-300 mb-2">
                    <strong>📝 Manually registered via StorySeal:</strong> This IP asset was registered using direct contract call through StorySeal's manual registration flow.
                  </p>
                  <p className="text-xs text-blue-700 text-blue-300">
                    💡 <strong>Registration method:</strong> Manual verification and registration via Gemini AI provider flow.
                  </p>
                </div>
              )}
              
              {/* IP Asset ID - Prominent Display */}
              <div className="glass-card rounded-lg p-4 mb-4 border-2 border-green-200 dark:border-green-800/50">
                <div className="flex items-start justify-between gap-4">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center space-x-2 mb-2">
                      <Shield className="w-4 h-4 text-green-600 text-green-300" />
                      <p className="text-xs font-semibold text-gray-700 text-white/70 uppercase tracking-wide">
                        IP Asset ID
                      </p>
                    </div>
                    <p className="text-base font-mono text-white break-all glass px-3 py-2 rounded border border-white/10">
                      {ipId}
                    </p>
                    <p className="text-xs text-gray-500 dark:text-gray-400 mt-3 flex items-center space-x-1">
                      <span>💡</span>
                      <span>Prompt is stored as metadata in this IP asset</span>
                    </p>
                  </div>
                  <button
                    onClick={handleCopyIpId}
                    className="p-2 hover:bg-gray-100 dark:hover:bg-gray-700 rounded transition-colors flex-shrink-0"
                    title="Copy IP Asset ID"
                  >
                    <Copy className="w-5 h-5 text-gray-600 dark:text-gray-400" />
                  </button>
                </div>
                
                {/* Info: IP Asset will appear in My IP Assets */}
                <div className="mt-3 p-3 bg-indigo-50 dark:bg-indigo-900/20 border border-indigo-200 dark:border-indigo-800 rounded-lg">
                  <p className="text-xs text-indigo-800 dark:text-indigo-300 flex items-center space-x-2">
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
                  className="px-4 py-2 border border-gray-300 border-white/20 text-gray-700 text-white/70 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors text-sm font-medium"
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
                    dangerouslySetInnerHTML={{ __html: generatedSvg }}
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
            {(generatedImage || generatedSvg) && (status === 'generated' || status === 'registered' || status === 'recovering') && (
              <div className="mt-4 space-y-3">
                <button
                  onClick={handleDownloadImage}
                  className="w-full flex items-center justify-center space-x-2 px-4 py-3 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 transition-all font-medium"
                >
                  <Download className="w-4 h-4" />
                  <span>Download Image</span>
                </button>
                {status === 'generated' && (
                  <div className="p-3 bg-indigo-500/10 rounded-lg border border-indigo-400/30">
                    <div className="flex items-center space-x-2 text-sm text-indigo-300">
                      <Zap className="w-4 h-4" />
                      <span>Ready to register as IP asset</span>
                    </div>
                  </div>
                )}
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
