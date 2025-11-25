'use client'

import { motion } from 'framer-motion'
import { useState, useEffect } from 'react'
import { useAccount } from 'wagmi'
import { useIPAssetsByOwner } from '@/hooks/useStoryProtocol'
import { useToast } from '@/contexts/ToastContext'
import { 
  FileText, 
  Image as ImageIcon, 
  Music, 
  Video,
  Search,
  Filter,
  Grid,
  List,
  Eye,
  ExternalLink,
  Copy,
  Calendar,
  Shield,
  Download,
  XCircle,
  RefreshCw,
  AlertTriangle,
  CheckCircle2
} from 'lucide-react'

type AssetType = 'image' | 'video' | 'audio' | 'document'
type ViewMode = 'grid' | 'list'

interface IPAsset {
  id: string
  ipId: string
  name: string
  type: AssetType
  thumbnail: string
  registeredAt: string
  status: 'protected' | 'pending'
  metadata?: {
    prompt?: string
    model?: string
  }
}


const typeIcons = {
  image: ImageIcon,
  video: Video,
  audio: Music,
  document: FileText
}

const typeColors = {
  image: 'bg-indigo-500/20 text-indigo-300',
  video: 'bg-green-500/20 text-green-300',
  audio: 'bg-purple-500/20 text-purple-300',
  document: 'bg-white/10 text-white/70'
}

export default function AssetsPage() {
  const { address, isConnected } = useAccount()
  const { data: storyAssets, isLoading: isLoadingAssets, refetch } = useIPAssetsByOwner(address)
  const { showToast } = useToast()
  const [searchQuery, setSearchQuery] = useState('')
  const [selectedType, setSelectedType] = useState<AssetType | 'all'>('all')
  const [viewMode, setViewMode] = useState<ViewMode>('grid')
  const [selectedAsset, setSelectedAsset] = useState<IPAsset | null>(null)
  const [violations, setViolations] = useState<Map<string, any>>(new Map()) // Map<ipId, violations>
  const [checkingViolations, setCheckingViolations] = useState<Set<string>>(new Set()) // Set<ipId>
  const [autoCheckEnabled, setAutoCheckEnabled] = useState(true)
  
  // Auto-refetch when page becomes visible (user navigates here)
  useEffect(() => {
    if (address && isConnected) {
      // Multiple refetch attempts with delays to catch newly registered assets
      const timers = [
        setTimeout(() => {
          console.log('[AssetsPage] Auto-refetch attempt 1 (1s delay)')
          refetch()
        }, 1000),
        setTimeout(() => {
          console.log('[AssetsPage] Auto-refetch attempt 2 (5s delay)')
          refetch()
        }, 5000),
        setTimeout(() => {
          console.log('[AssetsPage] Auto-refetch attempt 3 (10s delay)')
          refetch()
        }, 10000),
      ]
      return () => timers.forEach(timer => clearTimeout(timer))
    }
  }, [address, isConnected, refetch])

  // Convert Story Protocol assets to UI format
  const assets: IPAsset[] = storyAssets
    ? storyAssets.map((asset, index) => ({
        id: asset.id,
        ipId: asset.id,
        name: asset.name || `IP Asset ${index + 1}`,
        type: (asset.metadata?.type as AssetType) || 'image',
        thumbnail: asset.metadata?.thumbnail || asset.metadata?.mediaUrl || 'https://via.placeholder.com/500x500/4F46E5/FFFFFF?text=IP+Asset',
        registeredAt: asset.registeredAt || new Date().toISOString(),
        status: 'protected' as const,
        metadata: {
          ...asset.metadata,
        },
      }))
    : [] // Empty array if not connected or loading

  // Debug logging
  useEffect(() => {
    if (address && isConnected) {
      console.log('[AssetsPage] Current state:', {
        address,
        isLoadingAssets,
        assetsCount: assets.length,
        storyAssetsCount: storyAssets?.length || 0,
        storyAssets: storyAssets,
      })
    }
  }, [address, isConnected, isLoadingAssets, assets.length, storyAssets])

  const filteredAssets = assets.filter(asset => {
    const matchesSearch = asset.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
                         asset.ipId.toLowerCase().includes(searchQuery.toLowerCase())
    const matchesType = selectedType === 'all' || asset.type === selectedType
    return matchesSearch && matchesType
  })

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric'
    })
  }

  const handleCopyIpId = (ipId: string) => {
    navigator.clipboard.writeText(ipId)
    showToast('success', 'IP Asset ID copied to clipboard!')
  }


  // Auto-check violations periodically
  useEffect(() => {
    if (!autoCheckEnabled || !address || assets.length === 0) return

    // Request notification permission
    if ('Notification' in window && Notification.permission === 'default') {
      Notification.requestPermission()
    }

    const checkAllViolations = async () => {
      console.log('[AssetsPage] Auto-checking violations for all assets...')
      // Violation monitoring can be implemented using similarity detection
          
          setViolations(prev => {
            const newMap = new Map(prev)
            const previousViolations = newMap.get(asset.id)
            const previousCount = previousViolations?.infringements?.length || 0
            newMap.set(asset.id, result)

            // Show notification if new violations detected
            if (result.infringements && result.infringements.length > 0 && result.infringements.length > previousCount) {
              if ('Notification' in window && Notification.permission === 'granted') {
                new Notification('New Violation Detected', {
                  body: `${result.infringements.length} violation(s) found for ${asset.name}`,
                  icon: '/favicon.ico',
                })
              }
              showToast('warning', `⚠️ ${result.infringements.length} violation(s) detected for ${asset.name}`, 5000)
            }
            
            return newMap
          })
        } catch (error) {
          console.warn(`[AssetsPage] Failed to check violations for ${asset.id}:`, error)
        }
      }
    }

    // Check immediately
    checkAllViolations()

    // Check every 5 minutes
    const interval = setInterval(checkAllViolations, 5 * 60 * 1000)

    return () => clearInterval(interval)
  }, [autoCheckEnabled, address, assets.length, showToast])

  return (
    <div className="max-w-7xl mx-auto">
      <motion.div
        initial={{ opacity: 0, y: -20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.6 }}
        className="mb-8"
      >
        <div className="flex items-center justify-between mb-4">
          <div>
            <h1 className="text-3xl font-bold text-white mb-2">My IP Assets</h1>
            <p className="text-white/70">View and manage your registered IP assets on Story Protocol</p>
          </div>
          <div className="flex items-center space-x-2">
            {/* Auto-check Toggle */}
            <div className="flex items-center space-x-2 px-3 py-2 glass-card rounded-lg border border-white/10">
              <input
                type="checkbox"
                id="auto-check-toggle"
                checked={autoCheckEnabled}
                onChange={(e) => setAutoCheckEnabled(e.target.checked)}
                className="w-4 h-4 rounded border-white/20 text-indigo-600 focus:ring-indigo-400"
              />
              <label htmlFor="auto-check-toggle" className="text-sm text-white/70 cursor-pointer">
                Auto-check violations
              </label>
            </div>
            <button
              onClick={async () => {
                showToast('info', 'Refreshing IP assets... This may take a few seconds for newly registered assets.')
                // Force multiple refetch attempts
                await refetch()
                setTimeout(() => refetch(), 2000)
                setTimeout(() => refetch(), 5000)
              }}
              disabled={isLoadingAssets}
              className="p-2 rounded-lg transition-colors bg-indigo/20 hover:bg-indigo/30 text-indigo-300 disabled:opacity-50 disabled:cursor-not-allowed"
              title="Refresh IP Assets (multiple attempts to catch new registrations)"
            >
              <RefreshCw className={`w-5 h-5 ${isLoadingAssets ? 'animate-spin' : ''}`} />
            </button>
            <button
              onClick={() => setViewMode('grid')}
              className={`p-2 rounded-lg transition-colors ${
                viewMode === 'grid'
                  ? 'bg-gradient-primary text-white'
                  : 'glass text-white/70 hover:text-white hover:glass-card-hover'
              }`}
            >
              <Grid className="w-5 h-5" />
            </button>
            <button
              onClick={() => setViewMode('list')}
              className={`p-2 rounded-lg transition-colors ${
                viewMode === 'list'
                  ? 'bg-gradient-primary text-white'
                  : 'glass text-white/70 hover:text-white hover:glass-card-hover'
              }`}
            >
              <List className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Search and Filter */}
        <div className="flex flex-col sm:flex-row gap-4 mb-6">
          <div className="flex-1 relative">
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-5 h-5 text-gray-400" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search by name or IP ID..."
              className="w-full pl-10 pr-4 py-3 glass-card rounded-lg text-white placeholder-white/50 focus:ring-2 focus:ring-indigo-400 focus:border-transparent outline-none"
            />
          </div>
          <div className="flex items-center space-x-2">
            <Filter className="w-5 h-5 text-gray-400" />
            <select
              value={selectedType}
              onChange={(e) => setSelectedType(e.target.value as AssetType | 'all')}
              className="px-4 py-3 glass-card rounded-lg text-white focus:ring-2 focus:ring-indigo-400 focus:border-transparent outline-none"
            >
              <option value="all">All Types</option>
              <option value="image">Images</option>
              <option value="video">Videos</option>
              <option value="audio">Audio</option>
              <option value="document">Documents</option>
            </select>
          </div>
        </div>

        {/* Stats */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-6">
          <div className="glass-card rounded-lg border border-white/10 p-4">
            <p className="text-sm text-white/70 mb-1">Total Assets</p>
            <p className="text-2xl font-bold text-white">{assets.length}</p>
          </div>
          <div className="glass-card rounded-lg border border-white/10 p-4">
            <p className="text-sm text-white/70 mb-1">Protected</p>
            <p className="text-2xl font-bold text-green-400">
              {assets.filter(a => a.status === 'protected').length}
            </p>
          </div>
          <div className="glass-card rounded-lg border border-white/10 p-4">
            <p className="text-sm text-white/70 mb-1">Pending</p>
            <p className="text-2xl font-bold text-yellow-400">
              {assets.filter(a => a.status === 'pending').length}
            </p>
          </div>
          <div className="glass-card rounded-lg border border-white/10 p-4">
            <p className="text-sm text-white/70 mb-1">Violations</p>
            <p className="text-2xl font-bold text-red-400">
              {Array.from(violations.values()).reduce((sum, v) => sum + (v.infringements?.length || 0), 0)}
            </p>
          </div>
        </div>
      </motion.div>

      {/* Assets Grid/List */}
      {filteredAssets.length === 0 ? (
        <div className="glass-card rounded-xl border border-white/10 p-12 text-center">
          <FileText className="w-16 h-16 text-white/40 mx-auto mb-4" />
          <h3 className="text-lg font-semibold text-white mb-2">No assets found</h3>
          <p className="text-white/70">Try adjusting your search or filter criteria</p>
        </div>
      ) : viewMode === 'grid' ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {filteredAssets.map((asset, index) => {
            const Icon = typeIcons[asset.type]
            return (
              <motion.div
                key={asset.id}
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.4, delay: index * 0.05 }}
                className="glass-card glass-card-hover rounded-xl border border-white/10 overflow-hidden cursor-pointer"
                onClick={() => setSelectedAsset(asset)}
              >
                <div className="aspect-square bg-white/5 relative overflow-hidden">
                  <img
                    src={asset.thumbnail}
                    alt={asset.name}
                    className="w-full h-full object-cover"
                  />
                  <div className="absolute top-2 right-2 flex flex-col space-y-1">
                    <div className={`px-2 py-1 rounded-lg text-xs font-medium ${
                      asset.status === 'protected'
                        ? 'bg-green-500/20 text-green-300'
                        : 'bg-yellow-500/20 text-yellow-300'
                    }`}>
                      {asset.status === 'protected' ? 'Protected' : 'Pending'}
                    </div>
                    {violations.get(asset.id)?.infringements && violations.get(asset.id)!.infringements!.length > 0 && (
                      <div className="px-2 py-1 rounded-lg text-xs font-medium bg-red-500/20 text-red-300 flex items-center space-x-1">
                        <AlertTriangle className="w-3 h-3" />
                        <span>{violations.get(asset.id)!.infringements!.length}</span>
                      </div>
                    )}
                  </div>
                  <div className="absolute bottom-2 left-2">
                    <div className={`p-2 rounded-lg ${typeColors[asset.type]}`}>
                      <Icon className="w-4 h-4" />
                    </div>
                  </div>
                </div>
                <div className="p-4">
                  <h3 className="font-semibold text-white mb-2 truncate">{asset.name}</h3>
                  <div className="flex items-center justify-between text-sm text-white/70">
                    <div className="flex items-center space-x-1">
                      <Calendar className="w-4 h-4" />
                      <span>{formatDate(asset.registeredAt)}</span>
                    </div>
                    <button
                      onClick={(e) => {
                        e.stopPropagation()
                        handleCopyIpId(asset.ipId)
                      }}
                      className="p-1 hover:bg-white/10 rounded transition-colors"
                    >
                      <Copy className="w-4 h-4 text-white/70" />
                    </button>
                  </div>
                </div>
              </motion.div>
            )
          })}
        </div>
      ) : (
        <div className="glass-card rounded-xl border border-white/10 overflow-hidden">
          {filteredAssets.map((asset, index) => {
            const Icon = typeIcons[asset.type]
            return (
              <motion.div
                key={asset.id}
                initial={{ opacity: 0, x: -20 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ duration: 0.4, delay: index * 0.05 }}
                className="p-6 border-b border-white/10 last:border-b-0 hover:bg-white/5 transition-colors cursor-pointer"
                onClick={() => setSelectedAsset(asset)}
              >
                <div className="flex items-center space-x-4">
                  <div className="w-20 h-20 bg-white/5 rounded-lg overflow-hidden flex-shrink-0">
                    <img
                      src={asset.thumbnail}
                      alt={asset.name}
                      className="w-full h-full object-cover"
                    />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center space-x-3 mb-2">
                      <h3 className="font-semibold text-white">{asset.name}</h3>
                      <div className={`p-1.5 rounded-lg ${typeColors[asset.type]}`}>
                        <Icon className="w-4 h-4" />
                      </div>
                      <div className={`px-2 py-1 rounded-lg text-xs font-medium ${
                        asset.status === 'protected'
                          ? 'bg-green-500/20 text-green-300'
                          : 'bg-yellow-500/20 text-yellow-300'
                      }`}>
                        {asset.status === 'protected' ? 'Protected' : 'Pending'}
                      </div>
                      {violations.get(asset.id)?.infringements && violations.get(asset.id)!.infringements!.length > 0 && (
                        <div className="px-2 py-1 rounded-lg text-xs font-medium bg-red-500/20 text-red-300 flex items-center space-x-1">
                          <AlertTriangle className="w-3 h-3" />
                          <span>{violations.get(asset.id)!.infringements!.length} violation(s)</span>
                        </div>
                      )}
                    </div>
                    <div className="flex items-center space-x-4 text-sm text-white/70">
                      <div className="flex items-center space-x-1">
                        <Calendar className="w-4 h-4" />
                        <span>{formatDate(asset.registeredAt)}</span>
                      </div>
                      <div className="flex items-center space-x-1">
                        <Shield className="w-4 h-4" />
                        <span className="font-mono text-xs">{asset.ipId.slice(0, 10)}...</span>
                      </div>
                    </div>
                  </div>
                  <div className="flex items-center space-x-2">
                    <button
                      onClick={(e) => {
                        e.stopPropagation()
                        handleCopyIpId(asset.ipId)
                      }}
                      className="p-2 hover:bg-white/10 rounded transition-colors"
                    >
                      <Copy className="w-4 h-4 text-white/70" />
                    </button>
                    <button
                      onClick={(e) => {
                        e.stopPropagation()
                        setSelectedAsset(asset)
                      }}
                      className="p-2 hover:bg-white/10 rounded transition-colors"
                    >
                      <Eye className="w-4 h-4 text-white/70" />
                    </button>
                  </div>
                </div>
              </motion.div>
            )
          })}
        </div>
      )}

      {/* Asset Detail Modal */}
      {selectedAsset && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm">
          <motion.div
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            className="glass-strong rounded-xl border border-white/20 max-w-2xl w-full max-h-[90vh] overflow-y-auto"
          >
            <div className="p-6">
              <div className="flex items-center justify-between mb-6">
                <h2 className="text-2xl font-bold text-white">{selectedAsset.name}</h2>
                <button
                  onClick={() => setSelectedAsset(null)}
                  className="p-2 hover:bg-white/10 rounded-lg transition-colors"
                >
                  <XCircle className="w-5 h-5 text-white/70" />
                </button>
              </div>

              <div className="aspect-square bg-white/5 rounded-lg overflow-hidden mb-6">
                <img
                  src={selectedAsset.thumbnail}
                  alt={selectedAsset.name}
                  className="w-full h-full object-cover"
                />
              </div>

              <div className="space-y-4">
                <div className="grid grid-cols-2 gap-4">
                  <div className="glass rounded-lg p-4 border border-white/10">
                    <p className="text-xs font-medium text-white/60 uppercase mb-1">Type</p>
                    <p className="text-sm font-semibold text-white capitalize">{selectedAsset.type}</p>
                  </div>
                  <div className="glass rounded-lg p-4 border border-white/10">
                    <p className="text-xs font-medium text-white/60 uppercase mb-1">Status</p>
                    <p className={`text-sm font-semibold ${
                      selectedAsset.status === 'protected'
                        ? 'text-green-400'
                        : 'text-yellow-400'
                    }`}>
                      {selectedAsset.status === 'protected' ? 'Protected' : 'Pending'}
                    </p>
                  </div>
                </div>

                <div className="glass rounded-lg p-4 border border-white/10">
                  <div className="flex items-center justify-between mb-2">
                    <p className="text-xs font-medium text-white/60 uppercase">IP Asset ID</p>
                    <button
                      onClick={() => handleCopyIpId(selectedAsset.ipId)}
                      className="p-1 hover:bg-white/10 rounded transition-colors"
                    >
                      <Copy className="w-4 h-4 text-white/70" />
                    </button>
                  </div>
                  <p className="text-sm font-mono text-white break-all">{selectedAsset.ipId}</p>
                </div>

                <div className="glass rounded-lg p-4 border border-white/10">
                  <p className="text-xs font-medium text-white/60 uppercase mb-2">Registered</p>
                  <p className="text-sm text-white">{formatDate(selectedAsset.registeredAt)}</p>
                </div>

                {selectedAsset.metadata && (
                  <div className="glass rounded-lg p-4 border border-white/10">
                    <p className="text-xs font-medium text-white/60 uppercase mb-3">Metadata</p>
                    <div className="space-y-2 text-sm">
                      {selectedAsset.metadata.prompt && (
                        <div>
                          <span className="text-white/60">Prompt: </span>
                          <span className="text-white">{selectedAsset.metadata.prompt}</span>
                        </div>
                      )}
                      {selectedAsset.metadata.model && (
                        <div>
                          <span className="text-white/60">Model: </span>
                          <span className="text-white">{selectedAsset.metadata.model}</span>
                        </div>
                      )}
                    </div>
                  </div>
                )}

                <div className="flex space-x-3 pt-4">
                  <a
                    href={`https://aeneid.explorer.story.foundation/ipa/${selectedAsset.ipId}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex-1 flex items-center justify-center space-x-2 px-4 py-3 bg-gradient-primary text-white rounded-lg hover:shadow-glow-indigo transition-all font-medium"
                  >
                    <ExternalLink className="w-4 h-4" />
                    <span>View on Story Protocol</span>
                  </a>
                  <button
                    onClick={() => {
                      // Download watermarked image
                      const link = document.createElement('a')
                      link.href = selectedAsset.thumbnail
                      link.download = `${selectedAsset.name}.png`
                      link.click()
                    }}
                    className="px-4 py-3 glass-card border border-white/20 text-white rounded-lg hover:glass-card-hover transition-colors font-medium flex items-center space-x-2"
                  >
                    <Download className="w-4 h-4" />
                    <span>Download</span>
                  </button>
                </div>
              </div>
            </div>
          </motion.div>
        </div>
      )}
    </div>
  )
}
