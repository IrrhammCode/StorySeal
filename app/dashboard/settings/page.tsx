'use client'

import { motion } from 'framer-motion'
import { useState, useEffect } from 'react'
import { 
  Settings as SettingsIcon,
  Key,
  Bell,
  Network,
  Save,
  CheckCircle,
  AlertCircle,
  Eye,
  EyeOff,
  Droplet,
  ExternalLink,
  Copy,
  Sparkles
} from 'lucide-react'
import { useToast } from '@/contexts/ToastContext'
import { useStoryService, useFundWallet } from '@/hooks/useStoryProtocol'
import { useAccount } from 'wagmi'

export default function SettingsPage() {
  const { address, isConnected } = useAccount()
  const storyService = useStoryService()
  const fundWalletMutation = useFundWallet()
  const [abvApiKey, setAbvApiKey] = useState('')
  const [showApiKey, setShowApiKey] = useState(false)
  const [geminiApiKey, setGeminiApiKey] = useState('')
  const [showGeminiApiKey, setShowGeminiApiKey] = useState(false)
  const [tineyeApiKey, setTineyeApiKey] = useState('')
  const [showTineyeApiKey, setShowTineyeApiKey] = useState(false)
  const [pinataJwtToken, setPinataJwtToken] = useState('')
  const [showPinataJwtToken, setShowPinataJwtToken] = useState(false)
  const [pinataApiKey, setPinataApiKey] = useState('')
  const [showPinataApiKey, setShowPinataApiKey] = useState(false)
  const [pinataSecretKey, setPinataSecretKey] = useState('')
  const [showPinataSecretKey, setShowPinataSecretKey] = useState(false)
  const [storyRpcUrl, setStoryRpcUrl] = useState('https://aeneid.storyrpc.io')
  const [notifications, setNotifications] = useState({
    violations: true,
    registrations: true,
    verifications: false,
  })
  const [saved, setSaved] = useState(false)
  const { showToast } = useToast()

  // Load settings from localStorage on mount
  useEffect(() => {
    if (typeof window !== 'undefined') {
      const storedApiKey = localStorage.getItem('abv_api_key')
      const storedGeminiApiKey = localStorage.getItem('gemini_api_key')
      const storedTineyeApiKey = localStorage.getItem('tineye_api_key')
      const storedPinataJwt = localStorage.getItem('pinata_jwt_token')
      const storedPinataApiKey = localStorage.getItem('pinata_api_key')
      const storedPinataSecretKey = localStorage.getItem('pinata_secret_key')
      const storedRpcUrl = localStorage.getItem('story_rpc_url')
      const storedNotifications = localStorage.getItem('notifications')
      
      if (storedApiKey) setAbvApiKey(storedApiKey)
      if (storedGeminiApiKey) setGeminiApiKey(storedGeminiApiKey)
      if (storedTineyeApiKey) setTineyeApiKey(storedTineyeApiKey)
      if (storedPinataJwt) setPinataJwtToken(storedPinataJwt)
      if (storedPinataApiKey) setPinataApiKey(storedPinataApiKey)
      if (storedPinataSecretKey) setPinataSecretKey(storedPinataSecretKey)
      if (storedRpcUrl) setStoryRpcUrl(storedRpcUrl)
      if (storedNotifications) {
        try {
          setNotifications(JSON.parse(storedNotifications))
        } catch (e) {
          console.error('Failed to parse notifications:', e)
        }
      }
    }
  }, [])

  const handleSave = () => {
    // Save to localStorage (in production, this would be saved securely)
    if (abvApiKey) {
      localStorage.setItem('abv_api_key', abvApiKey)
    }
    
    // Gemini AI API Key
    if (geminiApiKey) {
      localStorage.setItem('gemini_api_key', geminiApiKey)
    } else {
      localStorage.removeItem('gemini_api_key')
    }
    
    // TinEye API Key
    if (tineyeApiKey) {
      localStorage.setItem('tineye_api_key', tineyeApiKey)
    } else {
      localStorage.removeItem('tineye_api_key')
    }
    
    // Pinata credentials - save all that are provided
    if (pinataApiKey) {
      localStorage.setItem('pinata_api_key', pinataApiKey)
      console.log('[Settings] Saved Pinata API Key')
    }
    if (pinataSecretKey) {
      localStorage.setItem('pinata_secret_key', pinataSecretKey)
      console.log('[Settings] Saved Pinata Secret Key')
    }
    if (pinataJwtToken) {
      localStorage.setItem('pinata_jwt_token', pinataJwtToken)
      console.log('[Settings] Saved Pinata JWT Token')
    }
    
    // Clear credentials if fields are empty (to allow switching)
    if (!pinataApiKey) {
      localStorage.removeItem('pinata_api_key')
    }
    if (!pinataSecretKey) {
      localStorage.removeItem('pinata_secret_key')
    }
    if (!pinataJwtToken) {
      localStorage.removeItem('pinata_jwt_token')
    }
    
    localStorage.setItem('story_rpc_url', storyRpcUrl)
    localStorage.setItem('notifications', JSON.stringify(notifications))
    
    setSaved(true)
    showToast('success', 'Settings saved successfully!')
    setTimeout(() => setSaved(false), 3000)
  }

  return (
    <div className="max-w-4xl mx-auto">
      <motion.div
        initial={{ opacity: 0, y: -20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.6 }}
        className="mb-8"
      >
        <h1 className="text-3xl font-bold text-white mb-2">Settings</h1>
        <p className="text-white/70">Manage your StorySeal configuration and preferences</p>
      </motion.div>

      {/* API Keys */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.6, delay: 0.1 }}
        className="glass-card rounded-xl border border-white/10 p-6 mb-6"
      >
        <div className="flex items-center space-x-3 mb-6">
          <div className="w-10 h-10 bg-indigo-500/20 rounded-lg flex items-center justify-center">
            <Key className="w-5 h-5 text-indigo-300" />
          </div>
          <div>
            <h2 className="text-xl font-semibold text-white">API Keys</h2>
            <p className="text-sm text-white/70">Configure your API keys for external services</p>
          </div>
        </div>

        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-white/90 mb-2">
              ABV.dev API Key
            </label>
            <div className="relative">
              <input
                type={showApiKey ? 'text' : 'password'}
                value={abvApiKey}
                onChange={(e) => setAbvApiKey(e.target.value)}
                placeholder="Enter your ABV.dev API key"
                className="w-full px-4 py-3 pr-12 glass-card rounded-lg text-white placeholder-white/50 focus:ring-2 focus:ring-indigo-400 focus:border-transparent outline-none"
              />
              <button
                onClick={() => setShowApiKey(!showApiKey)}
                className="absolute right-3 top-1/2 transform -translate-y-1/2 p-1 hover:bg-white/10 rounded transition-colors"
              >
                {showApiKey ? (
                  <EyeOff className="w-5 h-5 text-white/70" />
                ) : (
                  <Eye className="w-5 h-5 text-white/70" />
                )}
              </button>
            </div>
            <p className="text-xs text-white/60 mt-2">
              Used for AI image generation. Get your key from ABV.dev dashboard.
            </p>
            <div className="mt-3 p-3 bg-blue-500/10 border border-blue-400/30 rounded-lg">
              <p className="text-xs text-blue-300 mb-2">
                <strong>💡 Enable Story Protocol Integration:</strong>
              </p>
              <p className="text-xs text-blue-200/90 mb-2">
                1. Set API key di sini dan klik <strong>"Save Settings"</strong> (tombol di bawah)
              </p>
              <p className="text-xs text-blue-200/90">
                2. Login ke <a href="https://app.abv.dev" target="_blank" rel="noopener noreferrer" className="underline font-semibold">ABV.dev dashboard</a> → Settings → Enable Story Protocol integration
              </p>
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-white/90 mb-2">
              <div className="flex items-center space-x-2">
                <Sparkles className="w-4 h-4 text-orange-500" />
                <span>Gemini AI API Key</span>
              </div>
            </label>
            <div className="relative">
              <input
                type={showGeminiApiKey ? 'text' : 'password'}
                value={geminiApiKey}
                onChange={(e) => setGeminiApiKey(e.target.value)}
                placeholder="Enter your Gemini AI API key"
                className="w-full px-4 py-3 pr-12 border border-white/20 rounded-lg glass-card text-white placeholder-white/50 focus:ring-2 focus:ring-indigo focus:border-transparent outline-none"
              />
              <button
                onClick={() => setShowGeminiApiKey(!showGeminiApiKey)}
                className="absolute right-3 top-1/2 transform -translate-y-1/2 p-1 hover:bg-white/10 rounded transition-colors"
              >
                {showGeminiApiKey ? (
                  <EyeOff className="w-5 h-5 text-white/70" />
                ) : (
                  <Eye className="w-5 h-5 text-white/70" />
                )}
              </button>
            </div>
            <p className="text-xs text-white/70 mt-2">
              Used for Gemini AI image generation. Get your key from{' '}
              <a href="https://ai.google.dev/" target="_blank" rel="noopener noreferrer" className="text-indigo hover:underline">
                Google AI Studio
              </a>
              {' '}or{' '}
              <a href="https://makersuite.google.com/app/apikey" target="_blank" rel="noopener noreferrer" className="text-indigo hover:underline">
                Google AI Studio API Keys
              </a>
              .
            </p>
            <div className="mt-3 p-3 bg-orange-50 bg-orange-500/10 border border-orange-200 border-orange-400/30 rounded-lg">
              <p className="text-xs text-orange-800 text-orange-300 mb-2">
                <strong>💡 Gemini AI Provider:</strong>
              </p>
              <p className="text-xs text-orange-700 text-orange-200/90 mb-1">
                • Select "Gemini AI" as provider when creating images
              </p>
              <p className="text-xs text-orange-700 text-orange-200/90 mb-1">
                • Requires manual verification and registration
              </p>
              <p className="text-xs text-orange-700 text-orange-200/90">
                • No automatic tracing (unlike ABV.dev)
              </p>
            </div>
          </div>
          
          {/* TinEye API Key */}
          <div>
            <label className="block text-sm font-medium text-white/90 mb-2">
              TinEye API Key (Optional)
            </label>
            <div className="relative">
              <input
                type={showTineyeApiKey ? 'text' : 'password'}
                value={tineyeApiKey}
                onChange={(e) => setTineyeApiKey(e.target.value)}
                placeholder="Enter your TinEye API key (optional)"
                className="w-full px-4 py-3 pr-12 border border-white/20 rounded-lg glass-card text-white placeholder-white/50 focus:ring-2 focus:ring-indigo focus:border-transparent outline-none"
              />
              <button
                onClick={() => setShowTineyeApiKey(!showTineyeApiKey)}
                className="absolute right-3 top-1/2 transform -translate-y-1/2 p-1 hover:bg-white/10 rounded transition-colors"
              >
                {showTineyeApiKey ? (
                  <EyeOff className="w-5 h-5 text-white/70" />
                ) : (
                  <Eye className="w-5 h-5 text-white/70" />
                )}
              </button>
            </div>
            <p className="text-xs text-white/70 mt-2">
              Used for reverse image search. Get your key from{' '}
              <a href="https://tineye.com/api" target="_blank" rel="noopener noreferrer" className="text-indigo hover:underline">
                TinEye API
              </a>
              . Optional - Yandex reverse search works without API key.
            </p>
          </div>
          
          <div>
            <label className="block text-sm font-medium text-white/90 mb-2">
              Pinata API Key
            </label>
            <div className="relative">
              <input
                type={showPinataApiKey ? 'text' : 'password'}
                value={pinataApiKey}
                onChange={(e) => setPinataApiKey(e.target.value)}
                placeholder="Enter your Pinata API Key"
                className="w-full px-4 py-3 pr-12 border border-white/20 rounded-lg glass-card text-white placeholder-white/50 focus:ring-2 focus:ring-indigo focus:border-transparent outline-none"
              />
              <button
                onClick={() => setShowPinataApiKey(!showPinataApiKey)}
                className="absolute right-3 top-1/2 transform -translate-y-1/2 p-1 hover:bg-white/10 rounded transition-colors"
              >
                {showPinataApiKey ? (
                  <EyeOff className="w-5 h-5 text-white/70" />
                ) : (
                  <Eye className="w-5 h-5 text-white/70" />
                )}
              </button>
            </div>
          </div>
          
          <div>
            <label className="block text-sm font-medium text-white/90 mb-2">
              Pinata Secret Key (API Secret)
            </label>
            <div className="relative">
              <input
                type={showPinataSecretKey ? 'text' : 'password'}
                value={pinataSecretKey}
                onChange={(e) => setPinataSecretKey(e.target.value)}
                placeholder="Enter your Pinata API Secret / Secret Access Token"
                className="w-full px-4 py-3 pr-12 border border-white/20 rounded-lg glass-card text-white placeholder-white/50 focus:ring-2 focus:ring-indigo focus:border-transparent outline-none"
              />
              <button
                onClick={() => setShowPinataSecretKey(!showPinataSecretKey)}
                className="absolute right-3 top-1/2 transform -translate-y-1/2 p-1 hover:bg-white/10 rounded transition-colors"
              >
                {showPinataSecretKey ? (
                  <EyeOff className="w-5 h-5 text-white/70" />
                ) : (
                  <Eye className="w-5 h-5 text-white/70" />
                )}
              </button>
            </div>
            <p className="text-xs text-white/70 mt-2">
              <strong>Required:</strong> Masukkan "API Secret" atau "Secret Access Token" dari Pinata dashboard di sini. 
              Ini sama dengan "Secret Key". Get free API Key + API Secret from{' '}
              <a href="https://pinata.cloud" target="_blank" rel="noopener noreferrer" className="text-indigo hover:underline">
                pinata.cloud
              </a>
            </p>
            <div className="mt-3 p-3 bg-blue-50 bg-blue-500/10 border border-blue-200 border-blue-400/30 rounded-lg">
              <p className="text-xs text-blue-800 text-blue-300 mb-1">
                <strong>💡 Pinata Credentials Mapping:</strong>
              </p>
              <p className="text-xs text-blue-700 text-blue-200/90">
                • <strong>API Key</strong> = Key name (pendek, ~20 chars) → Masukkan di "Pinata API Key"
              </p>
              <p className="text-xs text-blue-700 text-blue-200/90">
                • <strong>API Secret</strong> = Secret Key = Secret Access Token (panjang, ~64+ chars) → Masukkan di "Pinata Secret Key"
              </p>
              <p className="text-xs text-blue-700 text-blue-200/90">
                • <strong>JWT Token</strong> = Optional (jika pakai JWT, tidak perlu API Key + Secret Key)
              </p>
            </div>
            <div className="mt-3 p-3 bg-yellow-50 bg-yellow-500/10 border border-yellow-200 border-yellow-400/30 rounded-lg">
              <p className="text-xs text-yellow-800 text-yellow-300">
                <strong>⚠️ Required for Real On-Chain Registration:</strong> Metadata akan otomatis di-upload ke IPFS untuk menghindari contract revert. Tanpa credentials ini, registration akan gagal.
              </p>
            </div>
          </div>
        </div>
      </motion.div>

      {/* Network Settings */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.6, delay: 0.2 }}
        className="glass-card rounded-xl border border-white/10 p-6 mb-6"
      >
        <div className="flex items-center space-x-3 mb-6">
          <div className="w-10 h-10 bg-indigo-500/20 rounded-lg flex items-center justify-center">
            <Network className="w-5 h-5 text-indigo text-indigo-300" />
          </div>
          <div>
            <h2 className="text-xl font-semibold text-white">Network Settings</h2>
            <p className="text-sm text-white/70">Configure Story Protocol network connection</p>
          </div>
        </div>

        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-white/90 mb-2">
              Story Protocol RPC URL
            </label>
            <div className="flex space-x-2">
              <input
                type="text"
                value={storyRpcUrl}
                onChange={(e) => setStoryRpcUrl(e.target.value)}
                placeholder="https://aeneid.storyrpc.io"
                className="flex-1 px-4 py-3 border border-white/20 rounded-lg glass-card text-white placeholder-white/50 focus:ring-2 focus:ring-indigo focus:border-transparent outline-none"
              />
              <button
                onClick={() => {
                  const defaultRpc = 'https://aeneid.storyrpc.io'
                  setStoryRpcUrl(defaultRpc)
                  showToast('info', 'RPC URL reset to default (Public RPC). Click "Save Settings" to apply.')
                }}
                className="px-4 py-3 glass text-white/90 rounded-lg hover:bg-white/10 transition-colors text-sm font-medium whitespace-nowrap"
                title="Reset to default Public RPC (recommended for ABV.dev auto-registration)"
              >
                Reset to Default
              </button>
            </div>
            <p className="text-xs text-white/70 mt-2">
              RPC endpoint for Story Protocol network. <strong>Default (Public RPC)</strong> is recommended for ABV.dev auto-registration.
            </p>
            {storyRpcUrl.includes('tenderly.co') && (
              <div className="mt-2 p-3 bg-yellow-50 bg-yellow-500/10 border border-yellow-200 border-yellow-400/30 rounded-lg">
                <p className="text-xs text-yellow-800 text-yellow-300">
                  <strong>⚠️ Tenderly RPC Detected:</strong> If using ABV.dev auto-registration, switch to Public RPC to avoid RPC mismatch. ABV.dev registers IP assets on Public RPC.
                </p>
              </div>
            )}
          </div>

          {/* SPG NFT Contract Management */}
          <div className="pt-4 border-t border-white/10">
            <div className="flex items-center justify-between mb-2">
              <div>
                <p className="text-sm font-medium text-white/90">SPG NFT Contract</p>
                <p className="text-xs text-white/70">
                  {typeof window !== 'undefined' && localStorage.getItem('storyseal_spg_nft_contract')
                    ? `Current: ${localStorage.getItem('storyseal_spg_nft_contract')?.slice(0, 10)}...`
                    : 'Not set (will be created automatically)'}
                </p>
              </div>
              {typeof window !== 'undefined' && localStorage.getItem('storyseal_spg_nft_contract') && (
                <button
                  onClick={() => {
                    if (typeof window !== 'undefined') {
                      localStorage.removeItem('storyseal_spg_nft_contract')
                      showToast('success', 'SPG NFT contract cleared. A new one will be created on next registration.')
                    }
                  }}
                  className="px-3 py-1.5 text-xs bg-red-100 bg-red-500/10 text-red-700 text-red-300 rounded-lg hover:bg-red-200 hover:bg-red-500/20 transition-colors"
                >
                  Clear & Reset
                </button>
              )}
            </div>
            <div className="mt-2 p-3 bg-blue-50 bg-blue-500/10 border border-blue-200 border-blue-400/30 rounded-lg">
              <p className="text-xs text-blue-800 text-blue-300">
                <strong>💡 Troubleshooting:</strong> If you're experiencing contract revert errors (0x3bdad64c), 
                try clearing the SPG NFT contract to force creation of a new one. This can resolve contract state issues.
              </p>
            </div>
          </div>
        </div>
      </motion.div>

      {/* Testnet Faucet */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.6, delay: 0.25 }}
        className="glass-card rounded-xl border border-white/10 p-6 mb-6"
      >
        <div className="flex items-center space-x-3 mb-6">
          <div className="w-10 h-10 bg-indigo-500/20 rounded-lg flex items-center justify-center">
            <Droplet className="w-5 h-5 text-indigo text-indigo-300" />
          </div>
          <div>
            <h2 className="text-xl font-semibold text-white">Testnet Faucet</h2>
            <p className="text-sm text-white/70">Get IP tokens for Aeneid Testnet</p>
          </div>
        </div>

        {/* Wallet & Token Info */}
        {isConnected && address && (
          <div className="mb-4 p-4 bg-blue-50 bg-blue-500/10 border border-blue-200 border-blue-400/30 rounded-lg">
            <p className="text-sm font-medium text-blue-900 text-blue-300 mb-3">
              💼 Wallet & Token Information
            </p>
            <div className="space-y-2 text-xs">
              <div className="flex items-center justify-between">
                <span className="text-blue-700 text-blue-200/90">Wallet Address:</span>
                <div className="flex items-center space-x-2">
                  <code className="text-blue-900 text-blue-300 font-mono">
                    {address.slice(0, 10)}...{address.slice(-8)}
                  </code>
                  <button
                    onClick={() => {
                      navigator.clipboard.writeText(address)
                      showToast('success', 'Wallet address copied!')
                    }}
                    className="p-1 hover:bg-blue-200 hover:bg-blue-500/20 rounded transition-colors"
                  >
                    <Copy className="w-3 h-3 text-blue-600 text-blue-200/90" />
                  </button>
                </div>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-blue-700 text-blue-200/90">Full Address:</span>
                <code className="text-blue-900 text-blue-300 font-mono text-[10px] break-all">
                  {address}
                </code>
              </div>
              <div className="flex items-center justify-between pt-2 border-t border-blue-200 border-blue-400/30">
                <span className="text-blue-700 text-blue-200/90">Token Type:</span>
                <span className="text-blue-900 text-blue-300 font-medium">
                  IP (Aeneid Testnet Native Token)
                </span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-blue-700 text-blue-200/90">Network:</span>
                <span className="text-blue-900 text-blue-300 font-medium">
                  Aeneid Testnet (Chain ID: 1315)
                </span>
              </div>
            </div>
          </div>
        )}

        {/* Tenderly Fund Wallet Button */}
        {typeof window !== 'undefined' && storyRpcUrl?.includes('tenderly.co') && isConnected && storyService && (
          <div className="mb-4 p-4 bg-green-50 bg-green-500/10 border border-green-200 border-green-400/30 rounded-lg">
            <p className="text-sm font-medium text-green-900 text-green-300 mb-2">
              🚀 Tenderly Virtual TestNet Detected
            </p>
            <p className="text-xs text-green-700 text-green-200/90 mb-3">
              Fund your wallet directly from the app using Tenderly's unlimited faucet.
            </p>
            <div className="flex space-x-2">
              <button
                onClick={async () => {
                  try {
                    await fundWalletMutation.mutateAsync('100')
                    showToast('success', 'Wallet funded with 100 IP tokens!')
                  } catch (error: any) {
                    showToast('error', error.message || 'Failed to fund wallet')
                  }
                }}
                disabled={fundWalletMutation.isPending}
                className="px-4 py-2 bg-green-600 bg-green-500 text-white rounded-lg hover:bg-green-700 hover:bg-green-600 transition-colors text-sm font-medium disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {fundWalletMutation.isPending ? 'Funding...' : 'Fund 100 IP Tokens'}
              </button>
              <button
                onClick={async () => {
                  try {
                    await fundWalletMutation.mutateAsync('1000')
                    showToast('success', 'Wallet funded with 1000 IP tokens!')
                  } catch (error: any) {
                    showToast('error', error.message || 'Failed to fund wallet')
                  }
                }}
                disabled={fundWalletMutation.isPending}
                className="px-4 py-2 bg-green-600 bg-green-500 text-white rounded-lg hover:bg-green-700 hover:bg-green-600 transition-colors text-sm font-medium disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {fundWalletMutation.isPending ? 'Funding...' : 'Fund 1000 IP Tokens'}
              </button>
            </div>
          </div>
        )}

        <div className="space-y-4">
          <div className="p-4 bg-blue-50 bg-blue-500/10 border border-blue-200 border-blue-400/30 rounded-lg">
            <p className="text-sm text-blue-800 text-blue-300 mb-3">
              <strong>Important:</strong> Aeneid Testnet menggunakan token khusus yang disebut <strong>IP</strong> (bukan ETH biasa). 
              Anda perlu mendapatkan IP tokens dari faucet untuk melakukan transaksi seperti IP registration.
            </p>
          </div>

          <div className="space-y-3">
            <a
              href="https://docs.story.foundation/aeneid"
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center justify-between p-4 glass rounded-lg hover:bg-white/10 transition-colors group"
            >
              <div>
                <p className="font-medium text-white">Official Faucet</p>
                <p className="text-sm text-white/70">10 IP per permintaan</p>
              </div>
              <ExternalLink className="w-5 h-5 text-white/60 group-hover:text-indigo transition-colors" />
            </a>

            <a
              href="https://faucet.unitynodes.com"
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center justify-between p-4 glass rounded-lg hover:bg-white/10 transition-colors group"
            >
              <div>
                <p className="font-medium text-white">Unity Nodes Faucet</p>
                <p className="text-sm text-white/70">5 IP per wallet</p>
              </div>
              <ExternalLink className="w-5 h-5 text-white/60 group-hover:text-indigo transition-colors" />
            </a>
          </div>

          <div className="pt-4 border-t border-white/10">
            <p className="text-xs text-white/70 mb-3">
              <strong>Note:</strong> Pastikan wallet Anda sudah terhubung ke <strong>Aeneid Testnet (Chain ID: 1315)</strong> sebelum mengklaim tokens dari faucet.
            </p>
            
            <div className="p-3 bg-indigo-500/20 border border-indigo-200 border-indigo-400/30 rounded-lg">
              <p className="text-sm font-semibold text-indigo-900 text-indigo-300 mb-2">
                💡 Untuk apa IP Tokens digunakan?
              </p>
              <ul className="text-xs text-indigo-800 text-indigo-300 space-y-1 list-disc list-inside">
                <li><strong>IP Registration</strong> - Mendaftarkan AI-generated artwork sebagai IP Asset di blockchain (mint NFT + register)</li>
                <li><strong>License Creation</strong> - Membuat license terms untuk IP assets (Commercial, Non-Commercial, dll)</li>
                <li><strong>Gas Fees</strong> - Biaya transaksi untuk semua operasi blockchain di Story Protocol</li>
              </ul>
              <p className="text-xs text-indigo-700 text-indigo-200/90 mt-2">
                Setiap transaksi memerlukan IP tokens untuk gas fees. Pastikan Anda memiliki cukup saldo sebelum melakukan operasi.
              </p>
            </div>
          </div>
        </div>
      </motion.div>

      {/* Notifications */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.6, delay: 0.3 }}
        className="glass-card rounded-xl border border-white/10 p-6 mb-6"
      >
        <div className="flex items-center space-x-3 mb-6">
          <div className="w-10 h-10 bg-indigo-500/20 rounded-lg flex items-center justify-center">
            <Bell className="w-5 h-5 text-indigo text-indigo-300" />
          </div>
          <div>
            <h2 className="text-xl font-semibold text-white">Notifications</h2>
            <p className="text-sm text-white/70">Manage your notification preferences</p>
          </div>
        </div>

        <div className="space-y-4">
          <label className="flex items-center justify-between p-4 glass rounded-lg cursor-pointer hover:bg-white/10 transition-colors">
            <div>
              <p className="font-medium text-white">IP Violations</p>
              <p className="text-sm text-white/70">Get notified when violations are detected</p>
            </div>
            <input
              type="checkbox"
              checked={notifications.violations}
              onChange={(e) => setNotifications(prev => ({ ...prev, violations: e.target.checked }))}
              className="w-5 h-5 text-indigo rounded focus:ring-indigo"
            />
          </label>

          <label className="flex items-center justify-between p-4 glass rounded-lg cursor-pointer hover:bg-white/10 transition-colors">
            <div>
              <p className="font-medium text-white">New Registrations</p>
              <p className="text-sm text-white/70">Notify when IP assets are registered</p>
            </div>
            <input
              type="checkbox"
              checked={notifications.registrations}
              onChange={(e) => setNotifications(prev => ({ ...prev, registrations: e.target.checked }))}
              className="w-5 h-5 text-indigo rounded focus:ring-indigo"
            />
          </label>

          <label className="flex items-center justify-between p-4 glass rounded-lg cursor-pointer hover:bg-white/10 transition-colors">
            <div>
              <p className="font-medium text-white">Verifications</p>
              <p className="text-sm text-white/70">Notify when images are verified</p>
            </div>
            <input
              type="checkbox"
              checked={notifications.verifications}
              onChange={(e) => setNotifications(prev => ({ ...prev, verifications: e.target.checked }))}
              className="w-5 h-5 text-indigo rounded focus:ring-indigo"
            />
          </label>
        </div>
      </motion.div>

      {/* Save Button */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.6, delay: 0.4 }}
        className="flex items-center justify-between"
      >
        <div className="flex items-center space-x-2">
          {saved && (
            <motion.div
              initial={{ opacity: 0, x: -10 }}
              animate={{ opacity: 1, x: 0 }}
              className="flex items-center space-x-2 text-green-600 text-green-200/90"
            >
              <CheckCircle className="w-5 h-5" />
              <span className="text-sm font-medium">Settings saved!</span>
            </motion.div>
          )}
        </div>
        <button
          onClick={handleSave}
          className="flex items-center space-x-2 px-6 py-3 bg-gradient-primary text-white rounded-lg hover:shadow-glow-indigo transition-all font-medium"
        >
          <Save className="w-5 h-5" />
          <span>Save Settings</span>
        </button>
      </motion.div>
    </div>
  )
}

