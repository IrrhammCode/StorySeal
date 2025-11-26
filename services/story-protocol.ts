'use client'

import { StoryClient, StoryConfig } from '@story-protocol/core-sdk'
import { http, createPublicClient, getAddress, parseAbiItem, Address, keccak256, toBytes, decodeEventLog, decodeErrorResult } from 'viem'
import { STORY_CHAIN_ID } from '@/config/story'
import { Account } from 'viem'
import { uploadJSONToIPFS, uploadJSONStringToIPFS, uploadSVGToIPFS } from '@/services/ipfs-service'

// Metadata cache untuk avoid duplicate requests
const metadataCache = new Map<string, { data: any, timestamp: number }>()
const CACHE_MAX_AGE = 60000 // 1 minute

async function getCachedMetadata(uri: string): Promise<any | null> {
  const cached = metadataCache.get(uri)
  if (cached && Date.now() - cached.timestamp < CACHE_MAX_AGE) {
    return cached.data
  }
  return null
}

function setCachedMetadata(uri: string, data: any): void {
  metadataCache.set(uri, { data, timestamp: Date.now() })
}

// Story Protocol Contract Addresses (Aeneid Testnet)
// From: https://docs.story.foundation/developers/deployed-smart-contracts
const IP_ASSET_REGISTRY_ADDRESS = '0x77319B4031e6eF1250907aa00018B8B1c67a244b' as Address
const REGISTRATION_WORKFLOWS_ADDRESS = '0xbe39E1C756e921BD25DF86e7AAa31106d1eb0424' as Address
const PUBLIC_SPG_NFT_CONTRACT = '0xc32A8a0FF3beDDDa58393d022aF433e78739FAbc' as Address

// ABI for RegistrationWorkflows.mintAndRegisterIp
// From: https://docs.story.foundation/developers/smart-contracts/register-ip-asset
const REGISTRATION_WORKFLOWS_ABI = [
  {
    name: 'mintAndRegisterIp',
    type: 'function',
    stateMutability: 'nonpayable',
    inputs: [
      { name: 'spgNftContract', type: 'address' },
      { name: 'recipient', type: 'address' },
      {
        name: 'ipMetadata',
        type: 'tuple',
        components: [
          { name: 'ipMetadataURI', type: 'string' },
          { name: 'ipMetadataHash', type: 'bytes32' },
          { name: 'nftMetadataURI', type: 'string' },
          { name: 'nftMetadataHash', type: 'bytes32' },
        ],
      },
      { name: 'allowDuplicates', type: 'bool' },
    ],
    outputs: [
      { name: 'ipId', type: 'address' },
      { name: 'tokenId', type: 'uint256' },
    ],
  },
] as const

// Custom Error ABI for Story Protocol contracts
// These errors help decode contract revert reasons
const STORY_PROTOCOL_ERRORS = [
  {
    name: 'TransactionFailed',
    type: 'error',
    inputs: [],
    // Common signature: 0x3bdad64c (but can vary)
  },
  {
    name: 'MetadataHashMismatch',
    type: 'error',
    inputs: [
      { name: 'expected', type: 'bytes32' },
      { name: 'actual', type: 'bytes32' }
    ]
  },
  {
    name: 'MetadataNotAccessible',
    type: 'error',
    inputs: [{ name: 'uri', type: 'string' }]
  },
  {
    name: 'InvalidSPGContract',
    type: 'error',
    inputs: [{ name: 'contract', type: 'address' }]
  },
  {
    name: 'InvalidRecipient',
    type: 'error',
    inputs: [{ name: 'recipient', type: 'address' }]
  },
  {
    name: 'InsufficientFunds',
    type: 'error',
    inputs: []
  },
] as const

// Combined ABI for better error decoding
const FULL_REGISTRATION_ABI = [...REGISTRATION_WORKFLOWS_ABI, ...STORY_PROTOCOL_ERRORS] as const

// ABI for IPAssetRegistry.register
const IP_ASSET_REGISTRY_ABI = [
  {
    name: 'register',
    type: 'function',
    stateMutability: 'nonpayable',
    inputs: [
      { name: 'chainId', type: 'uint256' },
      { name: 'tokenContract', type: 'address' },
      { name: 'tokenId', type: 'uint256' },
    ],
    outputs: [{ name: 'ipId', type: 'address' }],
  },
  {
    name: 'ipId',
    type: 'function',
    stateMutability: 'view',
    inputs: [
      { name: 'chainId', type: 'uint256' },
      { name: 'tokenContract', type: 'address' },
      { name: 'tokenId', type: 'uint256' },
    ],
    outputs: [{ name: 'ipId', type: 'address' }],
  },
] as const

/**
 * Calculate SHA256 hash of a string (for metadata hashing)
 * Following Story Protocol official docs: https://docs.story.foundation/developers/typescript-sdk/register-ip-asset
 * Uses Web Crypto API for browser compatibility
 */
async function sha256Hash(data: string): Promise<string> {
  const encoder = new TextEncoder()
  const dataBuffer = encoder.encode(data)
  const hashBuffer = await crypto.subtle.digest('SHA-256', dataBuffer)
  const hashArray = Array.from(new Uint8Array(hashBuffer))
  const hashHex = hashArray.map(b => b.toString(16).padStart(2, '0')).join('')
  return `0x${hashHex}`
}

// Get RPC URL dynamically (can be changed from settings)
// This is used by Story Protocol SDK - supports Tenderly via localStorage or env
const getStoryRpcUrl = () => {
  // Check localStorage first (user settings override - highest priority)
  if (typeof window !== 'undefined') {
    const stored = localStorage.getItem('story_rpc_url')
    if (stored && stored.trim()) {
      return stored.trim()
    }
  }
  
  // Fallback to environment variable
  const envUrl = process.env.NEXT_PUBLIC_STORY_RPC_URL
  if (envUrl && envUrl.trim() && !envUrl.includes('your-fork-id')) {
    return envUrl.trim()
  }
  
  // Default fallback
  return 'https://aeneid.storyrpc.io'
}

export interface IPAsset {
  id: string
  name?: string
  owner: string
  registeredAt?: string
  metadata?: Record<string, any>
}

export interface RegisterIPAssetParams {
  name: string
  description?: string
  imageUrl?: string // SVG data URL or IPFS URL
  mediaUrl?: string
  metadata?: Record<string, any>
  account: Account
}

// IPRegistered event signature
// Based on Story Protocol IPAssetRegistry contract
// Event: IPRegistered(address indexed caller, address indexed ipId, address indexed ipAssetRegistry, uint256 tokenId, string ipMetadataURI)
const IP_REGISTERED_EVENT = parseAbiItem(
  'event IPRegistered(address indexed caller, address indexed ipId, address indexed ipAssetRegistry, uint256 tokenId, string ipMetadataURI)'
)

export class StoryProtocolService {
  private client: StoryClient | null = null
  private publicClient: ReturnType<typeof createPublicClient> | null = null

  constructor(account: Account) {
    try {
      const rpcUrl = getStoryRpcUrl()
      console.log('[StoryProtocolService] Using RPC URL:', rpcUrl)
      console.log('[StoryProtocolService] Is Tenderly RPC?', rpcUrl.includes('tenderly.co'))
      
      const config: StoryConfig = {
        account,
        transport: http(rpcUrl),
        chainId: STORY_CHAIN_ID,
      }
      this.client = StoryClient.newClient(config)
      
      // Create public client for reading contract data
      this.publicClient = createPublicClient({
        transport: http(rpcUrl),
      })
    } catch (error) {
      console.error('Failed to initialize Story Protocol client:', error)
    }
  }

  /**
   * Get IPAssetRegistry contract address from SDK
   * Story Protocol SDK should have this in the client
   */
  private async getIPAssetRegistryAddress(): Promise<Address | null> {
    if (!this.client) return null
    
    try {
      // Try to get contract address from SDK client
      // The SDK client should have access to contract addresses
      const clientAny = this.client as any
      
      // Try different possible locations
      if (clientAny.ipAsset?.address) {
        return getAddress(clientAny.ipAsset.address)
      }
      if (clientAny.config?.ipAssetRegistry) {
        return getAddress(clientAny.config.ipAssetRegistry)
      }
      if (clientAny.address) {
        return getAddress(clientAny.address)
      }
      
      // If we can't get it from SDK, we'll query without contract filter
      // The RPC will return events from all contracts, we'll filter by event signature
      return null
    } catch (error) {
      console.error('Failed to get IPAssetRegistry address:', error)
      return null
    }
  }

  /**
   * Register a new IP Asset
   * Uses Story Protocol SDK's registerIpAsset method which supports minting NFTs
   */
  async registerIPAsset(params: RegisterIPAssetParams): Promise<IPAsset> {
    // Validate account
    if (!params.account) {
      throw new Error('Account is required for IP Asset registration')
    }

    // Validate account address
    if (!params.account.address) {
      console.error('[registerIPAsset] Invalid account:', JSON.stringify(params.account, null, 2))
      throw new Error(`Invalid account: address is undefined. Account object: ${JSON.stringify(params.account)}`)
    }

    const recipientAddress = params.account.address
    console.log('[registerIPAsset] Using recipient address:', recipientAddress)

    // Ensure recipient is a valid address and format it properly (before try block)
    if (!recipientAddress || recipientAddress === '0x' || recipientAddress.length < 42) {
      throw new Error(`Invalid recipient address: ${recipientAddress}. Must be a valid Ethereum address.`)
    }

    // Format address to checksummed address (required by SDK) - define before try block
    const formattedRecipient = getAddress(recipientAddress as Address)
    console.log('[registerIPAsset] Formatted recipient address:', formattedRecipient)

    // CRITICAL FIX: Re-initialize StoryClient with the account from params
    // This ensures the client uses the correct account for signing transactions
    // The "unknown account" error happens when client was initialized with a different account
    console.log('[registerIPAsset] Re-initializing StoryClient with account from params...')
    console.log('[registerIPAsset] Account from params:', params.account)
    
    try {
      const rpcUrl = getStoryRpcUrl()
      const config: StoryConfig = {
        account: params.account, // Use account from params, not from constructor
        transport: http(rpcUrl),
        chainId: STORY_CHAIN_ID,
      }
      // Create new client instance with the correct account
      this.client = StoryClient.newClient(config)
      console.log('[registerIPAsset] ✅ StoryClient re-initialized with account:', params.account.address)
    } catch (initError: any) {
      console.error('[registerIPAsset] Failed to re-initialize StoryClient:', initError)
      throw new Error(`Failed to initialize Story Protocol client with account: ${initError.message}`)
    }

    if (!this.client) {
      throw new Error('Story Protocol client not initialized')
    }

    try {
      // Following Story Protocol official docs: https://docs.story.foundation/developers/typescript-sdk/register-ip-asset
      // Public SPG NFT contract for Aeneid testnet (from official docs)
      const PUBLIC_SPG_NFT_CONTRACT = '0xc32A8a0FF3beDDDa58393d022aF433e78739FAbc' as Address
      
      console.log('[registerIPAsset] Starting registration following official Story Protocol docs...')
      console.log('[registerIPAsset] Using public SPG NFT contract:', PUBLIC_SPG_NFT_CONTRACT)
      
      // Step 1: Prepare IP Metadata (following official docs format)
      const imageUrl = params.imageUrl || params.mediaUrl || ''
      const ipMetadata = {
        title: params.name,
        description: params.description || 'AI-generated artwork with invisible watermark protection',
        image: imageUrl,
        mediaUrl: imageUrl,
        mediaType: imageUrl.includes('svg') ? 'image/svg+xml' : 'image/png',
        ...params.metadata,
      }
      
      // Step 2: Prepare NFT Metadata (ERC-721 standard)
      const nftMetadata = {
        name: params.name,
        description: params.description || 'Ownership NFT for StorySeal IP Asset',
        image: imageUrl,
      }
      
      console.log('[registerIPAsset] Uploading IP metadata to IPFS...')
      
      // Step 3: Upload metadata to IPFS
      const ipIpfsHash = await uploadJSONToIPFS(ipMetadata)
      console.log('[registerIPAsset] ✅ IP metadata uploaded to IPFS:', ipIpfsHash)
      
      // Step 4: Calculate metadata hash (SHA256) - following official docs
      // Official docs use: createHash("sha256").update(JSON.stringify(ipMetadata)).digest("hex")
      const ipMetadataString = JSON.stringify(ipMetadata)
      const ipHash = await sha256Hash(ipMetadataString)
      console.log('[registerIPAsset] ✅ IP metadata hash calculated (SHA256):', ipHash)
      
      console.log('[registerIPAsset] Uploading NFT metadata to IPFS...')
      const nftIpfsHash = await uploadJSONToIPFS(nftMetadata)
      console.log('[registerIPAsset] ✅ NFT metadata uploaded to IPFS:', nftIpfsHash)
      
      // Calculate NFT metadata hash (SHA256)
      const nftMetadataString = JSON.stringify(nftMetadata)
      const nftHash = await sha256Hash(nftMetadataString)
      console.log('[registerIPAsset] ✅ NFT metadata hash calculated (SHA256):', nftHash)
      
      // Step 5: Register IP Asset (following official docs format)
      console.log('[registerIPAsset] Registering IP Asset on Story Protocol...')
      console.log('[registerIPAsset] SPG NFT Contract:', PUBLIC_SPG_NFT_CONTRACT)
      console.log('[registerIPAsset] Recipient:', formattedRecipient)
      
      const response = await this.client.ipAsset.registerIpAsset({
        nft: {
          type: 'mint',
          spgNftContract: PUBLIC_SPG_NFT_CONTRACT,
          recipient: formattedRecipient, // NFT will be minted to this address
        },
        ipMetadata: {
          // Use ipfs.io gateway (as per official Story Protocol docs)
          // Contract expects ipfs.io gateway format
          ipMetadataURI: `https://ipfs.io/ipfs/${ipIpfsHash}`,
          ipMetadataHash: ipHash,
          nftMetadataURI: `https://ipfs.io/ipfs/${nftIpfsHash}`,
          nftMetadataHash: nftHash,
        },
      })
      
      console.log('[registerIPAsset] ✅ IP Asset registered successfully!')
      console.log('[registerIPAsset] Transaction hash:', response.txHash)
      console.log('[registerIPAsset] IP ID:', response.ipId)
      console.log('[registerIPAsset] View on explorer:', `https://aeneid.explorer.story.foundation/ipa/${response.ipId}`)
      
      return {
        id: response.ipId,
                  owner: formattedRecipient,
        name: params.name,
      }
    } catch (error: any) {
      console.error('[registerIPAsset] Registration failed:', error)
      
      // Provide helpful error messages
      if (error.message?.includes('Pinata')) {
        throw new Error('IPFS upload failed. Please configure Pinata credentials in Settings page (https://pinata.cloud).')
      }
      
      if (error.message?.includes('insufficient funds') || error.message?.includes('balance')) {
        throw new Error('Insufficient funds for registration. Please fund your wallet with IP tokens (get from faucet).')
      }
      
      // Re-throw the error
      throw error
    }
  }

  /**
   * Register IP Asset using direct smart contract call (no SDK)
   * Uses RegistrationWorkflows.mintAndRegisterIp contract function
   * Following: https://docs.story.foundation/developers/smart-contracts/register-ip-asset
   */
  async registerIPAssetDirectContract(
    params: RegisterIPAssetParams,
    walletClient: any // Wagmi walletClient for signing transactions
  ): Promise<IPAsset> {
    // Validate account
    if (!params.account) {
      throw new Error('Account is required for IP Asset registration')
    }

    if (!params.account.address) {
      throw new Error(`Invalid account: address is undefined`)
    }

    if (!walletClient) {
      throw new Error('Wallet client is required for direct contract calls')
    }

    const recipientAddress = params.account.address
    const formattedRecipient = getAddress(recipientAddress as Address)
    console.log('[registerIPAssetDirectContract] Using recipient address:', formattedRecipient)

    try {
      console.log('[registerIPAssetDirectContract] Starting direct contract registration...')
      console.log('[registerIPAssetDirectContract] Using public SPG NFT contract:', PUBLIC_SPG_NFT_CONTRACT)

      // Step 1: Upload image to IPFS first (if it's a data URL)
      const imageUrl = params.imageUrl || params.mediaUrl || ''
      let imageIpfsHash: string | null = null
      let imageIpfsUri: string = imageUrl
      
      // If image is a data URL, upload to IPFS first
      if (imageUrl.startsWith('data:')) {
        console.log('[registerIPAssetDirectContract] Image is data URL, uploading to IPFS...')
        try {
          // Extract SVG from data URL
          const svgMatch = imageUrl.match(/data:image\/svg\+xml[^,]*,?(.+)/)
          if (svgMatch && svgMatch[1]) {
            const svgContent = svgMatch[1].startsWith('base64,') 
              ? atob(svgMatch[1].substring(7))
              : decodeURIComponent(svgMatch[1])
            
            const imageIpfsUrl = await uploadSVGToIPFS(svgContent)
            // Extract hash from IPFS URL (ipfs://Qm... or https://gateway.pinata.cloud/ipfs/Qm...)
            imageIpfsHash = imageIpfsUrl.replace('ipfs://', '').replace('https://gateway.pinata.cloud/ipfs/', '').replace('https://ipfs.io/ipfs/', '')
            imageIpfsUri = `https://gateway.pinata.cloud/ipfs/${imageIpfsHash}`
            console.log('[registerIPAssetDirectContract] ✅ Image uploaded to IPFS:', imageIpfsHash)
            console.log('[registerIPAssetDirectContract] Image IPFS URI:', imageIpfsUri)
              } else {
            console.warn('[registerIPAssetDirectContract] ⚠️ Could not extract SVG from data URL, using data URL as-is')
          }
        } catch (e) {
          console.error('[registerIPAssetDirectContract] Failed to upload image to IPFS:', e)
          console.warn('[registerIPAssetDirectContract] ⚠️ Using data URL as-is (may cause issues)')
        }
      }

      // Step 2: Prepare IP Metadata (following official docs format)
      // IMPORTANT: Build metadata object with consistent key ordering
      // Contract will fetch from IPFS and stringify, so we must match exact format
      const ipMetadata: Record<string, any> = {
        title: params.name,
        description: params.description || 'AI-generated artwork with invisible watermark protection',
        image: imageIpfsUri, // Use IPFS URI instead of data URL
        mediaUrl: imageIpfsUri, // Use IPFS URI instead of data URL
        mediaType: imageUrl.includes('svg') ? 'image/svg+xml' : 'image/png',
      }
      
      // Add any additional metadata from params (merge after base fields for consistent ordering)
      if (params.metadata) {
        Object.assign(ipMetadata, params.metadata)
      }

      // Step 3: Prepare NFT Metadata (ERC-721 standard)
      // Use consistent key ordering: name, description, image
      const nftMetadata: Record<string, any> = {
        name: params.name,
        description: params.description || 'Ownership NFT for StorySeal IP Asset',
        image: imageIpfsUri, // Use IPFS URI instead of data URL
      }

      // Step 4: Stringify metadata FIRST to ensure exact same format for upload and hash
      // CRITICAL: Hash must be calculated from the EXACT string that gets uploaded to IPFS
      // Contract will fetch from IPFS and calculate hash, so format must match 100%
      // Use JSON.stringify with no replacer and no spaces for compact, deterministic format
      const ipMetadataString = JSON.stringify(ipMetadata) // Default: compact format, consistent key order
      const nftMetadataString = JSON.stringify(nftMetadata) // Default: compact format, consistent key order
      
      console.log('[registerIPAssetDirectContract] IP metadata JSON string:', ipMetadataString)
      console.log('[registerIPAssetDirectContract] NFT metadata JSON string:', nftMetadataString)

      // Calculate hashes BEFORE upload to ensure we use exact same strings
      const ipHash = await sha256Hash(ipMetadataString)
      const nftHash = await sha256Hash(nftMetadataString)
      console.log('[registerIPAssetDirectContract] ✅ IP metadata hash calculated (SHA256):', ipHash)
      console.log('[registerIPAssetDirectContract] ✅ NFT metadata hash calculated (SHA256):', nftHash)

      // Now upload using the exact same stringified JSON
      console.log('[registerIPAssetDirectContract] Uploading IP metadata to IPFS...')
      const ipIpfsHash = await uploadJSONStringToIPFS(ipMetadataString)
      console.log('[registerIPAssetDirectContract] ✅ IP metadata uploaded to IPFS:', ipIpfsHash)

      console.log('[registerIPAssetDirectContract] Uploading NFT metadata to IPFS...')
      const nftIpfsHash = await uploadJSONStringToIPFS(nftMetadataString)
      console.log('[registerIPAssetDirectContract] ✅ NFT metadata uploaded to IPFS:', nftIpfsHash)
      
      // Skip hash verification to avoid Pinata rate limiting
      // Hash is calculated from the exact JSON we uploaded, so it should match
      // Contract will validate hash during execution anyway
      console.log('[registerIPAssetDirectContract] Skipping hash verification to avoid rate limiting...')
      console.log('[registerIPAssetDirectContract] Hash calculated from uploaded JSON, should match contract validation')

      // Step 3.5: Pre-flight checks
      console.log('[registerIPAssetDirectContract] Running pre-flight checks...')
      
      // Check wallet balance
      const publicClient = createPublicClient({
        transport: http(getStoryRpcUrl()),
      })
      
      const balance = await publicClient.getBalance({
        address: formattedRecipient,
      })
      const balanceInEth = Number(balance) / 1e18
      console.log('[registerIPAssetDirectContract] Wallet balance:', balance.toString(), 'wei')
      console.log('[registerIPAssetDirectContract] Wallet balance (ETH/IP):', balanceInEth.toFixed(4))
      
      if (balance === 0n) {
        throw new Error('Wallet balance is zero. Please fund your wallet with IP tokens from the faucet: https://docs.story.foundation/aeneid')
      }
      
      if (balanceInEth < 0.001) {
        console.warn('[registerIPAssetDirectContract] ⚠️ Low balance detected. Registration may fail due to insufficient gas.')
      }
      
      // Use ipfs.io gateway (as per official Story Protocol docs)
      // Contract expects ipfs.io gateway format for metadata URIs
      // Wait longer for IPFS propagation to ensure metadata is accessible
      console.log('[registerIPAssetDirectContract] Using ipfs.io gateway for metadata URIs (as per Story Protocol docs)...')
      const ipfsGateway = `https://ipfs.io/ipfs/`
      const pinataGateway = `https://gateway.pinata.cloud/ipfs/` // For verification only
      
      // Use ipfs.io gateway for contract calls (as per official docs)
      const ipMetadataURI = `${ipfsGateway}${ipIpfsHash}`
      const nftMetadataURI = `${ipfsGateway}${nftIpfsHash}`
      
      // Also prepare Pinata URLs for verification (faster for browser)
      const ipMetadataURIPinata = `${pinataGateway}${ipIpfsHash}`
      const nftMetadataURIPinata = `${pinataGateway}${nftIpfsHash}`
      
      console.log('[registerIPAssetDirectContract] IP Metadata URI (ipfs.io - for contract):', ipMetadataURI)
      console.log('[registerIPAssetDirectContract] NFT Metadata URI (ipfs.io - for contract):', nftMetadataURI)
      console.log('[registerIPAssetDirectContract] IP Metadata URI (Pinata - for verification):', ipMetadataURIPinata)
      console.log('[registerIPAssetDirectContract] NFT Metadata URI (Pinata - for verification):', nftMetadataURIPinata)
      
      // Verify metadata accessibility and hash BEFORE contract call
      // This is critical to avoid transaction failures
      console.log('[registerIPAssetDirectContract] Verifying metadata accessibility and hash...')
      try {
        // Wait longer for IPFS propagation (especially for ipfs.io)
        // ipfs.io needs more time to propagate content from Pinata
        console.log('[registerIPAssetDirectContract] Waiting 10 seconds for IPFS propagation to ipfs.io...')
        await new Promise(resolve => setTimeout(resolve, 10000))
        
        // Try to fetch and verify IP metadata
        console.log('[registerIPAssetDirectContract] Fetching IP metadata from gateway to verify hash...')
        let fetchedIpMetadata: any = null
        let fetchedIpMetadataString: string = ''
        
        // Try ipfs.io gateway first (contract will use this), then Pinata as fallback for verification
        try {
          const response = await fetch(ipMetadataURI, {
            method: 'GET',
            headers: { 'Accept': 'application/json' },
            // Add longer timeout for ipfs.io
            signal: AbortSignal.timeout(30000), // 30 second timeout for ipfs.io
          })
          
          if (!response.ok) {
            throw new Error(`HTTP ${response.status}: ${response.statusText}`)
          }
          
          fetchedIpMetadata = await response.json()
          // Re-stringify to match exact format (contract will do this too)
          // Use same JSON.stringify() call to ensure format consistency
          fetchedIpMetadataString = JSON.stringify(fetchedIpMetadata)
          console.log('[registerIPAssetDirectContract] ✅ IP metadata fetched from ipfs.io (contract will use this)')
          console.log('[registerIPAssetDirectContract] Fetched metadata string (first 200 chars):', fetchedIpMetadataString.substring(0, 200))
        } catch (ipfsError: any) {
          console.warn('[registerIPAssetDirectContract] ⚠️ Failed to fetch from ipfs.io, trying Pinata for verification...', ipfsError.message)
          
          // Try Pinata gateway as fallback for verification only
          // Note: Contract will still use ipfs.io URI, but we verify hash from Pinata
          const pinataResponse = await fetch(ipMetadataURIPinata, {
            method: 'GET',
            headers: { 'Accept': 'application/json' },
            signal: AbortSignal.timeout(10000),
          })
          
          if (!pinataResponse.ok) {
            throw new Error(`Pinata gateway also failed: HTTP ${pinataResponse.status}. Metadata may not be accessible yet.`)
          }
          
          fetchedIpMetadata = await pinataResponse.json()
          // Re-stringify to match exact format (contract will do this too)
          fetchedIpMetadataString = JSON.stringify(fetchedIpMetadata)
          console.log('[registerIPAssetDirectContract] ✅ IP metadata fetched from Pinata (for verification only)')
          console.log('[registerIPAssetDirectContract] Fetched metadata string (first 200 chars):', fetchedIpMetadataString.substring(0, 200))
          console.warn('[registerIPAssetDirectContract] ⚠️ Contract will use ipfs.io URI, but ipfs.io is not accessible yet. This may cause transaction failure.')
        }
        
        // Verify hash matches
        const fetchedIpHash = await sha256Hash(fetchedIpMetadataString)
        console.log('[registerIPAssetDirectContract] Calculated hash from fetched metadata:', fetchedIpHash)
        console.log('[registerIPAssetDirectContract] Original hash:', ipHash)
        
        if (fetchedIpHash.toLowerCase() !== ipHash.toLowerCase()) {
          console.error('[registerIPAssetDirectContract] ❌ Hash mismatch detected!')
          console.error('[registerIPAssetDirectContract] Expected:', ipHash)
          console.error('[registerIPAssetDirectContract] Actual:', fetchedIpHash)
          console.error('[registerIPAssetDirectContract] Original metadata string:', ipMetadataString.substring(0, 200))
          console.error('[registerIPAssetDirectContract] Fetched metadata string:', fetchedIpMetadataString.substring(0, 200))
          
          throw new Error(`Metadata hash mismatch! Expected ${ipHash} but got ${fetchedIpHash}. This usually means the metadata format changed during upload or there's a JSON serialization difference.`)
        }
        
        console.log('[registerIPAssetDirectContract] ✅ IP metadata hash verified!')
        
        // Verify NFT metadata (similar process)
        console.log('[registerIPAssetDirectContract] Fetching NFT metadata from gateway to verify hash...')
        let fetchedNftMetadata: any = null
        let fetchedNftMetadataString: string = ''
        
        try {
          const response = await fetch(nftMetadataURI, {
            method: 'GET',
            headers: { 'Accept': 'application/json' },
            signal: AbortSignal.timeout(30000), // 30 second timeout for ipfs.io
          })
          
          if (!response.ok) {
            throw new Error(`HTTP ${response.status}: ${response.statusText}`)
          }
          
          fetchedNftMetadata = await response.json()
          fetchedNftMetadataString = JSON.stringify(fetchedNftMetadata)
          console.log('[registerIPAssetDirectContract] ✅ NFT metadata fetched from ipfs.io (contract will use this)')
        } catch (ipfsError: any) {
          console.warn('[registerIPAssetDirectContract] ⚠️ Failed to fetch NFT from ipfs.io, trying Pinata for verification...', ipfsError.message)
          
          // Try Pinata gateway as fallback for verification only
          const pinataResponse = await fetch(nftMetadataURIPinata, {
            method: 'GET',
            headers: { 'Accept': 'application/json' },
            signal: AbortSignal.timeout(10000),
          })
          
          if (!pinataResponse.ok) {
            throw new Error(`Pinata gateway also failed: HTTP ${pinataResponse.status}. Metadata may not be accessible yet.`)
          }
          
          fetchedNftMetadata = await pinataResponse.json()
          fetchedNftMetadataString = JSON.stringify(fetchedNftMetadata)
          console.log('[registerIPAssetDirectContract] ✅ NFT metadata fetched from Pinata (for verification only)')
          console.warn('[registerIPAssetDirectContract] ⚠️ Contract will use ipfs.io URI, but ipfs.io is not accessible yet. This may cause transaction failure.')
        }
        
        const fetchedNftHash = await sha256Hash(fetchedNftMetadataString)
        console.log('[registerIPAssetDirectContract] Calculated hash from fetched NFT metadata:', fetchedNftHash)
        console.log('[registerIPAssetDirectContract] Original NFT hash:', nftHash)
        
        if (fetchedNftHash.toLowerCase() !== nftHash.toLowerCase()) {
          console.error('[registerIPAssetDirectContract] ❌ NFT hash mismatch detected!')
          throw new Error(`NFT metadata hash mismatch! Expected ${nftHash} but got ${fetchedNftHash}.`)
        }
        
        console.log('[registerIPAssetDirectContract] ✅ NFT metadata hash verified!')
        console.log('[registerIPAssetDirectContract] ✅ All metadata verified and accessible!')
        
      } catch (verifyError: any) {
        console.error('[registerIPAssetDirectContract] ❌ Metadata verification failed:', verifyError)
        throw new Error(`Metadata verification failed: ${verifyError.message}. Please ensure metadata is accessible and hash values are correct.`)
      }
      
      // Step 5: Verify SPG NFT contract state before calling
      console.log('[registerIPAssetDirectContract] Verifying SPG NFT contract state...')
      try {
        // Check if contract has code
        const contractCode = await publicClient.getBytecode({
          address: PUBLIC_SPG_NFT_CONTRACT,
        })
        if (!contractCode || contractCode === '0x') {
          throw new Error(`SPG NFT contract ${PUBLIC_SPG_NFT_CONTRACT} has no code. Contract may not be deployed or address is incorrect.`)
        }
        console.log('[registerIPAssetDirectContract] ✅ SPG NFT contract has code')
        
        // Try to read totalSupply to verify contract is functional
        try {
          const totalSupply = await publicClient.readContract({
            address: PUBLIC_SPG_NFT_CONTRACT,
            abi: [
              {
                name: 'totalSupply',
                type: 'function',
                stateMutability: 'view',
                inputs: [],
                outputs: [{ name: '', type: 'uint256' }],
              },
            ],
            functionName: 'totalSupply',
          })
          console.log('[registerIPAssetDirectContract] ✅ SPG NFT contract is functional. Total supply:', totalSupply.toString())
        } catch (readError) {
          console.warn('[registerIPAssetDirectContract] ⚠️ Could not read totalSupply from SPG NFT contract:', readError)
          console.warn('[registerIPAssetDirectContract] ⚠️ Contract exists but may not be fully compatible')
        }
      } catch (contractError: any) {
        console.error('[registerIPAssetDirectContract] ⚠️ SPG NFT contract verification failed:', contractError)
        throw new Error(`SPG NFT contract verification failed: ${contractError.message}. Please check contract address: ${PUBLIC_SPG_NFT_CONTRACT}`)
      }
      
      // Step 6: Call smart contract directly
      console.log('[registerIPAssetDirectContract] Calling RegistrationWorkflows.mintAndRegisterIp...')
      console.log('[registerIPAssetDirectContract] Contract:', REGISTRATION_WORKFLOWS_ADDRESS)
      console.log('[registerIPAssetDirectContract] SPG NFT Contract:', PUBLIC_SPG_NFT_CONTRACT)
      console.log('[registerIPAssetDirectContract] Recipient:', formattedRecipient)
      console.log('[registerIPAssetDirectContract] IP Metadata URI:', ipMetadataURI)
      console.log('[registerIPAssetDirectContract] IP Metadata Hash:', ipHash)
      console.log('[registerIPAssetDirectContract] NFT Metadata URI:', nftMetadataURI)
      console.log('[registerIPAssetDirectContract] NFT Metadata Hash:', nftHash)

      // Call smart contract - walletClient will use its own account for signing
      // Don't pass account parameter if walletClient already has account
      const contractCallParams: any = {
        address: REGISTRATION_WORKFLOWS_ADDRESS,
        abi: REGISTRATION_WORKFLOWS_ABI,
        functionName: 'mintAndRegisterIp',
        args: [
          PUBLIC_SPG_NFT_CONTRACT,
          formattedRecipient,
          {
            ipMetadataURI: ipMetadataURI,
            ipMetadataHash: ipHash as `0x${string}`,
            nftMetadataURI: nftMetadataURI,
            nftMetadataHash: nftHash as `0x${string}`,
          },
          true, // allowDuplicates
        ],
        // Increase gas limit to avoid out-of-gas errors
        // Story Protocol registration can be gas-intensive due to IPFS fetching and validation
        gas: 5000000n, // 5M gas (should be enough for registration)
      }
      
      // Always pass account for signing
      if (params.account) {
        contractCallParams.account = params.account
      }
      
      // Try to simulate contract call first to get better error messages
      console.log('[registerIPAssetDirectContract] Simulating contract call...')
      try {
        const simulationResult = await publicClient.simulateContract({
          ...contractCallParams,
          account: params.account,
        })
        console.log('[registerIPAssetDirectContract] ✅ Contract simulation passed')
        console.log('[registerIPAssetDirectContract] Simulation result:', simulationResult)
      } catch (simError: any) {
        console.error('[registerIPAssetDirectContract] ⚠️ Contract simulation failed:', simError)
        console.error('[registerIPAssetDirectContract] Simulation error details:', {
          message: simError.message,
          cause: simError.cause,
          data: simError.data,
        })
        
        // Try to decode simulation error with full ABI (including custom errors)
        if (simError.cause?.data || simError.data) {
          try {
            const errorData = simError.cause?.data || simError.data
            const decoded = decodeErrorResult({
              abi: FULL_REGISTRATION_ABI,
              data: errorData,
            })
            console.error('[registerIPAssetDirectContract] Decoded simulation error:', decoded)
            
            // Provide specific error messages based on error type
            let errorMessage = `Contract simulation failed: ${decoded.errorName}`
            if (decoded.errorName === 'MetadataHashMismatch' && decoded.args) {
              errorMessage += `. Expected hash: ${decoded.args[0]}, Actual hash: ${decoded.args[1]}. Please verify metadata hash calculation.`
            } else if (decoded.errorName === 'MetadataNotAccessible') {
              errorMessage += `. Metadata URI not accessible: ${decoded.args?.[0] || 'unknown'}. Please check IPFS gateway accessibility.`
            } else if (decoded.errorName === 'InvalidSPGContract') {
              errorMessage += `. Invalid SPG NFT contract: ${decoded.args?.[0] || 'unknown'}. Please verify contract address.`
            } else {
              errorMessage += `. This usually means the transaction will fail. Please check metadata accessibility and hash values.`
            }
            
            throw new Error(errorMessage)
          } catch (decodeErr: any) {
            // If decode fails, try to lookup error signature
            const errorData = simError.cause?.data || simError.data
            if (errorData && typeof errorData === 'string' && errorData.startsWith('0x')) {
              const signature = errorData.slice(0, 10) // First 4 bytes
              console.warn('[registerIPAssetDirectContract] Error signature:', signature)
              console.warn('[registerIPAssetDirectContract] Could not decode error:', decodeErr)
              
              // Common error signatures
              if (signature === '0x3bdad64c') {
                throw new Error('Contract simulation failed: Transaction failed (0x3bdad64c). This usually indicates a contract validation error. Check metadata accessibility, hash values, and SPG NFT contract state.')
              }
            }
            console.warn('[registerIPAssetDirectContract] Could not decode simulation error:', decodeErr)
          }
        }
        
        // Don't continue if simulation fails - it means the transaction will definitely fail
        throw new Error(`Contract simulation failed: ${simError.message}. Please check metadata accessibility and try again.`)
      }
      
      // Send transaction with retry logic
      console.log('[registerIPAssetDirectContract] Sending transaction...')
      const MAX_TRANSACTION_RETRIES = 3
      let hash: `0x${string}` | null = null
      let lastError: any = null
      
      for (let attempt = 1; attempt <= MAX_TRANSACTION_RETRIES; attempt++) {
        try {
          // Wait longer before retry for IPFS propagation
          if (attempt > 1) {
            const delay = Math.min(5000 * Math.pow(2, attempt - 2), 30000) // Exponential backoff, max 30s
            console.log(`[registerIPAssetDirectContract] Retry ${attempt}/${MAX_TRANSACTION_RETRIES} - Waiting ${delay}ms before retry...`)
            await new Promise(resolve => setTimeout(resolve, delay))
            
            // SKIP metadata verification on retry to avoid Pinata rate limiting (429 errors)
            // Metadata is already verified during upload and contract will validate it
            console.log('[registerIPAssetDirectContract] ⏭️ Skipping metadata verification on retry (to avoid rate limiting)')
            
            // Re-simulate contract call before retry
            try {
              await publicClient.simulateContract({
                ...contractCallParams,
                account: params.account,
              })
              console.log('[registerIPAssetDirectContract] ✅ Contract simulation passed before retry')
            } catch (simError) {
              console.error('[registerIPAssetDirectContract] ⚠️ Contract simulation failed before retry:', simError)
              // Continue anyway - might be transient
            }
          }
          
          hash = await walletClient.writeContract(contractCallParams)
          console.log(`[registerIPAssetDirectContract] ✅ Transaction sent! Hash: ${hash}`)
          break // Success
        } catch (txError: any) {
          lastError = txError
          
          // Don't retry on certain errors
          if (txError.message?.includes('user rejected') || txError.message?.includes('User rejected')) {
            throw new Error('Transaction was rejected by user. Please approve the transaction to continue.')
          }
          
          if (txError.message?.includes('insufficient funds')) {
            throw new Error('Insufficient funds for transaction. Please fund your wallet with IP tokens.')
          }
          
          if (attempt === MAX_TRANSACTION_RETRIES) {
            console.error(`[registerIPAssetDirectContract] ❌ Transaction failed after ${MAX_TRANSACTION_RETRIES} attempts`)
            throw txError
          }
          
          console.warn(`[registerIPAssetDirectContract] ⚠️ Transaction attempt ${attempt} failed:`, txError.message)
          console.warn(`[registerIPAssetDirectContract] 💡 Retrying... (${attempt + 1}/${MAX_TRANSACTION_RETRIES})`)
        }
      }
      
      if (!hash) {
        throw lastError || new Error('Transaction failed after all retry attempts')
      }

      // Wait for transaction receipt
      console.log('[registerIPAssetDirectContract] Waiting for transaction confirmation...')
      // Use the publicClient that was already created in pre-flight checks
      const receipt = await publicClient.waitForTransactionReceipt({ hash })
      console.log('[registerIPAssetDirectContract] ✅ Transaction confirmed!')
      console.log('[registerIPAssetDirectContract] Block number:', receipt.blockNumber)
      console.log('[registerIPAssetDirectContract] Gas used:', receipt.gasUsed.toString())

      // Extract IP ID from transaction receipt logs
      // Look for IPRegistered event
      let ipId: Address | null = null
      let tokenId: bigint | null = null

      console.log('[registerIPAssetDirectContract] Scanning transaction logs for IPRegistered event...')
      console.log('[registerIPAssetDirectContract] Total logs:', receipt.logs.length)
      
      for (let i = 0; i < receipt.logs.length; i++) {
        const log = receipt.logs[i]
        console.log(`[registerIPAssetDirectContract] Log ${i}: address=${log.address}, topics=${log.topics.length}`)
        
        try {
          const decoded = decodeEventLog({
            abi: [IP_REGISTERED_EVENT],
            data: log.data,
            topics: log.topics,
          })

          if (decoded.eventName === 'IPRegistered') {
            ipId = decoded.args.ipId
            tokenId = decoded.args.tokenId
            console.log('[registerIPAssetDirectContract] ✅ IPRegistered event found!')
            console.log('[registerIPAssetDirectContract] IP ID:', ipId)
            console.log('[registerIPAssetDirectContract] Token ID:', tokenId.toString())
            break
          }
              } catch (e) {
          // Not the event we're looking for, continue
          // console.log(`[registerIPAssetDirectContract] Log ${i} is not IPRegistered event`)
        }
      }
      
      // Also try querying events directly from IPAssetRegistry
      if (!ipId) {
        console.log('[registerIPAssetDirectContract] Event not found in receipt, querying IPAssetRegistry directly...')
        try {
          const AENEID_CHAIN_ID = 1315
          const latestBlock = await publicClient.getBlockNumber()
          const fromBlock = receipt.blockNumber > 1000n ? receipt.blockNumber - 1000n : 0n
          
          const logs = await publicClient.getLogs({
            address: IP_ASSET_REGISTRY_ADDRESS,
            event: IP_REGISTERED_EVENT,
            fromBlock,
            toBlock: latestBlock,
          })
          
          console.log('[registerIPAssetDirectContract] Found', logs.length, 'IPRegistered events in recent blocks')
          
          // Find event from our transaction
          for (const eventLog of logs) {
            if (eventLog.transactionHash === hash) {
              ipId = eventLog.args.ipId
              tokenId = eventLog.args.tokenId
              console.log('[registerIPAssetDirectContract] ✅ IPRegistered event found via direct query!')
              console.log('[registerIPAssetDirectContract] IP ID:', ipId)
              console.log('[registerIPAssetDirectContract] Token ID:', tokenId?.toString())
              break
            }
          }
        } catch (queryError) {
          console.warn('[registerIPAssetDirectContract] Failed to query events directly:', queryError)
        }
      }

      if (!ipId) {
        // Fallback: Calculate IP ID from expected token ID
        // We need to get the token ID from the SPG NFT contract
        console.log('[registerIPAssetDirectContract] ⚠️ IPRegistered event not found, trying to calculate IP ID...')
        
        // Query SPG NFT contract for totalSupply to get token ID
        try {
          const totalSupply = await publicClient.readContract({
            address: PUBLIC_SPG_NFT_CONTRACT,
            abi: [
              {
                name: 'totalSupply',
                type: 'function',
                stateMutability: 'view',
                inputs: [],
                outputs: [{ name: '', type: 'uint256' }],
              },
            ],
            functionName: 'totalSupply',
          })
          
          const expectedTokenId = totalSupply
          console.log('[registerIPAssetDirectContract] Expected token ID:', expectedTokenId.toString())
          
          // Calculate IP ID using IPAssetRegistry.ipId function
          // Note: STORY_CHAIN_ID is 'aeneid' (string), but contract needs numeric chain ID (1315)
          const AENEID_CHAIN_ID = 1315
          ipId = await publicClient.readContract({
            address: IP_ASSET_REGISTRY_ADDRESS,
            abi: IP_ASSET_REGISTRY_ABI,
            functionName: 'ipId',
            args: [BigInt(AENEID_CHAIN_ID), PUBLIC_SPG_NFT_CONTRACT, expectedTokenId],
          })
          
          console.log('[registerIPAssetDirectContract] ✅ IP ID calculated:', ipId)
        } catch (calcError: any) {
          console.error('[registerIPAssetDirectContract] Failed to calculate IP ID:', calcError)
          throw new Error(`Transaction succeeded but could not extract IP ID. Transaction hash: ${hash}. Please check the transaction on explorer.`)
        }
      }

      if (!ipId) {
        throw new Error(`Transaction succeeded but IP ID not found. Transaction hash: ${hash}. Please check the transaction on explorer.`)
      }

      console.log('[registerIPAssetDirectContract] ✅ IP Asset registered successfully!')
      console.log('[registerIPAssetDirectContract] IP ID:', ipId)
      console.log('[registerIPAssetDirectContract] View on explorer:', `https://aeneid.explorer.story.foundation/ipa/${ipId}`)

      return {
        id: ipId,
        owner: formattedRecipient,
        name: params.name,
        registeredAt: new Date().toISOString(),
        transactionHash: hash,
        metadata: {
          ...params.metadata,
          mediaUrl: imageIpfsUri,
          ipfsHash: imageIpfsHash,
        },
      }
    } catch (error: any) {
      console.error('[registerIPAssetDirectContract] Registration failed:', error)
      console.error('[registerIPAssetDirectContract] Error details:', {
        message: error.message,
        cause: error.cause,
        data: error.data,
        shortMessage: error.shortMessage,
        name: error.name,
      })

      // Try to decode contract error for more details
      let errorMessage = error.message || 'Unknown error'
      let errorDetails = ''
      
      // Check for error data in various locations
      const errorData = error.cause?.data || error.data || error.cause?.cause?.data
      
      if (errorData) {
        try {
          // Try with full ABI first (including custom errors)
          const decoded = decodeErrorResult({
            abi: FULL_REGISTRATION_ABI,
            data: errorData,
          })
          errorDetails = `Contract error: ${decoded.errorName}`
          if (decoded.args && decoded.args.length > 0) {
            errorDetails += ` - Args: ${JSON.stringify(decoded.args)}`
          }
          console.error('[registerIPAssetDirectContract] Decoded error:', errorDetails)
        } catch (decodeErr) {
          // If decode fails, try to extract error signature
          if (typeof errorData === 'string' && errorData.startsWith('0x')) {
            const signature = errorData.slice(0, 10) // First 4 bytes
            console.warn('[registerIPAssetDirectContract] Error signature:', signature)
            
            // Map common error signatures to user-friendly messages
            const signatureMap: Record<string, string> = {
              '0x3bdad64c': 'Transaction failed - Contract validation error. Check metadata accessibility and hash values.',
              '0x08c379a0': 'Error(string) - Generic revert with message',
              '0x4e487b71': 'Panic(uint256) - Contract panic',
            }
            
            if (signatureMap[signature]) {
              errorDetails = `Contract error signature: ${signature} - ${signatureMap[signature]}`
            } else {
              errorDetails = `Contract error signature: ${signature} - Unable to decode. Check Tenderly dashboard for details.`
            }
          } else {
            console.warn('[registerIPAssetDirectContract] Could not decode error:', decodeErr)
            console.warn('[registerIPAssetDirectContract] Error data:', errorData)
          }
        }
      }
      
      // Check for specific error patterns
      if (error.message?.includes('Pinata') || error.message?.includes('IPFS')) {
        throw new Error('IPFS upload or metadata accessibility issue. Please check:\n1. Pinata credentials are correct\n2. IPFS gateway is accessible\n3. Metadata is properly formatted')
      }

      if (error.message?.includes('insufficient funds') || error.message?.includes('balance')) {
        throw new Error('Insufficient funds for registration. Please fund your wallet with IP tokens (get from faucet: https://docs.story.foundation/aeneid).')
      }
      
      if (error.message?.includes('metadata') || error.message?.includes('hash') || error.message?.includes('verification')) {
        throw new Error(`Metadata validation failed: ${error.message}\n\nPlease check:\n1. IPFS metadata is accessible\n2. Metadata hash matches\n3. Metadata format is correct`)
      }
      
      if (error.message?.includes('Transaction failed') || error.message?.includes('reverted') || error.message?.includes('simulation')) {
        // Try to get metadata URIs from error context or use fallback
        const metadataInfo = errorDetails 
          ? `\n\nContract error details: ${errorDetails}`
          : ''
        
        // Check if using Tenderly RPC for better debugging
        const rpcUrl = getStoryRpcUrl()
        const isTenderly = rpcUrl.includes('tenderly.co')
        const tenderlyNote = isTenderly 
          ? '\n\n✅ Using Tenderly RPC - Check Tenderly dashboard for detailed error logs and transaction simulation.'
          : '\n\n💡 TIP: Switch to Tenderly RPC in Settings for better error debugging and detailed transaction logs.'
        
        const enhancedMessage = `Contract transaction failed: ${error.message}${metadataInfo}\n\nPossible causes:\n1. SPG NFT contract state issue (contract not properly initialized)\n2. Metadata not accessible during contract execution (IPFS gateway timeout)\n3. Invalid metadata hash mismatch\n4. Contract validation failed\n5. Insufficient gas\n\nTroubleshooting steps:\n1. Wait 10-30 seconds and retry (IPFS propagation delay)\n2. Check wallet balance (need IP tokens from faucet: https://docs.story.foundation/aeneid)\n3. Verify metadata is accessible via Pinata gateway\n4. Check SPG NFT contract: ${PUBLIC_SPG_NFT_CONTRACT}\n5. Check transaction on explorer: https://explorer.aeneid.storyprotocol.xyz${tenderlyNote}\n\nIf issue persists:\n- Check browser console for detailed error logs\n- Try using Tenderly RPC for better debugging\n- Verify SPG NFT contract is properly deployed and initialized`
        throw new Error(enhancedMessage)
      }

      // Re-throw with enhanced message if we have details
      if (errorDetails) {
        throw new Error(`${errorMessage}\n\n${errorDetails}`)
      }

      throw error
    }
  }

  /**
   * Fund wallet using Tenderly's tenderly_setBalance RPC method
   * Only works with Tenderly Virtual TestNet
   */
  async fundWallet(amount: string = '1.0'): Promise<boolean> {
    if (!this.publicClient) {
      throw new Error('Public client not initialized')
    }

    if (!this.account?.address) {
      throw new Error('Account address not available')
      }
      
      try {
      // Check if using Tenderly RPC
      const rpcUrl = this.getRpcUrl()
      const isTenderly = rpcUrl?.includes('tenderly.co')
      
      if (!isTenderly) {
        throw new Error('Fund wallet only works with Tenderly Virtual TestNet')
      }

      // Convert amount to wei (hex)
      const amountWei = BigInt(Math.floor(parseFloat(amount) * 1e18))
      const amountHex = `0x${amountWei.toString(16)}`

      console.log('[fundWallet] Funding wallet:', this.account.address)
      console.log('[fundWallet] Amount:', amount, 'ETH/IP')
      console.log('[fundWallet] Amount (wei):', amountHex)

      // Call tenderly_setBalance
      const result = await this.publicClient.request({
        method: 'tenderly_setBalance',
        params: [[this.account.address], amountHex],
      } as any)

      console.log('[fundWallet] ✅ Fund result:', result)

      // Verify balance was updated
      const balance = await this.publicClient.getBalance({
        address: this.account.address as Address,
      })

      console.log('[fundWallet] ✅ New balance:', balance.toString(), 'wei')
      console.log('[fundWallet] ✅ New balance (ETH/IP):', (Number(balance) / 1e18).toFixed(4))

      return true
    } catch (error: any) {
      console.error('[fundWallet] Error:', error)
      throw new Error(`Failed to fund wallet: ${error.message}`)
    }
  }

  /**
   * Extract IP ID from successful transaction hash
   * Useful when transaction succeeded in Tenderly but SDK didn't return IP ID
   */
  async getIPIdFromTransaction(txHash: string): Promise<string | null> {
    if (!this.publicClient) {
      throw new Error('Public client not initialized')
    }

    try {
      console.log('[getIPIdFromTransaction] Getting receipt for:', txHash)
      const receipt = await this.publicClient.getTransactionReceipt({
              hash: txHash as `0x${string}`,
      })

      if (!receipt || receipt.status !== 'success') {
        console.warn('[getIPIdFromTransaction] Transaction not successful or not found')
        return null
      }

      console.log('[getIPIdFromTransaction] ✅ Transaction receipt found, checking logs...')
            
            // Extract IP ID from transaction logs
            if (receipt.logs && receipt.logs.length > 0) {
              for (const log of receipt.logs) {
                try {
                  const decoded = this.publicClient.decodeEventLog({
                    abi: [IP_REGISTERED_EVENT],
                    data: log.data,
                    topics: log.topics,
                  })
                  
                  if (decoded.eventName === 'IPRegistered') {
                    const ipId = decoded.args.ipId
                    if (ipId) {
                console.log('[getIPIdFromTransaction] ✅ Found IP ID:', ipId)
                return ipId as string
                    }
                  }
                } catch (decodeError) {
                  // Not the event we're looking for, continue
                }
              }
            }

      console.warn('[getIPIdFromTransaction] No IPRegistered event found in transaction logs')
      return null
    } catch (error: any) {
      console.error('[getIPIdFromTransaction] Error:', error)
      throw new Error(`Failed to get IP ID from transaction: ${error.message}`)
    }
  }

  /**
   * Extract IP ID from successful transaction hash
   * Useful when transaction succeeded in Tenderly but SDK didn't return IP ID
   */
  async getIPIdFromTransaction(txHash: string): Promise<string | null> {
    if (!this.publicClient) {
      throw new Error('Public client not initialized')
    }

    try {
      console.log('[getIPIdFromTransaction] Getting receipt for:', txHash)
      const receipt = await this.publicClient.getTransactionReceipt({
        hash: txHash as `0x${string}`,
      })

      if (!receipt || receipt.status !== 'success') {
        console.warn('[getIPIdFromTransaction] Transaction not successful or not found')
        return null
      }

      console.log('[getIPIdFromTransaction] ✅ Transaction receipt found, checking logs...')

      // Extract IP ID from transaction logs
      if (receipt.logs && receipt.logs.length > 0) {
        for (const log of receipt.logs) {
          try {
            const decoded = this.publicClient.decodeEventLog({
              abi: [IP_REGISTERED_EVENT],
              data: log.data,
              topics: log.topics,
            })

            if (decoded.eventName === 'IPRegistered') {
              const ipId = decoded.args.ipId
                if (ipId) {
                console.log('[getIPIdFromTransaction] ✅ Found IP ID:', ipId)
                return ipId as string
              }
            }
          } catch (decodeError) {
            // Not the event we're looking for, continue
          }
        }
      }

      console.warn('[getIPIdFromTransaction] No IPRegistered event found in transaction logs')
      return null
    } catch (error: any) {
      console.error('[getIPIdFromTransaction] Error:', error.message)
      return null
    }
  }

  /**
   * Get IP Asset by ID
   * Uses Story Protocol SDK's isRegistered method and queries contract for details
   */
  async getIPAsset(ipId: string): Promise<IPAsset | null> {
    if (!this.client || !this.publicClient) {
      throw new Error('Story Protocol client not initialized')
    }

    try {
      // Check if IP is registered
      const isRegistered = await this.client.ipAsset.isRegistered(ipId as `0x${string}`)
      
      if (!isRegistered) {
        return null
      }

      // Query IPRegistered events to get registration details
      const registryAddress = await this.getIPAssetRegistryAddress()
      
      try {
        const registryAddress = await this.getIPAssetRegistryAddress()
        
        // Query events for this specific IP ID
        const logs = await this.publicClient.getLogs({
          event: IP_REGISTERED_EVENT,
          args: {
            ipId: ipId as Address,
          },
          ...(registryAddress && { address: registryAddress }),
          fromBlock: 'earliest',
          toBlock: 'latest',
        })

        if (logs.length > 0) {
          const latestLog = logs[logs.length - 1]
          const owner = latestLog.args.caller || ''
          const metadataURI = latestLog.args.ipMetadataURI || ''
          
          return {
            id: ipId,
            name: `IP Asset ${ipId.slice(0, 10)}...`,
            owner: owner as string,
            registeredAt: new Date().toISOString(),
            metadata: {
              metadataURI,
            },
          }
        }
      } catch (eventError) {
        console.warn('Failed to query events, using fallback:', eventError)
      }

      // Fallback: Return basic info if event query fails
      return {
        id: ipId,
        name: `IP Asset ${ipId.slice(0, 10)}...`,
        owner: '', // Could not determine from events
        registeredAt: new Date().toISOString(),
        metadata: {},
      }
    } catch (error) {
      console.error('Failed to get IP Asset:', error)
      return null
    }
  }

  /**
   * Get IP Assets by owner address
   * Queries IPRegistered events from IPAssetRegistry contract
   */
  async getIPAssetsByOwner(ownerAddress: string): Promise<IPAsset[]> {
    if (!this.client || !this.publicClient) {
      throw new Error('Story Protocol client not initialized')
    }

    if (!ownerAddress) {
      return []
    }

    try {
      const ownerAddr = getAddress(ownerAddress as Address)
      console.log(`[getIPAssetsByOwner] Finding IP assets for owner: ${ownerAddr}`)
      
      // Method 1: Query SPG NFT contract for all tokens owned by user
      // This is more reliable than querying events
      const ERC721_FULL_ABI = [
        {
          name: 'balanceOf',
          type: 'function',
          stateMutability: 'view',
          inputs: [{ name: 'owner', type: 'address' }],
          outputs: [{ name: 'balance', type: 'uint256' }],
        },
        {
          name: 'tokenOfOwnerByIndex',
          type: 'function',
          stateMutability: 'view',
          inputs: [
            { name: 'owner', type: 'address' },
            { name: 'index', type: 'uint256' }
          ],
          outputs: [{ name: 'tokenId', type: 'uint256' }],
        },
        {
          name: 'totalSupply',
          type: 'function',
          stateMutability: 'view',
          inputs: [],
          outputs: [{ name: 'totalSupply', type: 'uint256' }],
        },
        {
          name: 'ownerOf',
          type: 'function',
          stateMutability: 'view',
          inputs: [{ name: 'tokenId', type: 'uint256' }],
          outputs: [{ name: 'owner', type: 'address' }],
        },
      ] as const

      // Get user's NFT balance
      let balance = 0n
      try {
        balance = await this.publicClient.readContract({
          address: PUBLIC_SPG_NFT_CONTRACT,
          abi: ERC721_FULL_ABI,
          functionName: 'balanceOf',
          args: [ownerAddr],
        })
      } catch (error) {
        console.warn('[getIPAssetsByOwner] Failed to get balance from SPG contract:', error)
        balance = 0n
      }

      const ownedAssets: IPAsset[] = []

      // Get all token IDs owned by user
      // IMPORTANT: tokenOfOwnerByIndex is NOT available in SPG NFT contract
      // We use Transfer events instead to find tokens owned by user
      if (balance > 0n) {
        // Get total supply to know how many tokens exist
        let totalSupply = 0n
        try {
          totalSupply = await this.publicClient.readContract({
            address: PUBLIC_SPG_NFT_CONTRACT,
            abi: ERC721_FULL_ABI,
            functionName: 'totalSupply',
          })
        } catch (error) {
          console.warn('[getIPAssetsByOwner] Failed to get totalSupply, trying alternative method:', error)
          // If totalSupply fails, try querying Transfer events instead
          totalSupply = 0n
        }

        // Query Transfer events to find tokens transferred to this user
        // This is more efficient than checking all tokens
        const TRANSFER_EVENT = parseAbiItem(
          'event Transfer(address indexed from, address indexed to, uint256 indexed tokenId)'
        )
        
        let fromBlock: 'earliest' | bigint = 'earliest'
        let toBlock: 'latest' | bigint = 'latest'
        try {
          const currentBlock = await this.publicClient.getBlockNumber()
          // Query last 50000 blocks (should cover all recent registrations)
          fromBlock = currentBlock > 50000n ? currentBlock - 50000n : 0n
          toBlock = currentBlock
        } catch (error) {
          console.warn('[getIPAssetsByOwner] Could not get current block:', error)
        }
        
        const tokenIds: bigint[] = []
        try {
          // Query Transfer events where 'to' is the user
          const transferToLogs = await this.publicClient.getLogs({
            event: TRANSFER_EVENT,
            address: PUBLIC_SPG_NFT_CONTRACT,
            args: {
              to: ownerAddr,
            },
            fromBlock: fromBlock,
            toBlock: toBlock,
          })
          
          // Query Transfer events where 'from' is the user (to find tokens transferred away)
          const transferFromLogs = await this.publicClient.getLogs({
            event: TRANSFER_EVENT,
            address: PUBLIC_SPG_NFT_CONTRACT,
            args: {
              from: ownerAddr,
            },
            fromBlock: fromBlock,
            toBlock: toBlock,
          })
          
          // Build a map of token ownership: tokenId -> latest owner
          // Process all transfers chronologically to determine current ownership
          const tokenOwnership = new Map<string, Address>()
          
          // Combine all transfers and sort by block number
          const allTransfers = [
            ...transferToLogs,
            ...transferFromLogs,
          ].sort((a, b) => {
            // Sort by block number, then by transaction index, then by log index
            const blockDiff = Number(a.blockNumber - b.blockNumber)
            if (blockDiff !== 0) return blockDiff
            return a.logIndex - b.logIndex
          })
          
          for (const log of allTransfers) {
            try {
              const decoded = decodeEventLog({
                abi: [TRANSFER_EVENT],
                data: log.data,
                topics: log.topics,
              })
              
              if (decoded.args.tokenId) {
                const tokenIdStr = decoded.args.tokenId.toString()
                // Update ownership to the 'to' address (current owner after transfer)
                tokenOwnership.set(tokenIdStr, decoded.args.to)
              }
            } catch (error) {
              // Skip invalid events
              continue
            }
          }
          
          // Find tokens currently owned by user
          for (const [tokenIdStr, owner] of tokenOwnership.entries()) {
            if (owner.toLowerCase() === ownerAddr.toLowerCase()) {
              tokenIds.push(BigInt(tokenIdStr))
            }
          }
          
          // Verify ownership with ownerOf calls to ensure accuracy
          if (tokenIds.length > 0) {
            const verifiedTokenIds: bigint[] = []
            const verifyPromises = tokenIds.map(async (tokenId) => {
              try {
                const currentOwner = await this.publicClient.readContract({
                  address: PUBLIC_SPG_NFT_CONTRACT,
                  abi: ERC721_FULL_ABI,
                  functionName: 'ownerOf',
                  args: [tokenId],
                })
                if (currentOwner.toLowerCase() === ownerAddr.toLowerCase()) {
                  return tokenId
                }
                return null
              } catch (error) {
                // Token might not exist or call failed
                return null
              }
            })
            
            const verifyResults = await Promise.all(verifyPromises)
            for (const result of verifyResults) {
              if (result) {
                verifiedTokenIds.push(result)
              }
            }
            
            // Replace with verified tokens
            tokenIds.length = 0
            tokenIds.push(...verifiedTokenIds)
          }
        } catch (error) {
          console.warn('[getIPAssetsByOwner] Failed to query Transfer events, falling back to checking all tokens:', error)
          
          // Fallback: Check ownership for recent tokens (last 1000 tokens)
          if (totalSupply > 0n) {
            const maxTokensToCheck = totalSupply > 1000n ? 1000n : totalSupply
            console.log(`[getIPAssetsByOwner] Checking ownership for last ${maxTokensToCheck.toString()} tokens...`)
            
            const startToken = totalSupply - maxTokensToCheck + 1n
            const batchSize = 50
            for (let tokenId = startToken; tokenId <= totalSupply; tokenId += batchSize) {
              const endToken = tokenId + batchSize > totalSupply ? totalSupply : tokenId + batchSize - 1n
              const batchPromises = []
              
              for (let t = tokenId; t <= endToken; t++) {
                batchPromises.push(
                  this.publicClient.readContract({
                    address: PUBLIC_SPG_NFT_CONTRACT,
                    abi: ERC721_FULL_ABI,
                    functionName: 'ownerOf',
                    args: [t],
                  }).then(owner => {
                    if (owner.toLowerCase() === ownerAddr.toLowerCase()) {
                      return t
                    }
                    return null
                  }).catch(() => null)
                )
              }
              
              const batchResults = await Promise.all(batchPromises)
              for (const result of batchResults) {
                if (result) {
                  tokenIds.push(result)
                }
              }
              
              if (tokenIds.length >= Number(balance)) {
                break
              }
            }
          }
        }

        // Calculate IP ID for each token using IPAssetRegistry.ipId function
        // This is the official way to get IP ID from token
        const AENEID_CHAIN_ID = 1315n
        const IP_ASSET_REGISTRY_ABI_FOR_IPID = [
          {
            name: 'ipId',
            type: 'function',
            stateMutability: 'view',
            inputs: [
              { name: 'chainId', type: 'uint256' },
              { name: 'tokenContract', type: 'address' },
              { name: 'tokenId', type: 'uint256' },
            ],
            outputs: [{ name: 'ipId', type: 'address' }],
          },
        ] as const

        const registryAddress = await this.getIPAssetRegistryAddress()
        
        // Validate registry address before attempting to query
        if (!registryAddress) {
          console.warn('[getIPAssetsByOwner] ⚠️ IPAssetRegistry address not available, skipping IP ID queries')
        } else {
          let successCount = 0
          let failCount = 0
          
          for (const tokenId of tokenIds) {
            try {
              // Query IP ID directly from IPAssetRegistry contract
              const ipId = await this.publicClient.readContract({
                address: registryAddress,
                abi: IP_ASSET_REGISTRY_ABI_FOR_IPID,
                functionName: 'ipId',
                args: [AENEID_CHAIN_ID, PUBLIC_SPG_NFT_CONTRACT as Address, tokenId],
              })
              
              ownedAssets.push({
                id: ipId,
                name: `IP Asset ${ipId.slice(0, 10)}...`,
                owner: ownerAddress,
                registeredAt: new Date().toISOString(),
                metadata: {
                  tokenId: tokenId.toString(),
                },
              })
              successCount++
            } catch (error: any) {
              // Silently skip tokens that fail - they might not be registered as IP assets
              failCount++
              // Only log if it's not a contract execution error (which is expected for non-IP tokens)
              if (error?.name !== 'ContractFunctionExecutionError' && error?.name !== 'CallExecutionError') {
                console.warn(`[getIPAssetsByOwner] Failed to get IP ID for token ${tokenId}:`, error?.message || error)
              }
            }
          }
          
          if (successCount > 0 || failCount > 0) {
            console.log(`[getIPAssetsByOwner] IP ID queries: ${successCount} success, ${failCount} skipped (tokens may not be IP assets)`)
          }
        }
      }

      // Method 2: Also try querying events as fallback (for older registrations)
      // Only run if we didn't find assets in Method 1
      const eventBasedAssets: IPAsset[] = []
      if (ownedAssets.length === 0) {
        console.log('[getIPAssetsByOwner] Method 2: Querying IPRegistered events as fallback...')
        const registryAddress = await this.getIPAssetRegistryAddress()
        
        let fromBlock: 'earliest' | bigint = 'earliest'
        let toBlock: 'latest' | bigint = 'latest'
        try {
          const currentBlock = await this.publicClient.getBlockNumber()
          fromBlock = currentBlock > 20000n ? currentBlock - 20000n : 0n
          toBlock = currentBlock
        } catch (error) {
          // Silently skip if can't get block number
        }
          
        let allLogs: any[] = []
        try {
          allLogs = await this.publicClient.getLogs({
            event: IP_REGISTERED_EVENT,
            ...(registryAddress && { address: registryAddress }),
            fromBlock: fromBlock,
            toBlock: toBlock,
          })
        } catch (error) {
          // Silently skip if query fails
          allLogs = []
        }
      
        // Decode all events first
        const decodedEvents: Array<{ ipId: Address, tokenId: bigint, metadataURI: string, blockNumber: bigint }> = []
        for (const log of allLogs) {
          try {
            const decoded = decodeEventLog({
              abi: [IP_REGISTERED_EVENT],
              data: log.data,
              topics: log.topics,
            })
            
            const ipId = decoded.args.ipId
            const tokenId = decoded.args.tokenId
            const metadataURI = decoded.args.ipMetadataURI || ''
            
            if (ipId && tokenId) {
              decodedEvents.push({
                ipId,
                tokenId,
                metadataURI,
                blockNumber: log.blockNumber,
              })
            }
          } catch (decodeError) {
            // Skip invalid events
            continue
          }
        }

        // Check ownership in parallel (batch of 10 at a time to avoid rate limiting)
        const batchSize = 10
        
        for (let i = 0; i < decodedEvents.length; i += batchSize) {
          const batch = decodedEvents.slice(i, i + batchSize)
          const ownershipChecks = await Promise.allSettled(
            batch.map(async (event) => {
              try {
                const nftOwner = await this.publicClient.readContract({
                  address: PUBLIC_SPG_NFT_CONTRACT,
                  abi: ERC721_FULL_ABI,
                  functionName: 'ownerOf',
                  args: [event.tokenId],
                })

                if (nftOwner.toLowerCase() === ownerAddr.toLowerCase()) {
                  return {
                    ipId: event.ipId,
                    tokenId: event.tokenId,
                    metadataURI: event.metadataURI,
                    blockNumber: event.blockNumber,
                  }
                }
                return null
              } catch (ownerError) {
                // NFT might not exist or contract call failed
                return null
              }
            })
          )

          // Add owned assets to result
          for (const result of ownershipChecks) {
            if (result.status === 'fulfilled' && result.value) {
              const event = result.value
              eventBasedAssets.push({
                id: event.ipId,
                name: `IP Asset ${event.ipId.slice(0, 10)}...`,
                owner: ownerAddress,
                registeredAt: new Date(Number(event.blockNumber) * 1000).toISOString(),
                metadata: {
                  metadataURI: event.metadataURI,
                  tokenId: event.tokenId.toString(),
                },
              })
            }
          }
        }
      }

      // Combine assets from both methods
      const ipAssets = [...ownedAssets, ...eventBasedAssets]

      // Remove duplicates (same IP ID might appear in multiple events)
      const uniqueAssets = new Map<string, IPAsset>()
      for (const asset of ipAssets) {
        if (!uniqueAssets.has(asset.id)) {
          uniqueAssets.set(asset.id, asset)
        }
      }

      const finalAssets = Array.from(uniqueAssets.values())
      if (finalAssets.length > 0) {
        console.log(`[getIPAssetsByOwner] ✅ Found ${finalAssets.length} unique IP assets for owner ${ownerAddress}`)
      } else {
        // Only log warning if user has NFTs but no IP assets found
        if (balance > 0n) {
          console.warn(`[getIPAssetsByOwner] ⚠️ User owns ${balance.toString()} NFTs but no IP assets found. Use manual input in Create & Register page.`)
        }
      }
      
      return finalAssets
    } catch (error: any) {
      console.error('[getIPAssetsByOwner] Failed to get IP Assets by owner:', error)
      console.error('[getIPAssetsByOwner] Error details:', {
        message: error?.message,
        name: error?.name,
        stack: error?.stack,
      })
      // Return empty array on error instead of throwing
      // This allows the UI to still render even if query fails
      return []
    }
  }

  /**
   * Verify IP Asset ownership
   */
  async verifyIPAsset(ipId: string, expectedOwner?: string): Promise<{
    isValid: boolean
    owner: string
    ipId: string
  }> {
    if (!this.client) {
      throw new Error('Story Protocol client not initialized')
    }

    try {
      const asset = await this.getIPAsset(ipId)
      
      if (!asset) {
        return {
          isValid: false,
          owner: '',
          ipId,
        }
      }

      const isValid = expectedOwner 
        ? asset.owner.toLowerCase() === expectedOwner.toLowerCase()
        : true

      return {
        isValid,
        owner: asset.owner,
        ipId,
      }
    } catch (error) {
      console.error('Failed to verify IP Asset:', error)
      return {
        isValid: false,
        owner: '',
        ipId,
      }
    }
  }

  /**
   * Create license terms for an IP Asset
   */
  async createLicense(ipId: string, licenseType: 'commercial' | 'nonCommercial' | 'commercialRemix' | 'ccBy'): Promise<{
    licenseTermsId: bigint
    txHash?: string
  }> {
    if (!this.client) {
      throw new Error('Story Protocol client not initialized')
    }

    try {
      let response
      
      switch (licenseType) {
        case 'commercial':
          // Register commercial use license
          response = await this.client.license.registerCommercialUsePIL({
            defaultMintingFee: BigInt(0),
            currency: '0x0000000000000000000000000000000000000000' as `0x${string}`,
          })
          break
        case 'nonCommercial':
          // Register non-commercial social remixing license
          response = await this.client.license.registerNonComSocialRemixingPIL()
          break
        case 'commercialRemix':
          // Register commercial remix license (requires fee configuration)
          response = await this.client.license.registerCommercialRemixPIL({
            defaultMintingFee: BigInt(0), // Set appropriate fee
            currency: '0x0000000000000000000000000000000000000000' as `0x${string}`, // Native token
            commercialRevShare: 100, // 100% revenue share
          })
          break
        case 'ccBy':
          // Register Creative Commons Attribution license
          response = await this.client.license.registerCreativeCommonsAttributionPIL({
            currency: '0x0000000000000000000000000000000000000000' as `0x${string}`,
          })
          break
        default:
          throw new Error('Invalid license type')
      }

      // Attach license terms to IP Asset
      if (response.licenseTermsId) {
        await this.client.license.attachLicenseTerms({
          ipId: ipId as `0x${string}`,
          licenseTermsId: response.licenseTermsId,
        })
      }

      if (!response.licenseTermsId) {
        throw new Error('Failed to create license: No license terms ID returned')
      }

      return {
        licenseTermsId: response.licenseTermsId,
        txHash: response.txHash,
      }
    } catch (error) {
      console.error('Failed to create license:', error)
      throw error
    }
  }
}

/**
 * Create Story Protocol service instance
 */
export function createStoryProtocolService(account: Account): StoryProtocolService {
  return new StoryProtocolService(account)
}

