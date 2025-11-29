'use client'

import { motion } from 'framer-motion'
import { useState, useRef } from 'react'
import { 
  Search, 
  Upload, 
  AlertTriangle,
  CheckCircle,
  XCircle,
  Loader2,
  FileImage,
  Globe,
  Link as LinkIcon,
  Activity,
  Shield,
  Clock,
  Download,
  Eye,
  Brain,
  FileText,
  Send,
  Settings
} from 'lucide-react'
import { extractWatermarkFromImage } from '@/lib/watermark'
import { useStoryService } from '@/hooks/useStoryProtocol'
import { useToast } from '@/contexts/ToastContext'
import { checkForViolations, detectImageSimilarity } from '@/lib/image-similarity'
import { generateDMCANotice, createViolationReport, saveViolationReport, getViolationReports } from '@/lib/enforcement'
import { useIPAssetsByOwner } from '@/hooks/useStoryProtocol'
import { useAccount } from 'wagmi'
import { trackScanTime, trackDetection, trackViolation } from '@/lib/analytics'
import { parseError, logError } from '@/lib/error-handler'
import { validateUrl, validateFile } from '@/lib/validation'
import { verifyC2PAManifest, extractC2PAProvenance } from '@/services/c2pa-service'
import { reverseImageSearch, findImageUsage } from '@/services/reverse-image-search'
import AutomatedMonitoringPanel from '@/components/AutomatedMonitoringPanel'

type ScanStatus = 'idle' | 'scanning' | 'completed' | 'error'
type TabType = 'manual' | 'automated'

interface ScanResult {
  id: string
  source: string
  type: 'url' | 'file'
  hasWatermark: boolean
  ipId?: string
  owner?: string
  status: 'protected' | 'violation' | 'unknown' | 'similar_detected'
  scannedAt: string
  similarityMatches?: Array<{
    ipId: string
    similarity: number
    confidence: 'high' | 'medium' | 'low'
  }>
}

export default function MonitorPage() {
  const [activeTab, setActiveTab] = useState<TabType>('manual')
  const [urlInput, setUrlInput] = useState('')
  const [selectedFiles, setSelectedFiles] = useState<File[]>([])
  const [filePreviews, setFilePreviews] = useState<Map<number, string>>(new Map())
  const [scanStatus, setScanStatus] = useState<ScanStatus>('idle')
  const [results, setResults] = useState<ScanResult[]>([])
  const [error, setError] = useState<string | null>(null)
  const [enableAIDetection, setEnableAIDetection] = useState(true)
  const [enableC2PAVerification, setEnableC2PAVerification] = useState(true)
  const [enableReverseSearch, setEnableReverseSearch] = useState(false)
  const [selectedResult, setSelectedResult] = useState<ScanResult | null>(null)
  const [showEnforcementModal, setShowEnforcementModal] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const storyService = useStoryService()
  const { showToast } = useToast()
  const { address } = useAccount()
  const { data: myIPAssets } = useIPAssetsByOwner(address)

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || [])
    const newFiles = files.slice(0, 1)
    
    setSelectedFiles(newFiles)
    
    // Generate previews for new files
    const newPreviews = new Map(filePreviews)
    newFiles.forEach((file, index) => {
      if (!newPreviews.has(index)) {
        const reader = new FileReader()
        reader.onload = () => {
          setFilePreviews(prev => new Map(prev).set(index, reader.result as string))
        }
        reader.readAsDataURL(file)
      }
    })
  }

  const handleScanUrl = async () => {
    setScanStatus('scanning')
    setError(null)

    const startTime = Date.now()

    try {
      let file: File
      let sourceName = urlInput

      // Check if it's a data URL
      if (urlInput.startsWith('data:')) {
        // Convert data URL to File
        const response = await fetch(urlInput)
        const blob = await response.blob()
        file = new File([blob], 'scanned-image.png', { type: blob.type })
        sourceName = 'data-url-image'
      } else {
        // Validate URL format
        const validation = validateUrl(urlInput)
        if (!validation.valid) {
          setError(validation.error || null)
          showToast('error', validation.error || 'Invalid URL')
          setScanStatus('idle')
          return
        }

        // Fetch image from URL
        const response = await fetch(urlInput)
        if (!response.ok) throw new Error('Failed to fetch image from URL')
        
        const blob = await response.blob()
        file = new File([blob], 'scanned-image.png', { type: blob.type })
      }

      // Validate file
      const fileValidation = validateFile(file)
      if (!fileValidation.valid) {
        throw new Error(fileValidation.error || 'Invalid file')
      }

      await scanImage(file, sourceName, 'url')
      
      // Track scan time
      const duration = Date.now() - startTime
      trackScanTime(duration)
    } catch (err: any) {
      logError(err, 'handleScanUrl')
      const errorInfo = parseError(err)
      setError(errorInfo.userMessage)
      setScanStatus('error')
      showToast('error', errorInfo.userMessage)
    }
  }

  const handleScanFiles = async () => {
    if (selectedFiles.length === 0) return

    // Validate files
    for (const file of selectedFiles) {
      const validation = validateFile(file)
      if (!validation.valid) {
        setError(validation.error || null)
        showToast('error', validation.error || 'Invalid file')
        return
      }
    }

    setScanStatus('scanning')
    setError(null)
    const newResults: ScanResult[] = []

    const startTime = Date.now()

    for (const file of selectedFiles) {
      await scanImage(file, file.name, 'file', newResults)
    }

    // Track scan time
    const duration = Date.now() - startTime
    trackScanTime(duration)

    setResults(prev => [...prev, ...newResults])
    setScanStatus('completed')
    setSelectedFiles([])
    
    const protectedCount = newResults.filter(r => r.status === 'protected').length
    const violationCount = newResults.filter(r => r.status === 'violation' || r.status === 'similar_detected').length
    
    showToast('success', `Scanned ${newResults.length} image(s). Found ${protectedCount} protected, ${violationCount} violations.`)
  }

  const scanImage = async (
    file: File, 
    source: string, 
    type: 'url' | 'file',
    resultsArray?: ScanResult[]
  ) => {
    try {
      // Step 1: Extract watermark
      const ipId = await extractWatermarkFromImage(file)

      let result: ScanResult = {
        id: `${Date.now()}_${Math.random().toString(36).slice(2, 9)}`,
        source,
        type,
        hasWatermark: !!ipId,
        ipId: ipId || undefined,
        status: 'unknown',
        scannedAt: new Date().toISOString(),
      }
      
      // Flag to track if similarity detection already showed a message
      let similarityMessageShown = false

      // Track detection
      if (ipId) {
        trackDetection('watermark')
      }

      // Step 2: Verify watermark with Story Protocol
      if (ipId && storyService) {
        let ipAsset = null
        let verificationAttempts = 0
        const maxAttempts = 3
        
        // Retry mechanism for IP Asset verification
        while (verificationAttempts < maxAttempts && !ipAsset) {
          try {
            verificationAttempts++
            console.log(`[Monitor] Verifying IP Asset (attempt ${verificationAttempts}/${maxAttempts}):`, ipId)
            
            ipAsset = await storyService.getIPAsset(ipId)
            
            if (ipAsset) {
              // IP Asset found and registered - Protected!
              result.owner = ipAsset.owner
              result.status = 'protected'
              console.log('[Monitor] ✅ IP Asset found and registered:', {
                ipId,
                owner: ipAsset.owner,
                status: 'protected',
                attempts: verificationAttempts
              })
              break // Exit retry loop on success
            } else if (verificationAttempts < maxAttempts) {
              // Wait before retry (exponential backoff)
              const delay = Math.min(1000 * Math.pow(2, verificationAttempts - 1), 3000)
              console.log(`[Monitor] IP Asset not found, retrying in ${delay}ms...`)
              await new Promise(resolve => setTimeout(resolve, delay))
            }
          } catch (error: any) {
            console.error(`[Monitor] Error fetching IP Asset (attempt ${verificationAttempts}):`, error)
            
            // If it's the last attempt, check if it's a network/RPC error
            if (verificationAttempts >= maxAttempts) {
              // For network errors, don't treat as violation - might be temporary issue
              const isNetworkError = error?.message?.includes('network') || 
                                    error?.message?.includes('timeout') ||
                                    error?.message?.includes('fetch') ||
                                    error?.code === 'NETWORK_ERROR' ||
                                    error?.code === 'TIMEOUT'
              
              if (isNetworkError) {
                console.warn('[Monitor] Network error during verification - treating as unknown (not violation)')
                result.status = 'unknown'
                // Don't track as violation for network errors
              } else {
                // Only treat as violation if we're sure it's not a network issue
                result.status = 'violation'
                trackViolation()
              }
            } else {
              // Wait before retry on error
              const delay = Math.min(1000 * Math.pow(2, verificationAttempts - 1), 3000)
              await new Promise(resolve => setTimeout(resolve, delay))
            }
          }
        }
        
        // If still not found after all attempts, only mark as violation if we're certain
        if (!ipAsset && result.status !== 'unknown') {
          result.status = 'violation'
          trackViolation()
          console.log('[Monitor] ⚠️ IP Asset not found after all attempts:', {
            ipId,
            status: 'violation',
            attempts: verificationAttempts
          })
        }
      }

      // Step 3: C2PA Verification (if enabled)
      if (enableC2PAVerification) {
        try {
          const c2paResult = await verifyC2PAManifest(file)
          if (c2paResult.isValid && c2paResult.manifest) {
            console.log('[Monitor] ✅ C2PA manifest found')
            trackDetection('similarity') // C2PA is a form of similarity detection
            
            // Extract provenance
            const provenance = await extractC2PAProvenance(file)
            if (provenance.hasProvenance) {
              console.log('[Monitor] C2PA Provenance:', provenance)
            }
          } else {
            console.log('[Monitor] ⚠️ No C2PA manifest found')
          }
        } catch (c2paError) {
          console.warn('C2PA verification failed (non-critical):', c2paError)
        }
      }


      // Step 5: Reverse Image Search (if enabled)
      if (enableReverseSearch) {
        try {
          // Check if API key exists before attempting search
          if (typeof window !== 'undefined') {
            const hasSerpAPI = !!localStorage.getItem('serpapi_api_key')
            const hasSerpdog = !!localStorage.getItem('serpdog_api_key')
            const hasBing = !!localStorage.getItem('bing_visual_search_api_key')
            const hasGoogle = !!(localStorage.getItem('google_api_key') && localStorage.getItem('google_search_engine_id'))
            
            if (!hasSerpAPI && !hasSerpdog && !hasBing && !hasGoogle) {
              console.warn('[Monitor] Reverse search enabled but no API key found')
              showToast('warning', 'Reverse search requires API key. Please set up at least one API key in Settings page (SerpAPI, Serpdog, Bing, or Google).')
              // Continue without reverse search - don't fail the entire scan
            } else {
              showToast('info', 'Searching for image usage online...')
              
              // Use auto provider selection (will use first available API key)
              const searchResult = await reverseImageSearch({ 
                imageFile: file,
                provider: 'auto' // Auto-selects best available provider
              })
              
              if (searchResult.found && searchResult.matches.length > 0) {
                console.log('[Monitor] 🔍 Found', searchResult.totalMatches, 'matches online via', searchResult.provider)
                trackDetection('similarity') // Reverse search is a form of similarity detection
                
                // Add matches to result for display
                result.similarityMatches = [
                  ...(result.similarityMatches || []),
                  ...searchResult.matches.slice(0, 5).map(match => ({
                    ipId: match.url, // Use URL as identifier
                    similarity: match.similarity || 0.8, // Default similarity if not provided
                    confidence: match.similarity && match.similarity > 0.9 ? 'high' : 
                               match.similarity && match.similarity > 0.7 ? 'medium' : 'low' as 'high' | 'medium' | 'low',
                  }))
                ]
                
                showToast('success', `Found ${searchResult.totalMatches} match(es) online via ${searchResult.provider}`)
              } else {
                console.log('[Monitor] No matches found via reverse search')
                showToast('info', 'No matches found online for this image')
              }
            }
          }
        } catch (reverseError: any) {
          console.warn('[Monitor] Reverse search failed (non-critical):', reverseError)
          // Show helpful error message
          if (reverseError.message?.includes('API key') || reverseError.message?.includes('No API key')) {
            showToast('warning', 'Reverse search API key not found or invalid. Please check your API key in Settings page.')
          } else if (reverseError.message?.includes('quota') || reverseError.message?.includes('limit')) {
            showToast('warning', 'API quota exceeded. Please check your API usage limits.')
          } else {
            showToast('warning', `Reverse search failed: ${reverseError.message || 'Unknown error'}`)
          }
          // Continue without reverse search - don't fail the entire scan
        }
      }

      // Step 6: AI-Powered Similarity Detection (if enabled and no watermark found)
      if (!ipId && enableAIDetection && myIPAssets && myIPAssets.length > 0) {
        try {
          showToast('info', 'Running AI similarity detection...')
          
          // Prepare IP assets for comparison
          // Get image URL from various possible sources in metadata
          const ipAssetsForComparison = myIPAssets
            .map(asset => {
              // Try multiple sources for image URL
              const imageUrl = 
                asset.metadata?.image ||           // Direct image URL
                asset.metadata?.mediaUrl ||        // Media URL
                asset.metadata?.metadataURI ||     // Metadata URI (might contain image)
                asset.metadata?.metadata?.image || // Nested metadata
                asset.metadata?.metadata?.mediaUrl || // Nested media URL
                '' // Fallback to empty
              
              // If we have IP ID but no direct image URL, try to construct from IPFS
              // This is a fallback - ideally metadata should have image URL
              let finalImageUrl = imageUrl
              if (!finalImageUrl && asset.id) {
                // Could fetch from IPFS metadata, but for now we skip if no URL
                console.warn(`[Monitor] No image URL found for IP Asset ${asset.id}, skipping similarity check`)
              }
              
              return {
                ipId: asset.id,
                imageUrl: finalImageUrl,
              }
            })
            .filter(a => a.imageUrl && a.imageUrl.trim() !== '') // Only include assets with valid image URL
          
          console.log(`[Monitor] Comparing with ${ipAssetsForComparison.length} IP assets (out of ${myIPAssets.length} total)`)
          
          if (ipAssetsForComparison.length === 0) {
            console.warn('[Monitor] No IP assets with image URLs found for similarity detection')
            showToast('warning', 'No IP assets with image URLs found. Make sure your registered assets have image metadata.')
            return
          }
          
          // Compare with registered IP assets
          const violations = await checkForViolations(
            file,
            ipAssetsForComparison
          )

          if (violations.length > 0) {
            // If similarity is very high (>95%), verify if it's registered IP Asset
            const highSimilarity = violations.some(v => v.similarity.score > 0.95)
            const topMatch = violations[0]
            
            // CRITICAL: Verify if the similar IP Asset is actually registered on blockchain
            let verifiedIpAsset = null
            if (storyService) {
              try {
                verifiedIpAsset = await storyService.getIPAsset(topMatch.ipId)
                if (verifiedIpAsset) {
                  result.owner = verifiedIpAsset.owner
                  console.log('[Monitor] ✅ Similar image matches registered IP Asset:', {
                    ipId: topMatch.ipId,
                    owner: verifiedIpAsset.owner,
                    userAddress: address
                  })
                  
                  // Check if this IP Asset belongs to the current user
                  if (address && verifiedIpAsset.owner.toLowerCase() === address.toLowerCase()) {
                    // This is the user's own IP Asset - it's protected, not a violation!
                    result.status = 'protected'
                    result.ipId = topMatch.ipId // Set the IP ID from similarity match
                    result.hasWatermark = false // No watermark, but verified via similarity
                    console.log('[Monitor] ✅ IP Asset belongs to user - Status: protected')
                    
                    trackDetection('similarity')
                    // Don't track as violation - this is user's own asset
                    // Continue to save result below, but skip violation tracking
                  } else {
                    // IP Asset belongs to someone else - this is a violation
                    result.status = highSimilarity ? 'violation' : 'similar_detected'
                    console.log('[Monitor] ⚠️ Similar IP Asset belongs to different owner - Status: violation')
                  }
                } else {
                  // IP Asset not found on blockchain - might be false positive
                  result.status = highSimilarity ? 'violation' : 'similar_detected'
                  console.log('[Monitor] ⚠️ Similar IP Asset not found on blockchain')
                }
              } catch (e) {
                console.warn('[Monitor] Could not verify IP asset on blockchain:', e)
                // If verification fails, treat as potential violation
                result.status = highSimilarity ? 'violation' : 'similar_detected'
              }
            } else {
              // No story service available - treat as potential violation
              result.status = highSimilarity ? 'violation' : 'similar_detected'
            }
            
            result.similarityMatches = violations.map(v => ({
              ipId: v.ipId,
              similarity: v.similarity.score,
              confidence: v.similarity.confidence,
            }))
            
            // Only track as violation if status is actually 'violation' and not user's own asset
            // Note: trackDetection('similarity') already called above for user's own asset
            if (result.status !== 'protected') {
              trackDetection('similarity')
            }
            if (result.status === 'violation' || result.status === 'similar_detected') {
              trackViolation()
              
              const message = highSimilarity 
                ? verifiedIpAsset
                  ? `⚠️ High similarity (${Math.round(violations[0].similarity.score * 100)}%) detected with registered IP Asset ${violations[0].ipId.slice(0, 10)}... owned by ${verifiedIpAsset.owner.slice(0, 6)}... - Possible violation!`
                  : `⚠️ High similarity (${Math.round(violations[0].similarity.score * 100)}%) detected with IP Asset ${violations[0].ipId.slice(0, 10)}... - Possible violation!`
                : `Found ${violations.length} similar image(s) (${Math.round(violations[0].similarity.score * 100)}% similar)`
              showToast('warning', message)
              similarityMessageShown = true // Mark that similarity message was shown
            } else if (result.status === 'protected' && verifiedIpAsset) {
              // Show success message for user's own asset found via similarity
              const similarityScore = typeof topMatch.similarity === 'object' && topMatch.similarity?.score 
                ? topMatch.similarity.score 
                : typeof topMatch.similarity === 'number' 
                  ? topMatch.similarity 
                  : 0
              showToast('success', `✅ IP Asset is registered! Found via similarity detection (${Math.round(similarityScore * 100)}% similar) - This is your own asset.`)
            }
          }
        } catch (aiError) {
          console.warn('AI detection failed (non-critical):', aiError)
          logError(aiError, 'scanImage-similarity')
        }
      }

      if (resultsArray) {
        resultsArray.push(result)
      } else {
        setResults(prev => [...prev, result])
        setScanStatus('completed')
        if (result.status === 'protected') {
          // Check if protected via watermark or similarity detection
          if (result.hasWatermark) {
            showToast('success', '✅ IP Asset is registered! Watermark detected and verified on Story Protocol.')
          } else {
            // Protected via similarity detection (already shown above, but show again for consistency)
            showToast('success', '✅ IP Asset is registered! Found via similarity detection - This is your own asset.')
          }
        } else if (result.status === 'violation') {
          // Only show verification failed if similarity detection didn't already show a message
          if (!similarityMessageShown && (!result.similarityMatches || result.similarityMatches.length === 0)) {
            showToast('warning', '⚠️ Verification failed')
          }
        } else if (result.status === 'similar_detected') {
          // Similarity detection message already shown above, don't show duplicate
          if (!similarityMessageShown && (!result.similarityMatches || result.similarityMatches.length === 0)) {
            showToast('warning', 'Similar images detected - possible violation')
          }
        } else {
          showToast('info', 'No watermark found in image')
        }
      }
    } catch (err: any) {
      logError(err, 'scanImage')
      const errorInfo = parseError(err)
      showToast('error', errorInfo.userMessage)
      const result: ScanResult = {
        id: `${Date.now()}_${Math.random().toString(36).slice(2, 9)}`,
        source,
        type,
        hasWatermark: false,
        status: 'unknown',
        scannedAt: new Date().toISOString(),
      }
      if (resultsArray) {
        resultsArray.push(result)
      } else {
        setResults(prev => [...prev, result])
      }
    }
  }

  const handleReportViolation = (result: ScanResult) => {
    setSelectedResult(result)
    setShowEnforcementModal(true)
  }

  const handleGenerateDMCA = async () => {
    if (!selectedResult || !address) {
      showToast('error', 'Please select a violation and ensure wallet is connected')
      return
    }

    try {
      const notice = generateDMCANotice({
        ipId: selectedResult.ipId || 'unknown',
        violationUrl: selectedResult.source,
        ownerName: address.slice(0, 10) + '...',
        ownerAddress: address,
      })

      // Save notice
      const blob = new Blob([notice.content], { type: 'text/plain' })
      const url = URL.createObjectURL(blob)
      const link = document.createElement('a')
      link.href = url
      link.download = `dmca-notice-${notice.id}.txt`
      document.body.appendChild(link)
      link.click()
      document.body.removeChild(link)
      URL.revokeObjectURL(url)

      // Create violation report
      const report = createViolationReport({
        ipId: selectedResult.ipId || 'unknown',
        violationUrl: selectedResult.source,
        violationType: 'copyright',
        evidence: [selectedResult.source, `Scanned at: ${selectedResult.scannedAt}`],
      })
      saveViolationReport(report)

      showToast('success', 'DMCA notice generated and saved!')
      setShowEnforcementModal(false)
    } catch (error: any) {
      showToast('error', error.message || 'Failed to generate DMCA notice')
    }
  }

  const handleRemoveFile = (index: number) => {
    setSelectedFiles(prev => {
      const newFiles = prev.filter((_, i) => i !== index)
      // Re-index previews to match new file indices
      setFilePreviews(prevPreviews => {
        const newPreviews = new Map<number, string>()
        prev.forEach((file, oldIndex) => {
          if (oldIndex !== index && prevPreviews.has(oldIndex)) {
            const newIndex = oldIndex > index ? oldIndex - 1 : oldIndex
            newPreviews.set(newIndex, prevPreviews.get(oldIndex)!)
          }
        })
        return newPreviews
      })
      return newFiles
    })
  }

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleString('en-US', {
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    })
  }

  const violations = results.filter(r => r.status === 'violation')
  const protectedCount = results.filter(r => r.status === 'protected').length

  return (
    <div className="max-w-7xl mx-auto">
      <motion.div
        initial={{ opacity: 0, y: -20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.6 }}
        className="mb-8"
      >
        <h1 className="text-3xl font-bold text-white mb-2">Monitor & Scan</h1>
        <p className="text-white/70">Scan images for IP violations and monitor your protected assets</p>
      </motion.div>

      {/* Tabs */}
      <div className="flex items-center space-x-2 border-b border-white/10 mb-6">
        <button
          onClick={() => setActiveTab('manual')}
          className={`px-6 py-3 font-medium transition-all relative ${
            activeTab === 'manual'
              ? 'text-white'
              : 'text-white/60 hover:text-white/80'
          }`}
        >
          <div className="flex items-center space-x-2">
            <Search className="w-5 h-5" />
            <span>Manual Scan</span>
          </div>
          {activeTab === 'manual' && (
            <motion.div
              layoutId="activeTab"
              className="absolute bottom-0 left-0 right-0 h-0.5 bg-gradient-primary"
            />
          )}
        </button>
        <button
          onClick={() => setActiveTab('automated')}
          className={`px-6 py-3 font-medium transition-all relative ${
            activeTab === 'automated'
              ? 'text-white'
              : 'text-white/60 hover:text-white/80'
          }`}
        >
          <div className="flex items-center space-x-2">
            <Clock className="w-5 h-5" />
            <span>Automated Monitoring</span>
          </div>
          {activeTab === 'automated' && (
            <motion.div
              layoutId="activeTab"
              className="absolute bottom-0 left-0 right-0 h-0.5 bg-gradient-primary"
            />
          )}
        </button>
      </div>

      {/* Tab Content */}
      {activeTab === 'automated' && <AutomatedMonitoringPanel />}
      {activeTab === 'manual' && (
        <div className="space-y-6">

      {/* API Key Status */}
      {typeof window !== 'undefined' && (
        <motion.div
          initial={{ opacity: 0, y: -10 }}
          animate={{ opacity: 1, y: 0 }}
          className="mb-6"
        >
          <div className="glass-card rounded-xl border border-white/10 p-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center space-x-3">
                <Search className="w-5 h-5 text-white/70" />
                <div>
                  <p className="text-sm font-medium text-white">Reverse Image Search API Status</p>
                  <p className="text-xs text-white/70">
                    {(() => {
                      const hasSerpAPI = !!localStorage.getItem('serpapi_api_key')
                      const hasSerpdog = !!localStorage.getItem('serpdog_api_key')
                      const hasBing = !!localStorage.getItem('bing_visual_search_api_key')
                      const hasGoogle = !!(localStorage.getItem('google_api_key') && localStorage.getItem('google_search_engine_id'))
                      const providers = []
                      if (hasSerpAPI) providers.push('SerpAPI')
                      if (hasSerpdog) providers.push('Serpdog')
                      if (hasBing) providers.push('Bing Visual Search')
                      if (hasGoogle) providers.push('Google Custom Search')
                      
                      if (providers.length > 0) {
                        return `✅ Configured: ${providers.join(', ')}`
                      }
                      return '⚠️ No API key configured - Set up in Settings page'
                    })()}
                  </p>
                </div>
              </div>
              {(() => {
                const hasSerpAPI = !!localStorage.getItem('serpapi_api_key')
                const hasSerpdog = !!localStorage.getItem('serpdog_api_key')
                const hasBing = !!localStorage.getItem('bing_visual_search_api_key')
                const hasGoogle = !!(localStorage.getItem('google_api_key') && localStorage.getItem('google_search_engine_id'))
                const hasAny = hasSerpAPI || hasSerpdog || hasBing || hasGoogle
                
                return (
                  <div className={`px-3 py-1 rounded-full text-xs font-semibold ${
                    hasAny 
                      ? 'bg-green-500/20 text-green-400 border border-green-500/30' 
                      : 'bg-yellow-500/20 text-yellow-400 border border-yellow-500/30'
                  }`}>
                    {hasAny ? 'Ready' : 'Not Configured'}
                  </div>
                )
              })()}
            </div>
          </div>
        </motion.div>
      )}

      {/* Stats */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-6 mb-8">
        <div className="glass-card rounded-xl border border-white/10 p-6">
          <p className="text-sm text-white/70 mb-1">Total Scanned</p>
          <p className="text-2xl font-bold text-white">{results.length}</p>
        </div>
        <div className="glass-card rounded-xl border border-white/10 p-6">
          <p className="text-sm text-white/70 mb-1">Protected</p>
          <p className="text-2xl font-bold text-green-400">{protectedCount}</p>
        </div>
        <div className="glass-card rounded-xl border border-white/10 p-6">
          <p className="text-sm text-white/70 mb-1">Violations</p>
          <p className="text-2xl font-bold text-red-600 text-red-400">{violations.length}</p>
        </div>
        <div className="glass-card rounded-xl border border-white/10 p-6">
          <p className="text-sm text-white/70 mb-1">Unknown</p>
          <p className="text-2xl font-bold text-yellow-600 text-yellow-400">
            {results.filter(r => r.status === 'unknown').length}
          </p>
        </div>
      </div>

      {/* Scan Mode Toggle */}
      <div className="glass-card rounded-xl border border-white/10 p-6 mb-6">
        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center space-x-4">
          </div>
          
          {/* Detection Options */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <label className="flex items-center space-x-2 cursor-pointer p-2 rounded hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors">
              <input
                type="checkbox"
                checked={enableAIDetection}
                onChange={(e) => setEnableAIDetection(e.target.checked)}
                className="w-4 h-4 text-indigo rounded focus:ring-indigo"
              />
              <span className="text-xs text-gray-700 text-white/70">AI Similarity</span>
            </label>
            <label className="flex items-center space-x-2 cursor-pointer p-2 rounded hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors">
              <input
                type="checkbox"
                checked={enableC2PAVerification}
                onChange={(e) => setEnableC2PAVerification(e.target.checked)}
                className="w-4 h-4 text-indigo rounded focus:ring-indigo"
              />
              <span className="text-xs text-gray-700 text-white/70">C2PA Verify</span>
            </label>
            <label className="flex items-center space-x-2 cursor-pointer p-2 rounded hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors relative group">
              <input
                type="checkbox"
                checked={enableReverseSearch}
                onChange={(e) => {
                  // Check if API key exists before enabling
                  if (e.target.checked && typeof window !== 'undefined') {
                    const hasSerpAPI = !!localStorage.getItem('serpapi_api_key')
                    const hasSerpdog = !!localStorage.getItem('serpdog_api_key')
                    const hasBing = !!localStorage.getItem('bing_visual_search_api_key')
                    const hasGoogle = !!(localStorage.getItem('google_api_key') && localStorage.getItem('google_search_engine_id'))
                    
                    if (!hasSerpAPI && !hasSerpdog && !hasBing && !hasGoogle) {
                      showToast('warning', 'No reverse search API key found. Please set up at least one API key in Settings page.')
                      return
                    }
                  }
                  setEnableReverseSearch(e.target.checked)
                }}
                className="w-4 h-4 text-indigo rounded focus:ring-indigo"
              />
              <span className="text-xs text-gray-700 text-white/70">Reverse Search</span>
              {typeof window !== 'undefined' && (
                <span className={`absolute -top-1 -right-1 w-2 h-2 rounded-full ${
                  localStorage.getItem('serpapi_api_key') || 
                  localStorage.getItem('serpdog_api_key') || 
                  localStorage.getItem('bing_visual_search_api_key') ||
                  (localStorage.getItem('google_api_key') && localStorage.getItem('google_search_engine_id'))
                    ? 'bg-green-500' 
                    : 'bg-red-500'
                }`} title={
                  localStorage.getItem('serpapi_api_key') || 
                  localStorage.getItem('serpdog_api_key') || 
                  localStorage.getItem('bing_visual_search_api_key') ||
                  (localStorage.getItem('google_api_key') && localStorage.getItem('google_search_engine_id'))
                    ? 'API key configured' 
                    : 'No API key found - set in Settings'
                } />
              )}
            </label>
          </div>
        </div>

        {/* URL Scan */}
        <div className="mb-6">
          <label className="block text-sm font-medium text-gray-700 text-white/70 mb-2">
            Scan Image from URL
          </label>
          <div className="flex space-x-2">
            <input
              type="text"
              value={urlInput}
              onChange={(e) => setUrlInput(e.target.value)}
              placeholder="https://example.com/image.jpg"
              className="flex-1 px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white glass text-white focus:ring-2 focus:ring-indigo focus:border-transparent outline-none"
            />
            <button
              onClick={handleScanUrl}
              disabled={!urlInput.trim() || scanStatus === 'scanning'}
              className="px-6 py-2 bg-indigo dark:bg-indigo-600 text-white rounded-lg hover:bg-indigo/90 dark:hover:bg-indigo-700 transition-all disabled:opacity-50 disabled:cursor-not-allowed flex items-center space-x-2"
            >
              {scanStatus === 'scanning' ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  <span>Scanning...</span>
                </>
              ) : (
                <>
                  <Globe className="w-4 h-4" />
                  <span>Scan URL</span>
                </>
              )}
            </button>
          </div>
        </div>

        {/* File Upload */}
        <div>
          <label className="block text-sm font-medium text-gray-700 text-white/70 mb-2">
            Upload Image
          </label>
          <div
            onClick={() => fileInputRef.current?.click()}
            className="border-2 border-dashed border-gray-300 dark:border-gray-600 rounded-lg p-8 text-center cursor-pointer hover:border-indigo dark:hover:border-indigo-500 transition-colors"
          >
            <Upload className="w-12 h-12 text-gray-400 dark:text-gray-500 mx-auto mb-4" />
            <p className="text-white/70 mb-2 font-medium">
              Click to upload or drag and drop
            </p>
            <p className="text-sm text-gray-500 text-white/70">
              PNG, JPG, GIF up to 10MB
            </p>
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              onChange={handleFileSelect}
              className="hidden"
            />
          </div>

          {selectedFiles.length > 0 && (
            <div className="mt-4 space-y-4">
              <div className="p-3 glass-card rounded-lg border border-white/10">
                <p className="text-sm font-medium text-white/90 mb-3">
                  📸 Selected Images ({selectedFiles.length})
                </p>
                <p className="text-xs text-white/70 mb-3">
                  💡 <strong>No upload needed!</strong> Images will be processed directly in your browser. 
                  For reverse search, images are sent securely to SerpAPI (no storage on our servers).
                </p>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  {selectedFiles.map((file, index) => (
                    <div key={index} className="flex items-start space-x-3 p-3 bg-white/5 rounded-lg border border-white/10">
                      {filePreviews.has(index) ? (
                        <img 
                          src={filePreviews.get(index)} 
                          alt={file.name}
                          className="w-20 h-20 object-cover rounded-lg"
                        />
                      ) : (
                        <div className="w-20 h-20 bg-white/10 rounded-lg flex items-center justify-center">
                          <FileImage className="w-8 h-8 text-white/50" />
                        </div>
                      )}
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium text-white truncate">{file.name}</p>
                        <p className="text-xs text-white/70">
                          {(file.size / 1024).toFixed(1)} KB
                        </p>
                        <button
                          onClick={() => handleRemoveFile(index)}
                          className="mt-2 text-xs text-red-400 hover:text-red-300 transition-colors flex items-center space-x-1"
                        >
                          <XCircle className="w-3 h-3" />
                          <span>Remove</span>
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
              <button
                onClick={handleScanFiles}
                disabled={scanStatus === 'scanning'}
                className="w-full px-6 py-3 bg-indigo dark:bg-indigo-600 text-white rounded-lg hover:bg-indigo/90 dark:hover:bg-indigo-700 transition-all disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center space-x-2 font-medium"
              >
                {scanStatus === 'scanning' ? (
                  <>
                    <Loader2 className="w-5 h-5 animate-spin" />
                    <span>Scanning {selectedFiles.length} image{selectedFiles.length > 1 ? 's' : ''}...</span>
                  </>
                ) : (
                  <>
                    <Search className="w-5 h-5" />
                    <span>Start Scan ({selectedFiles.length} image{selectedFiles.length > 1 ? 's' : ''})</span>
                  </>
                )}
              </button>
            </div>
          )}
        </div>
      </div>

      {/* Results */}
      {results.length > 0 && (
        <div className="glass-card rounded-xl border border-white/10 p-6">
          <div className="flex items-center justify-between mb-6">
            <h2 className="text-xl font-bold text-white">Scan Results</h2>
            <button
              onClick={() => setResults([])}
              className="text-sm text-white/70 hover:text-gray-900 dark:hover:text-white transition-colors"
            >
              Clear All
            </button>
          </div>

          <div className="space-y-4">
            {results.map((result) => (
              <motion.div
                key={result.id}
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                className={`p-4 rounded-lg border ${
                  result.status === 'protected'
                    ? 'bg-green-50 dark:bg-green-900/20 border-green-200 dark:border-green-800'
                    : result.status === 'violation'
                    ? 'bg-red-50 dark:bg-red-900/20 border-red-200 dark:border-red-800'
                    : 'bg-gray-50 glass border-gray-200 dark:border-gray-600'
                }`}
              >
                <div className="flex items-start justify-between">
                  <div className="flex-1">
                    <div className="flex items-center space-x-3 mb-2">
                      {result.status === 'protected' ? (
                        <CheckCircle className="w-5 h-5 text-green-400" />
                      ) : result.status === 'violation' ? (
                        <AlertTriangle className="w-5 h-5 text-red-600 text-red-400" />
                      ) : (
                        <XCircle className="w-5 h-5 text-yellow-600 text-yellow-400" />
                      )}
                      <div className="flex-1">
                        <p className="font-medium text-white">
                          {result.type === 'url' ? (
                            <span className="flex items-center space-x-1">
                              <LinkIcon className="w-4 h-4" />
                              <span className="truncate">{result.source}</span>
                            </span>
                          ) : (
                            result.source
                          )}
                        </p>
                        <p className="text-xs text-gray-500 text-white/70 mt-1">
                          Scanned {formatDate(result.scannedAt)}
                        </p>
                      </div>
                    </div>

                    {result.hasWatermark && result.ipId && (
                      <div className={`mt-3 p-3 rounded-lg ${
                        result.status === 'protected'
                          ? 'bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800'
                          : 'glass-card'
                      }`}>
                        {result.status === 'protected' && (
                          <div className="mb-2 flex items-center space-x-2">
                            <CheckCircle className="w-4 h-4 text-green-400" />
                            <p className="text-xs font-semibold text-green-700 dark:text-green-300">
                              ✅ IP Asset is registered on Story Protocol
                            </p>
                          </div>
                        )}
                        <p className="text-xs text-gray-500 text-white/70 mb-1">IP Asset ID</p>
                        <p className="text-sm font-mono text-white break-all">{result.ipId}</p>
                        {result.owner && (
                          <p className="text-xs text-gray-500 text-white/70 mt-2">
                            Owner: {result.owner.slice(0, 10)}...{result.owner.slice(-8)}
                          </p>
                        )}
                      </div>
                    )}

                    {/* Similarity Matches */}
                    {result.similarityMatches && result.similarityMatches.length > 0 && (
                      <div className={`mt-3 p-3 rounded-lg border ${
                        result.status === 'violation' 
                          ? 'bg-red-50 dark:bg-red-900/20 border-red-200 dark:border-red-800'
                          : 'bg-orange-50 dark:bg-orange-900/20 border-orange-200 dark:border-orange-800'
                      }`}>
                        <p className={`text-xs font-medium mb-2 ${
                          result.status === 'violation'
                            ? 'text-red-800 dark:text-red-300'
                            : 'text-orange-800 dark:text-orange-300'
                        }`}>
                          <Brain className="w-3 h-3 inline mr-1" />
                          {result.status === 'violation' 
                            ? '⚠️ High Similarity Detected - Possible Violation:'
                            : 'AI Detected Similar Images:'}
                        </p>
                        {result.similarityMatches.map((match, idx) => (
                          <div key={idx} className={`text-xs mt-1 ${
                            result.status === 'violation'
                              ? 'text-red-700 dark:text-red-400'
                              : 'text-orange-700 dark:text-orange-400'
                          }`}>
                            <div className="flex items-center justify-between">
                              <span>
                                IP Asset: <code className="font-mono">{match.ipId.slice(0, 10)}...{match.ipId.slice(-8)}</code>
                              </span>
                              <span className="font-semibold">
                                {Math.round(match.similarity * 100)}% similar ({match.confidence})
                              </span>
                            </div>
                            {result.owner && idx === 0 && (
                              <div className="text-xs mt-1 opacity-75">
                                Owner: {result.owner.slice(0, 10)}...{result.owner.slice(-8)}
                              </div>
                            )}
                          </div>
                        ))}
                        {result.status === 'violation' && (
                          <div className="mt-2 pt-2 border-t border-red-200 dark:border-red-800">
                            <p className="text-xs text-red-700 dark:text-red-400">
                              💡 This image is very similar ({Math.round(result.similarityMatches[0].similarity * 100)}%) to a registered IP Asset. 
                              Consider reporting this as a potential violation.
                            </p>
                          </div>
                        )}
                      </div>
                    )}
                  </div>

                  <div className="ml-4 flex flex-col items-end space-y-2">
                    <span className={`px-3 py-1 rounded-full text-xs font-semibold ${
                      result.status === 'protected'
                        ? 'bg-green-100 text-green-700 dark:bg-green-900/40 text-green-400'
                        : result.status === 'violation' || result.status === 'similar_detected'
                        ? 'bg-red-100 text-red-700 dark:bg-red-900/40 text-red-400'
                        : 'bg-yellow-100 text-yellow-700 dark:bg-yellow-900/40 text-yellow-400'
                    }`}>
                      {result.status === 'protected' 
                        ? 'Protected' 
                        : result.status === 'violation' 
                        ? 'Violation' 
                        : result.status === 'similar_detected'
                        ? 'Similar Detected'
                        : 'Unknown'}
                    </span>
                    
                    {/* Enforcement Actions */}
                    {(result.status === 'violation' || result.status === 'similar_detected') && (
                      <button
                        onClick={() => handleReportViolation(result)}
                        className="px-3 py-1 bg-red-600 text-white rounded-lg text-xs font-medium hover:bg-red-700 transition-colors flex items-center space-x-1"
                      >
                        <FileText className="w-3 h-3" />
                        <span>Report</span>
                      </button>
                    )}
                  </div>
                </div>
              </motion.div>
            ))}
          </div>
        </div>
      )}

      {/* Enforcement Modal */}
      {showEnforcementModal && selectedResult && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <motion.div
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            className="glass-card rounded-xl border border-white/10 p-6 max-w-2xl w-full max-h-[90vh] overflow-y-auto"
          >
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-xl font-bold text-white">Enforcement Actions</h2>
              <button
                onClick={() => setShowEnforcementModal(false)}
                className="p-2 hover:bg-gray-100 dark:hover:bg-gray-700 rounded transition-colors"
              >
                <XCircle className="w-5 h-5 text-white/70" />
              </button>
            </div>

            <div className="space-y-4">
              <div className="p-4 bg-gray-50 dark:bg-gray-900 rounded-lg">
                <p className="text-sm font-medium text-gray-700 text-white/70 mb-2">Violation Details</p>
                <p className="text-xs text-white/70">URL: {selectedResult.source}</p>
                {selectedResult.ipId && (
                  <p className="text-xs text-white/70">IP ID: {selectedResult.ipId}</p>
                )}
                {selectedResult.similarityMatches && selectedResult.similarityMatches.length > 0 && (
                  <div className="mt-2">
                    <p className="text-xs font-medium text-gray-700 text-white/70">Similar Images Detected:</p>
                    {selectedResult.similarityMatches.map((match, idx) => (
                      <p key={idx} className="text-xs text-white/70">
                        - {match.ipId} ({Math.round(match.similarity * 100)}% similar)
                      </p>
                    ))}
                  </div>
                )}
              </div>

              <div className="space-y-3">
                <button
                  onClick={handleGenerateDMCA}
                  className="w-full flex items-center justify-center space-x-2 px-4 py-3 bg-indigo dark:bg-indigo-600 text-white rounded-lg hover:bg-indigo/90 dark:hover:bg-indigo-700 transition-colors font-medium"
                >
                  <FileText className="w-4 h-4" />
                  <span>Generate DMCA Notice</span>
                </button>

                <button
                  onClick={() => {
                    const report = createViolationReport({
                      ipId: selectedResult.ipId || 'unknown',
                      violationUrl: selectedResult.source,
                      violationType: 'copyright',
                      evidence: [
                        selectedResult.source,
                        `Scanned at: ${selectedResult.scannedAt}`,
                        selectedResult.similarityMatches
                          ? `Similar to: ${selectedResult.similarityMatches.map(m => m.ipId).join(', ')}`
                          : '',
                      ].filter(Boolean),
                    })
                    saveViolationReport(report)
                    showToast('success', 'Violation report created!')
                    setShowEnforcementModal(false)
                  }}
                  className="w-full flex items-center justify-center space-x-2 px-4 py-3 bg-coral dark:bg-coral text-white rounded-lg hover:bg-coral/90 dark:hover:bg-coral/90 transition-colors font-medium"
                >
                  <AlertTriangle className="w-4 h-4" />
                  <span>Create Violation Report</span>
                </button>
              </div>
            </div>
          </motion.div>
        </div>
      )}
        </div>
      )}
    </div>
  )
}

