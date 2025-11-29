'use client'

import { motion } from 'framer-motion'
import { useState, useRef } from 'react'
import { 
  Search, 
  Upload, 
  Shield, 
  CheckCircle, 
  XCircle,
  Loader2,
  FileImage,
  ExternalLink,
  Copy,
  AlertCircle,
  Eye
} from 'lucide-react'
import { extractWatermarkFromImage } from '@/lib/watermark'
import { useStoryService } from '@/hooks/useStoryProtocol'
import { useToast } from '@/contexts/ToastContext'
import { addActivity } from '@/lib/activity-tracker'
import { verifyC2PAManifest, extractC2PAProvenance } from '@/services/c2pa-service'

type VerifyStatus = 'idle' | 'uploading' | 'analyzing' | 'verified' | 'not_found' | 'error'

interface VerificationResult {
  hasWatermark: boolean
  ipId?: string
  owner?: string
  registeredAt?: string
  metadata?: {
    prompt?: string
    model?: string
    createdAt?: string
  }
  c2paProvenance?: {
    hasProvenance: boolean
    creator?: string
    created?: string
    generator?: string
  }
}

export default function VerifyPage() {
  const [selectedFile, setSelectedFile] = useState<File | null>(null)
  const [preview, setPreview] = useState<string | null>(null)
  const [status, setStatus] = useState<VerifyStatus>('idle')
  const [result, setResult] = useState<VerificationResult | null>(null)
  const [error, setError] = useState<string | null>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const { showToast } = useToast()

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (file) {
      if (!file.type.startsWith('image/')) {
        setError('Please select an image file')
        return
      }
      setSelectedFile(file)
      setError(null)
      setResult(null)
      setStatus('idle')
      
      // Create preview
      const reader = new FileReader()
      reader.onloadend = () => {
        setPreview(reader.result as string)
      }
      reader.readAsDataURL(file)
    }
  }

  const storyService = useStoryService()

  const handleVerify = async () => {
    if (!selectedFile) return

    setStatus('uploading')
    setError(null)
    setResult(null)

    try {
      // Step 1: Extract watermark from image
      setStatus('analyzing')
      console.log('[Verify] Starting watermark extraction from file:', {
        name: selectedFile.name,
        type: selectedFile.type,
        size: selectedFile.size
      })
      
      const ipId = await extractWatermarkFromImage(selectedFile)
      
      console.log('[Verify] Watermark extraction result:', {
        ipId,
        found: !!ipId
      })

      if (!ipId) {
        // No watermark found
        console.warn('[Verify] No watermark found in image')
        setResult({
          hasWatermark: false,
        })
        setStatus('not_found')
        return
      }
      
      console.log('[Verify] ✅ Watermark found! IP ID:', ipId)

      if (!storyService) {
        throw new Error('Story Protocol service not available. Please connect your wallet.')
      }

      // Step 2: Get IP Asset details from Story Protocol
      const ipAsset = await storyService.getIPAsset(ipId)

      if (!ipAsset) {
        // IP Asset not found on Story Protocol
        setResult({
          hasWatermark: false
        })
        setStatus('not_found')
        return
      }

      // Step 3: Verify ownership (optional - can verify against expected owner)
      const verificationResult = await storyService.verifyIPAsset(ipId)

      if (!verificationResult.isValid) {
        setResult({
          hasWatermark: false
        })
        setStatus('not_found')
        return
      }

      // Step 4: C2PA Verification (if available)
      let c2paProvenance
      try {
        const provenance = await extractC2PAProvenance(selectedFile)
        if (provenance.hasProvenance) {
          c2paProvenance = provenance
          console.log('[Verify] ✅ C2PA provenance found:', provenance)
        }
      } catch (c2paError) {
        console.warn('[Verify] C2PA verification failed (non-critical):', c2paError)
      }

      // Success: Watermark found and IP Asset verified
      setResult({
        hasWatermark: true,
        ipId: ipAsset.id,
        owner: ipAsset.owner,
        registeredAt: ipAsset.registeredAt,
        metadata: ipAsset.metadata,
        c2paProvenance,
      })

      setStatus('verified')
      showToast('success', 'Watermark detected and verified!')
      
      // Track activity
      addActivity({
        type: 'ip_verified',
        title: 'IP Asset Verified',
        description: `Verified watermark for IP Asset ${ipAsset.id.slice(0, 10)}...`,
        metadata: {
          ipId: ipAsset.id,
          owner: ipAsset.owner,
        },
      })
      
      // Update verification count
      const currentCount = parseInt(localStorage.getItem('verification_count') || '0')
      localStorage.setItem('verification_count', (currentCount + 1).toString())
    } catch (err: any) {
      console.error('Verification error:', err)
      const errorMessage = err.message || 'Failed to verify image. Please try again.'
      setError(errorMessage)
      setStatus('error')
      
      // Show helpful error messages
      if (errorMessage.includes('service not available')) {
        const msg = 'Please connect your wallet to verify images with Story Protocol.'
        setError(msg)
        showToast('warning', msg)
      } else if (errorMessage.includes('not found')) {
        const msg = 'IP Asset not found on Story Protocol. This image may not be registered.'
        setError(msg)
        showToast('warning', msg)
      } else {
        showToast('error', errorMessage)
      }
    }
  }

  const handleReset = () => {
    setSelectedFile(null)
    setPreview(null)
    setStatus('idle')
    setResult(null)
    setError(null)
    if (fileInputRef.current) {
      fileInputRef.current.value = ''
    }
  }

  const handleCopyIpId = () => {
    if (result?.ipId) {
      navigator.clipboard.writeText(result.ipId)
      showToast('success', 'IP Asset ID copied to clipboard!')
    }
  }

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'long',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    })
  }

  return (
    <div className="max-w-6xl mx-auto">
      <motion.div
        initial={{ opacity: 0, y: -20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.6 }}
        className="mb-8"
      >
        <h1 className="text-3xl font-bold text-white mb-2">Verify Origin</h1>
        <p className="text-white/70">Upload an image to check if it has StorySeal protection and view its provenance</p>
      </motion.div>

      <div className="grid lg:grid-cols-2 gap-6">
        {/* Left: Upload Area */}
        <motion.div
          initial={{ opacity: 0, x: -20 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ duration: 0.6, delay: 0.2 }}
          className="space-y-6"
        >
          {/* Upload Card */}
          <div className="glass-card rounded-xl border border-white/10 p-6">
            <h3 className="text-lg font-semibold text-white mb-4">Upload Image</h3>
            
            {!preview ? (
              <div
                onClick={() => fileInputRef.current?.click()}
                className="border-2 border-dashed border-white/20 rounded-xl p-12 text-center cursor-pointer hover:border-indigo-400 transition-colors glass-card-hover"
              >
                <Upload className="w-12 h-12 text-white/60 mx-auto mb-4" />
                <p className="text-white/80 mb-2 font-medium">
                  Click to upload or drag and drop
                </p>
                <p className="text-sm text-white/60">
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
            ) : (
              <div className="space-y-4">
                <div className="relative aspect-square bg-white/5 rounded-xl overflow-hidden border border-white/10">
                  <img
                    src={preview}
                    alt="Preview"
                    className="w-full h-full object-cover"
                  />
                  <button
                    onClick={handleReset}
                    className="absolute top-2 right-2 p-2 glass-card rounded-full shadow-lg hover:scale-110 transition-all"
                  >
                    <XCircle className="w-5 h-5 text-white/80" />
                  </button>
                </div>
                <div className="flex items-center justify-between text-sm text-white/70">
                  <span className="flex items-center space-x-2">
                    <FileImage className="w-4 h-4" />
                    <span>{selectedFile?.name}</span>
                  </span>
                  <span>{(selectedFile?.size || 0) / 1024 / 1024} MB</span>
                </div>
              </div>
            )}

            {error && (
              <div className="mt-4 p-3 bg-red-500/10 border border-red-500/30 rounded-lg flex items-center space-x-2 text-sm text-red-300">
                <AlertCircle className="w-4 h-4" />
                <span>{error}</span>
              </div>
            )}
          </div>

          {/* Verify Button */}
          {preview && status !== 'verified' && status !== 'not_found' && (
            <button
              onClick={handleVerify}
              disabled={status === 'uploading' || status === 'analyzing'}
              className="w-full flex items-center justify-center space-x-2 px-6 py-4 bg-gradient-primary text-white rounded-xl hover:shadow-glow-indigo transition-all disabled:opacity-50 disabled:cursor-not-allowed font-medium shadow-lg shadow-indigo-500/30 hover:scale-105 duration-300"
            >
              {status === 'uploading' || status === 'analyzing' ? (
                <>
                  <Loader2 className="w-5 h-5 animate-spin" />
                  <span>{status === 'uploading' ? 'Uploading...' : 'Analyzing watermark...'}</span>
                </>
              ) : (
                <>
                  <Search className="w-5 h-5" />
                  <span>Verify Image</span>
                </>
              )}
            </button>
          )}

          {/* Status Card */}
          {(status === 'uploading' || status === 'analyzing') && (
            <motion.div
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              className="glass-card rounded-xl border border-white/10 p-6"
            >
              <div className="flex items-center space-x-3">
                <Loader2 className="w-5 h-5 text-indigo-400 animate-spin" />
                <div>
                  <p className="text-sm font-medium text-white">
                    {status === 'uploading' ? 'Uploading image...' : 'Detecting watermark...'}
                  </p>
                  <p className="text-xs text-white/60 mt-1">
                    {status === 'uploading' 
                      ? 'Preparing image for analysis' 
                      : 'Scanning for StorySeal watermark'}
                  </p>
                </div>
              </div>
            </motion.div>
          )}
        </motion.div>

        {/* Right: Results */}
        <motion.div
          initial={{ opacity: 0, x: 20 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ duration: 0.6, delay: 0.3 }}
          className="space-y-6"
        >
          {/* Verified Result */}
          {status === 'verified' && result?.hasWatermark && (
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              className="bg-green-50 bg-green-500/10 rounded-xl border border-green-200 border-green-400/30 p-6"
            >
              <div className="flex items-center space-x-3 mb-6">
                <div className="w-12 h-12 bg-green-100 bg-green-500/20 rounded-full flex items-center justify-center">
                  <CheckCircle className="w-6 h-6 text-green-600 text-green-300" />
                </div>
                <div>
                  <h3 className="text-lg font-semibold text-green-900 text-green-200">
                    Watermark Detected
                  </h3>
                  <p className="text-sm text-green-700 text-green-300">
                    This image is protected by StorySeal
                  </p>
                </div>
              </div>

              <div className="space-y-4">
                {/* IP Asset ID */}
                {result.ipId && (
                  <div className="bg-white glass rounded-lg p-4">
                    <div className="flex items-center justify-between mb-2">
                      <p className="text-xs font-medium text-gray-500 text-white/70 uppercase">IP Asset ID</p>
                      <button
                        onClick={handleCopyIpId}
                        className="p-1 hover:bg-gray-100 hover:bg-white/10 rounded transition-colors"
                      >
                        <Copy className="w-4 h-4 text-gray-600 text-white/70" />
                      </button>
                    </div>
                    <p className="text-sm font-mono text-gray-900 dark:text-white break-all">{result.ipId}</p>
                  </div>
                )}

                {/* Owner */}
                {result.owner && (
                  <div className="bg-white glass rounded-lg p-4">
                    <p className="text-xs font-medium text-gray-500 text-white/70 uppercase mb-2">Owner</p>
                    <p className="text-sm font-mono text-gray-900 dark:text-white break-all">{result.owner}</p>
                  </div>
                )}

                {/* Registration Date */}
                {result.registeredAt && (
                  <div className="bg-white glass rounded-lg p-4">
                    <p className="text-xs font-medium text-gray-500 text-white/70 uppercase mb-2">Registered</p>
                    <p className="text-sm text-gray-900 dark:text-white">{formatDate(result.registeredAt)}</p>
                  </div>
                )}

                {/* C2PA Provenance */}
                {result.c2paProvenance && result.c2paProvenance.hasProvenance && (
                  <div className="bg-blue-50 dark:bg-blue-900/20 rounded-lg p-4 border border-blue-200 dark:border-blue-800">
                    <div className="flex items-center space-x-2 mb-3">
                      <Shield className="w-4 h-4 text-blue-600 dark:text-blue-400" />
                      <p className="text-xs font-medium text-blue-900 dark:text-blue-300 uppercase">C2PA Provenance</p>
                    </div>
                    <div className="space-y-2 text-sm">
                      {result.c2paProvenance.creator && (
                        <div>
                          <span className="text-blue-700 dark:text-blue-400">Creator: </span>
                          <span className="text-blue-900 dark:text-blue-300 font-mono text-xs">{result.c2paProvenance.creator}</span>
                        </div>
                      )}
                      {result.c2paProvenance.created && (
                        <div>
                          <span className="text-blue-700 dark:text-blue-400">Created: </span>
                          <span className="text-blue-900 dark:text-blue-300">{formatDate(result.c2paProvenance.created)}</span>
                        </div>
                      )}
                      {result.c2paProvenance.generator && (
                        <div>
                          <span className="text-blue-700 dark:text-blue-400">Generator: </span>
                          <span className="text-blue-900 dark:text-blue-300">{result.c2paProvenance.generator}</span>
                        </div>
                      )}
                    </div>
                  </div>
                )}


                {/* Metadata */}
                {result.metadata && (
                  <div className="bg-white glass rounded-lg p-4">
                    <p className="text-xs font-medium text-gray-500 text-white/70 uppercase mb-3">Metadata</p>
                    <div className="space-y-2 text-sm">
                      {result.metadata.prompt && (
                        <div>
                          <span className="text-gray-500 text-white/70">Prompt: </span>
                          <span className="text-gray-900 dark:text-white">{result.metadata.prompt}</span>
                        </div>
                      )}
                      {result.metadata.model && (
                        <div>
                          <span className="text-gray-500 text-white/70">Model: </span>
                          <span className="text-gray-900 dark:text-white">{result.metadata.model}</span>
                        </div>
                      )}
                      {result.metadata.createdAt && (
                        <div>
                          <span className="text-gray-500 text-white/70">Created: </span>
                          <span className="text-gray-900 dark:text-white">{formatDate(result.metadata.createdAt)}</span>
                        </div>
                      )}
                    </div>
                  </div>
                )}

                {/* Actions */}
                <div className="flex space-x-3 pt-2">
                  {result.ipId && (
                    <a
                      href={`https://aeneid.explorer.story.foundation/ipa/${result.ipId}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="flex-1 flex items-center justify-center space-x-2 px-4 py-2 bg-indigo dark:bg-indigo-600 text-white rounded-lg hover:bg-indigo/90 dark:hover:bg-indigo-700 transition-colors text-sm font-medium"
                    >
                      <ExternalLink className="w-4 h-4" />
                      <span>View on Story Protocol</span>
                    </a>
                  )}
                  <button
                    onClick={handleReset}
                    className="px-4 py-2 border border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-300 rounded-lg hover:bg-gray-50 hover:bg-white/10 transition-colors text-sm font-medium"
                  >
                    Verify Another
                  </button>
                </div>
              </div>
            </motion.div>
          )}

          {/* Not Found Result */}
          {status === 'not_found' && (
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              className="bg-yellow-50 dark:bg-yellow-900/20 rounded-xl border border-yellow-200 dark:border-yellow-800 p-6"
            >
              <div className="flex items-center space-x-3 mb-4">
                <div className="w-12 h-12 bg-yellow-100 dark:bg-yellow-900/40 rounded-full flex items-center justify-center">
                  <AlertCircle className="w-6 h-6 text-yellow-600 dark:text-yellow-400" />
                </div>
                <div>
                  <h3 className="text-lg font-semibold text-yellow-900 dark:text-yellow-300">
                    No Watermark Found
                  </h3>
                  <p className="text-sm text-yellow-700 dark:text-yellow-400">
                    This image is not protected by StorySeal
                  </p>
                </div>
              </div>
              <p className="text-sm text-yellow-700 dark:text-yellow-400 mb-4">
                This image does not contain a StorySeal watermark. It may not have been registered on Story Protocol, or the watermark may have been removed.
              </p>

              {/* Protect Content Section */}
              <div className="mb-4 p-4 glass-card rounded-lg border border-indigo-400/30">
                <div className="flex items-center space-x-2 mb-3">
                  <Shield className="w-4 h-4 text-indigo-400" />
                  <p className="text-xs font-medium text-white/70 uppercase">Protect This Content</p>
                </div>
                <div className="space-y-2 text-sm text-white/70 mb-4">
                  <p className="font-medium text-white">Register on Story Protocol:</p>
                  <ul className="list-disc list-inside space-y-1 ml-2">
                    <li>Claim ownership on-chain</li>
                    <li>Set licensing terms and enable remix with royalties</li>
                    <li>Track usage and detect violations automatically</li>
                  </ul>
                </div>
                <a
                  href="/dashboard/create"
                  className="w-full flex items-center justify-center space-x-2 px-4 py-2 bg-indigo-600 dark:bg-indigo-500 text-white rounded-lg hover:bg-indigo-700 dark:hover:bg-indigo-600 transition-colors text-sm font-medium"
                >
                  <Shield className="w-4 h-4" />
                  <span>Register to Story Protocol</span>
                </a>
              </div>

              <button
                onClick={handleReset}
                className="w-full px-4 py-2 border border-yellow-300 dark:border-yellow-700 text-yellow-700 dark:text-yellow-300 rounded-lg hover:bg-yellow-100 dark:hover:bg-yellow-900/40 transition-colors text-sm font-medium"
              >
                Verify Another Image
              </button>
            </motion.div>
          )}

          {/* Info Card */}
          {status === 'idle' && (
            <div className="glass-card rounded-xl border border-white/10 p-6">
              <div className="flex items-center space-x-3 mb-4">
                <Eye className="w-5 h-5 text-indigo-400" />
                <h4 className="text-sm font-semibold text-white">How Verification Works</h4>
              </div>
              <ul className="space-y-2 text-sm text-white/70">
                <li className="flex items-start space-x-2">
                  <span className="text-indigo-400 mt-1">1.</span>
                  <span>Upload an image to check for StorySeal watermark</span>
                </li>
                <li className="flex items-start space-x-2">
                  <span className="text-indigo-400 mt-1">2.</span>
                  <span>Our system scans for invisible watermark in image pixels</span>
                </li>
                <li className="flex items-start space-x-2">
                  <span className="text-indigo-400 mt-1">3.</span>
                  <span>If found, retrieve IP Asset ID and provenance from Story Protocol</span>
                </li>
                <li className="flex items-start space-x-2">
                  <span className="text-indigo-400 mt-1">4.</span>
                  <span>View ownership, registration date, and metadata</span>
                </li>
              </ul>
            </div>
          )}
        </motion.div>
      </div>
    </div>
  )
}
