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
  Send
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

type ScanStatus = 'idle' | 'scanning' | 'completed' | 'error'

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
  reverseSearchMatches?: Array<{
    url: string
    title?: string
    thumbnail?: string
    platform: string
    similarity?: number
  }>
}

export default function MonitorPage() {
  const [scanMode, setScanMode] = useState<'single' | 'batch'>('single')
  const [urlInput, setUrlInput] = useState('')
  const [selectedFiles, setSelectedFiles] = useState<File[]>([])
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
    if (scanMode === 'batch') {
      setSelectedFiles(prev => [...prev, ...files])
    } else {
      setSelectedFiles(files.slice(0, 1))
    }
  }

  const handleScanUrl = async () => {
    // Validate URL
    const validation = validateUrl(urlInput)
    if (!validation.valid) {
      setError(validation.error)
      showToast('error', validation.error || 'Invalid URL')
      return
    }

    setScanStatus('scanning')
    setError(null)

    const startTime = Date.now()

    try {
      // Fetch image from URL
      const response = await fetch(urlInput)
      if (!response.ok) throw new Error('Failed to fetch image from URL')
      
      const blob = await response.blob()
      const file = new File([blob], 'scanned-image.png', { type: blob.type })

      // Validate file
      const fileValidation = validateFile(file)
      if (!fileValidation.valid) {
        throw new Error(fileValidation.error || 'Invalid file')
      }

      await scanImage(file, urlInput, 'url')
      
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
        setError(validation.error)
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
        ipId,
        status: 'unknown',
        scannedAt: new Date().toISOString(),
      }

      // Track detection
      if (ipId) {
        trackDetection('watermark')
      }

      // Step 2: Verify watermark with Story Protocol
      if (ipId && storyService) {
        const ipAsset = await storyService.getIPAsset(ipId)
        result.owner = ipAsset?.owner
        result.status = ipAsset ? 'protected' : 'violation'
        
        if (result.status === 'violation') {
          trackViolation()
        }
      }

      // Step 3: C2PA Verification (if enabled)
      if (enableC2PAVerification) {
        try {
          const c2paResult = await verifyC2PAManifest(file)
          if (c2paResult.isValid && c2paResult.manifest) {
            console.log('[Monitor] ✅ C2PA manifest found')
            trackDetection('c2pa')
            
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

      // Step 4: Reverse Image Search (if enabled)
      if (enableReverseSearch) {
        try {
          showToast('info', 'Searching for image usage online...')
          
          // Use Yandex (free, but limited functionality)
          console.log('[Monitor] Using reverse search provider: yandex')
          
          const searchResult = await reverseImageSearch({ 
            imageFile: file,
            provider: 'yandex'
          })
          
          if (searchResult.found && searchResult.matches.length > 0) {
            console.log('[Monitor] 🔍 Found', searchResult.totalMatches, 'matches online')
            trackDetection('reverse_search')
            
            // Store reverse search matches separately
            result.reverseSearchMatches = searchResult.matches
            
            // If no watermark found but reverse search found matches, mark as potential violation
            if (!result.ipId && result.status === 'unknown') {
              result.status = 'similar_detected'
            }
          } else {
            console.log('[Monitor] No matches found via reverse search')
          }
        } catch (reverseError) {
          console.warn('Reverse search failed (non-critical):', reverseError)
          // Don't throw - reverse search is optional
        }
      }

      // Step 6: AI-Powered Similarity Detection (if enabled and no watermark found)
      if (!ipId && enableAIDetection && myIPAssets && myIPAssets.length > 0) {
        try {
          showToast('info', 'Running AI similarity detection...')
          
          // Compare with registered IP assets
          const violations = await checkForViolations(
            file,
            myIPAssets.map(asset => ({
              ipId: asset.id,
              imageUrl: asset.metadata?.metadataURI || '',
            })).filter(a => a.imageUrl)
          )

          if (violations.length > 0) {
            result.status = 'similar_detected'
            result.similarityMatches = violations.map(v => ({
              ipId: v.ipId,
              similarity: v.similarity.score,
              confidence: v.similarity.confidence,
            }))
            
            // Track similarity detection and violations
            trackDetection('similarity')
            trackViolation()
            
            showToast('warning', `Found ${violations.length} similar image(s)`)
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
          showToast('success', 'Watermark detected and verified!')
        } else if (result.status === 'violation') {
          showToast('warning', 'Potential violation detected - watermark found but IP not registered')
        } else if (result.status === 'similar_detected') {
          showToast('warning', 'Similar images detected - possible violation')
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
    setSelectedFiles(prev => prev.filter((_, i) => i !== index))
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
            <button
              onClick={() => {
                setScanMode('single')
                setSelectedFiles([])
                setUrlInput('')
              }}
              className={`px-4 py-2 rounded-lg transition-colors ${
                scanMode === 'single'
                  ? 'bg-indigo text-white'
                  : 'bg-gray-100 glass text-gray-700 text-white/70'
              }`}
            >
              Single Scan
            </button>
            <button
              onClick={() => {
                setScanMode('batch')
                setUrlInput('')
              }}
              className={`px-4 py-2 rounded-lg transition-colors ${
                scanMode === 'batch'
                  ? 'bg-indigo text-white'
                  : 'bg-gray-100 glass text-gray-700 text-white/70'
              }`}
            >
              Batch Scan
            </button>
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
            <label className="flex items-center space-x-2 cursor-pointer p-2 rounded hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors" title="Reverse image search (limited functionality - no free API available)">
              <input
                type="checkbox"
                checked={enableReverseSearch}
                onChange={(e) => setEnableReverseSearch(e.target.checked)}
                className="w-4 h-4 text-indigo rounded focus:ring-indigo"
              />
              <span className="text-xs text-gray-700 text-white/70">Reverse Search</span>
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
            {scanMode === 'batch' ? 'Upload Multiple Images' : 'Upload Image'}
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
              {scanMode === 'batch' ? 'Multiple images supported' : 'PNG, JPG, GIF up to 10MB'}
            </p>
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              multiple={scanMode === 'batch'}
              onChange={handleFileSelect}
              className="hidden"
            />
          </div>

          {selectedFiles.length > 0 && (
            <div className="mt-4 space-y-2">
              {selectedFiles.map((file, index) => (
                <div key={index} className="flex items-center justify-between p-3 bg-gray-50 glass rounded-lg">
                  <div className="flex items-center space-x-2">
                    <FileImage className="w-4 h-4 text-gray-500" />
                    <span className="text-sm text-gray-700 text-white/70">{file.name}</span>
                  </div>
                  <button
                    onClick={() => handleRemoveFile(index)}
                    className="p-1 hover:bg-gray-200 dark:hover:bg-gray-600 rounded transition-colors"
                  >
                    <XCircle className="w-4 h-4 text-gray-500" />
                  </button>
                </div>
              ))}
              <button
                onClick={handleScanFiles}
                disabled={scanStatus === 'scanning'}
                className="w-full mt-4 px-6 py-3 bg-indigo dark:bg-indigo-600 text-white rounded-lg hover:bg-indigo/90 dark:hover:bg-indigo-700 transition-all disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center space-x-2"
              >
                {scanStatus === 'scanning' ? (
                  <>
                    <Loader2 className="w-5 h-5 animate-spin" />
                    <span>Scanning {selectedFiles.length} images...</span>
                  </>
                ) : (
                  <>
                    <Search className="w-5 h-5" />
                    <span>Scan {selectedFiles.length} Image{selectedFiles.length > 1 ? 's' : ''}</span>
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
                      <div className="mt-3 p-3 glass-card rounded-lg">
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
                      <div className="mt-3 p-3 bg-orange-50 dark:bg-orange-900/20 rounded-lg border border-orange-200 dark:border-orange-800">
                        <p className="text-xs font-medium text-orange-800 dark:text-orange-300 mb-2">
                          <Brain className="w-3 h-3 inline mr-1" />
                          AI Detected Similar Images:
                        </p>
                        {result.similarityMatches.map((match, idx) => (
                          <div key={idx} className="text-xs text-orange-700 dark:text-orange-400 mt-1">
                            IP {match.ipId.slice(0, 10)}... - {Math.round(match.similarity * 100)}% similar ({match.confidence})
                          </div>
                        ))}
                      </div>
                    )}

                    {/* Reverse Search Matches */}
                    {result.reverseSearchMatches && result.reverseSearchMatches.length > 0 && (
                      <div className="mt-3 p-3 bg-blue-50 dark:bg-blue-900/20 rounded-lg border border-blue-200 dark:border-blue-800">
                        <p className="text-xs font-medium text-blue-800 dark:text-blue-300 mb-2">
                          <Globe className="w-3 h-3 inline mr-1" />
                          Found Online ({result.reverseSearchMatches.length} matches):
                        </p>
                        {result.reverseSearchMatches.slice(0, 5).map((match, idx) => (
                          <div key={idx} className="text-xs text-blue-700 dark:text-blue-400 mt-1 flex items-center space-x-2">
                            <LinkIcon className="w-3 h-3" />
                            <a 
                              href={match.url} 
                              target="_blank" 
                              rel="noopener noreferrer"
                              className="hover:underline truncate flex-1"
                              title={match.url}
                            >
                              {match.title || match.url}
                            </a>
                            {match.similarity && (
                              <span className="text-blue-600 dark:text-blue-400">
                                ({Math.round(match.similarity * 100)}%)
                              </span>
                            )}
                          </div>
                        ))}
                        {result.reverseSearchMatches.length > 5 && (
                          <p className="text-xs text-blue-600 dark:text-blue-400 mt-2">
                            +{result.reverseSearchMatches.length - 5} more matches
                          </p>
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
  )
}

