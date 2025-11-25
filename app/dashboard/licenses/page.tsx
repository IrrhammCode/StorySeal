'use client'

import { motion } from 'framer-motion'
import { useState, useEffect } from 'react'
import { 
  FileText, 
  Plus,
  Shield,
  Calendar,
  User,
  Copy,
  ExternalLink,
  CheckCircle,
  XCircle,
  Loader2,
  AlertCircle
} from 'lucide-react'
import { useStoryService } from '@/hooks/useStoryProtocol'
import { useAccount } from 'wagmi'
import { useToast } from '@/contexts/ToastContext'
import { addActivity } from '@/lib/activity-tracker'
import { useIPAssetsByOwner } from '@/hooks/useStoryProtocol'

interface License {
  id: string
  name: string
  ipAssetId: string
  licenseTermsId: string
  type: 'commercial' | 'nonCommercial' | 'commercialRemix' | 'ccBy'
  createdAt: string
  status: 'active' | 'expired' | 'revoked'
}

export default function LicensesPage() {
  const [licenses, setLicenses] = useState<License[]>([])
  const [showCreateModal, setShowCreateModal] = useState(false)
  const [selectedIpId, setSelectedIpId] = useState<string>('')
  const [selectedLicenseType, setSelectedLicenseType] = useState<'commercial' | 'nonCommercial' | 'commercialRemix' | 'ccBy'>('commercial')
  const [isCreating, setIsCreating] = useState(false)
  const storyService = useStoryService()
  const { address } = useAccount()
  const { data: ipAssets } = useIPAssetsByOwner(address)
  const { showToast } = useToast()

  // Load licenses from localStorage
  useEffect(() => {
    const stored = localStorage.getItem('storyseal_licenses')
    if (stored) {
      try {
        setLicenses(JSON.parse(stored))
      } catch (error) {
        console.error('Failed to load licenses:', error)
      }
    }
  }, [])

  const handleCreateLicense = async () => {
    if (!selectedIpId || !storyService) {
      showToast('error', 'Please select an IP Asset and ensure wallet is connected')
      return
    }

    setIsCreating(true)
    try {
      const result = await storyService.createLicense(selectedIpId, selectedLicenseType)
      
      const newLicense: License = {
        id: `license_${Date.now()}`,
        name: `${selectedLicenseType} License`,
        ipAssetId: selectedIpId,
        licenseTermsId: result.licenseTermsId.toString(),
        type: selectedLicenseType,
        createdAt: new Date().toISOString(),
        status: 'active',
      }

      const updated = [newLicense, ...licenses]
      setLicenses(updated)
      localStorage.setItem('storyseal_licenses', JSON.stringify(updated))

      // Track activity
      addActivity({
        type: 'license_created',
        title: 'License Created',
        description: `Created ${selectedLicenseType} license for IP Asset`,
        metadata: {
          ipId: selectedIpId,
          licenseId: newLicense.id,
          licenseType: selectedLicenseType,
        },
      })

      showToast('success', 'License created successfully!')
      setShowCreateModal(false)
      setSelectedIpId('')
    } catch (error: any) {
      console.error('Failed to create license:', error)
      showToast('error', error.message || 'Failed to create license')
    } finally {
      setIsCreating(false)
    }
  }

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric'
    })
  }

  const handleCopyLicenseId = (id: string) => {
    navigator.clipboard.writeText(id)
  }

  return (
    <div className="max-w-7xl mx-auto">
      <motion.div
        initial={{ opacity: 0, y: -20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.6 }}
        className="mb-8"
      >
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold text-white mb-2">Licenses</h1>
            <p className="text-white/70">Manage licenses for your IP assets</p>
          </div>
          <button
            onClick={() => setShowCreateModal(true)}
            className="flex items-center space-x-2 px-6 py-3 bg-gradient-primary text-white rounded-lg hover:shadow-glow-indigo transition-all font-medium"
          >
            <Plus className="w-5 h-5" />
            <span>Create License</span>
          </button>
        </div>
      </motion.div>

      {/* Stats */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
        <div className="glass-card rounded-xl border border-white/10 p-6">
          <p className="text-sm text-white/70 mb-1">Total Licenses</p>
          <p className="text-2xl font-bold text-white">{licenses.length}</p>
        </div>
        <div className="glass-card rounded-xl border border-white/10 p-6">
          <p className="text-sm text-white/70 mb-1">Active</p>
          <p className="text-2xl font-bold text-green-400">
            {licenses.filter(l => l.status === 'active').length}
          </p>
        </div>
        <div className="glass-card rounded-xl border border-white/10 p-6">
          <p className="text-sm text-white/70 mb-1">Total Royalties</p>
          <p className="text-2xl font-bold text-indigo-300">
            {licenses.length}
          </p>
        </div>
      </div>

      {/* Licenses List */}
      <div className="glass-card rounded-xl border border-white/10 overflow-hidden">
        {licenses.length === 0 ? (
          <div className="p-12 text-center">
            <Shield className="w-16 h-16 text-white/40 mx-auto mb-4" />
            <h3 className="text-lg font-semibold text-white mb-2">No licenses yet</h3>
            <p className="text-white/70">Create your first license to get started</p>
          </div>
        ) : (
          <div className="divide-y divide-white/10">
            {licenses.map((license, index) => (
              <motion.div
                key={license.id}
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.4, delay: index * 0.05 }}
                className="p-6 hover:bg-white/5 transition-colors"
              >
                <div className="flex items-start justify-between">
                  <div className="flex-1">
                    <div className="flex items-center space-x-3 mb-3">
                      <h3 className="text-lg font-semibold text-white">{license.name}</h3>
                      <span className={`px-3 py-1 rounded-full text-xs font-semibold ${
                        license.status === 'active'
                          ? 'bg-green-500/20 text-green-300'
                          : license.status === 'expired'
                          ? 'bg-white/10 text-white/70'
                          : 'bg-red-500/20 text-red-300'
                      }`}>
                        {license.status}
                      </span>
                      <span className={`px-3 py-1 rounded-full text-xs font-semibold ${
                        license.type === 'commercial'
                          ? 'bg-indigo-500/20 text-indigo-300'
                          : license.type === 'commercialRemix'
                          ? 'bg-purple-500/20 text-purple-300'
                          : license.type === 'ccBy'
                          ? 'bg-blue-500/20 text-blue-300'
                          : 'bg-white/10 text-white/70'
                      }`}>
                        {license.type}
                      </span>
                    </div>

                    <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
                      <div>
                        <p className="text-white/60 mb-1">IP Asset</p>
                        <p className="font-mono text-xs text-white break-all">
                          {license.ipAssetId.slice(0, 10)}...{license.ipAssetId.slice(-8)}
                        </p>
                      </div>
                      <div>
                        <p className="text-white/60 mb-1">License Terms ID</p>
                        <p className="font-mono text-xs text-white break-all">
                          {license.licenseTermsId}
                        </p>
                      </div>
                      <div>
                        <p className="text-white/60 mb-1">Created</p>
                        <p className="text-white">{formatDate(license.createdAt)}</p>
                      </div>
                      <div>
                        <p className="text-white/60 mb-1">Type</p>
                        <p className="text-white capitalize">{license.type}</p>
                      </div>
                    </div>
                  </div>

                  <div className="flex items-center space-x-2 ml-4">
                    <button
                      onClick={() => handleCopyLicenseId(license.id)}
                      className="p-2 hover:bg-white/10 rounded transition-colors"
                    >
                      <Copy className="w-4 h-4 text-white/70" />
                    </button>
                    <a
                      href={`https://aeneid.explorer.story.foundation/ipa/${license.ipAssetId}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="p-2 hover:bg-white/10 rounded transition-colors"
                    >
                      <ExternalLink className="w-4 h-4 text-white/70" />
                    </a>
                  </div>
                </div>
              </motion.div>
            ))}
          </div>
        )}
      </div>

      {/* Create License Modal */}
      {showCreateModal && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <motion.div
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            className="glass-strong rounded-xl border border-white/20 p-6 max-w-md w-full"
          >
            <h2 className="text-xl font-bold text-white mb-4">Create License</h2>
            
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-white/90 mb-2">
                  IP Asset
                </label>
                <select
                  value={selectedIpId}
                  onChange={(e) => setSelectedIpId(e.target.value)}
                  className="w-full px-4 py-2 glass-card rounded-lg text-white border border-white/20"
                >
                  <option value="">Select an IP Asset</option>
                  {ipAssets?.map((asset) => (
                    <option key={asset.id} value={asset.id}>
                      {asset.name || asset.id.slice(0, 20)}...
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-sm font-medium text-white/90 mb-2">
                  License Type
                </label>
                <select
                  value={selectedLicenseType}
                  onChange={(e) => setSelectedLicenseType(e.target.value as any)}
                  className="w-full px-4 py-2 glass-card rounded-lg text-white border border-white/20"
                >
                  <option value="commercial">Commercial Use</option>
                  <option value="nonCommercial">Non-Commercial Social Remixing</option>
                  <option value="commercialRemix">Commercial Remix</option>
                  <option value="ccBy">Creative Commons Attribution (CC-BY)</option>
                </select>
              </div>
            </div>

            <div className="flex items-center justify-end space-x-3 mt-6">
              <button
                onClick={() => {
                  setShowCreateModal(false)
                  setSelectedIpId('')
                }}
                className="px-4 py-2 text-white/90 hover:bg-white/10 rounded-lg transition-colors glass"
                disabled={isCreating}
              >
                Cancel
              </button>
              <button
                onClick={handleCreateLicense}
                disabled={isCreating || !selectedIpId}
                className="px-4 py-2 bg-gradient-primary text-white rounded-lg hover:shadow-glow-indigo transition-all disabled:opacity-50 disabled:cursor-not-allowed flex items-center space-x-2"
              >
                {isCreating ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    <span>Creating...</span>
                  </>
                ) : (
                  <span>Create License</span>
                )}
              </button>
            </div>
          </motion.div>
        </div>
      )}
    </div>
  )
}

