'use client'

import { StoryClient, StoryConfig } from '@story-protocol/core-sdk'
import { http, createPublicClient, getAddress, parseAbiItem, Address, keccak256, toBytes, decodeEventLog, decodeErrorResult, encodeFunctionData } from 'viem'
import { STORY_CHAIN_ID } from '@/config/story'
import { Account } from 'viem'
import { uploadJSONToIPFS, uploadSVGToIPFS } from '@/services/ipfs-service'

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
const LICENSE_REGISTRY_ADDRESS = '0x04fbd8a2e56dd85CFD5500A4A4DfA955B9f1dE6f' as Address

// License Template Addresses (Aeneid Testnet)
// These are the PIL (Programmable IP License) template addresses
const LICENSE_TEMPLATES = {
  nonCommercial: '0x2E896b0b2Fdb7457499B56AAaA4AE55BCB4Cd316' as Address,
  commercial: '0x2E896b0b2Fdb7457499B56AAaA4AE55BCB4Cd316' as Address, // Same template, different terms
  commercialRemix: '0x2E896b0b2Fdb7457499B56AAaA4AE55BCB4Cd316' as Address,
} as const

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
  transactionHash?: string
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
  private account: Account | null = null

  constructor(account: Account) {
    this.account = account
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
          ipMetadataURI: `https://ipfs.io/ipfs/${ipIpfsHash}` as `0x${string}`,
          ipMetadataHash: ipHash as `0x${string}`,
          nftMetadataURI: `https://ipfs.io/ipfs/${nftIpfsHash}` as `0x${string}`,
          nftMetadataHash: nftHash as `0x${string}`,
        },
      })
      
      console.log('[registerIPAsset] ✅ IP Asset registered successfully!')
      console.log('[registerIPAsset] Transaction hash:', response.txHash)
      console.log('[registerIPAsset] IP ID:', response.ipId)
      console.log('[registerIPAsset] View on explorer:', `https://aeneid.explorer.story.foundation/ipa/${response.ipId}`)
      
      if (!response.ipId) {
        throw new Error('IP Asset registration succeeded but IP ID is missing')
      }
      
      return {
        id: response.ipId as string,
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
      // IMPORTANT: Add unique identifier to avoid duplicate metadata hash
      // If same metadata is registered twice, contract will reject it
      // Use wallet address + high precision timestamp + multiple random strings for maximum uniqueness
      const walletAddress = params.account.address || 'unknown'
      const random1 = Math.random().toString(36).substring(2, 9)
      const random2 = Math.random().toString(36).substring(2, 9)
      const random3 = Math.random().toString(36).substring(2, 9)
      const random4 = Math.random().toString(36).substring(2, 9)
      // Use high precision timestamp + performance.now() for maximum uniqueness
      const highPrecisionTimestamp = `${Date.now()}-${(performance.now() * 1000).toFixed(0)}`
      const uniqueId = `storyseal-${walletAddress.slice(-8)}-${highPrecisionTimestamp}-${random1}-${random2}-${random3}-${random4}`
      const uniqueMetadata = {
        ...params.metadata,
        registeredAt: new Date().toISOString(),
        registrationId: uniqueId,
        walletAddress: walletAddress, // Add wallet address for extra uniqueness
        timestamp: highPrecisionTimestamp, // High precision timestamp
        randomId: `${random1}-${random2}-${random3}-${random4}`, // Extra random component
        nonce: `${Date.now()}-${Math.random().toString(36).substring(2, 15)}`, // Additional nonce for extra uniqueness
      }
      
      const ipMetadata = {
        title: params.name,
        description: params.description || 'AI-generated artwork with invisible watermark protection',
        image: imageIpfsUri, // Use IPFS URI instead of data URL
        mediaUrl: imageIpfsUri, // Use IPFS URI instead of data URL
        mediaType: imageUrl.includes('svg') ? 'image/svg+xml' : 'image/png',
        ...uniqueMetadata,
      }

      // Step 3: Prepare NFT Metadata (ERC-721 standard)
      const nftMetadata = {
        name: params.name,
        description: params.description || 'Ownership NFT for StorySeal IP Asset',
        image: imageIpfsUri, // Use IPFS URI instead of data URL
      }

      console.log('[registerIPAssetDirectContract] Uploading IP metadata to IPFS...')
      const ipIpfsHash = await uploadJSONToIPFS(ipMetadata)
      console.log('[registerIPAssetDirectContract] ✅ IP metadata uploaded to IPFS:', ipIpfsHash)

      // Step 3: Calculate metadata hash (SHA256)
      // IMPORTANT: Hash must match what contract calculates from IPFS metadata
      // Contract will fetch metadata from IPFS and calculate hash, so we must use exact same format
      const ipMetadataString = JSON.stringify(ipMetadata) // No spacing/formatting differences
      const ipHash = await sha256Hash(ipMetadataString)
      console.log('[registerIPAssetDirectContract] ✅ IP metadata hash calculated (SHA256):', ipHash)
      console.log('[registerIPAssetDirectContract] IP metadata JSON:', ipMetadataString)

      console.log('[registerIPAssetDirectContract] Uploading NFT metadata to IPFS...')
      const nftIpfsHash = await uploadJSONToIPFS(nftMetadata)
      console.log('[registerIPAssetDirectContract] ✅ NFT metadata uploaded to IPFS:', nftIpfsHash)

      const nftMetadataString = JSON.stringify(nftMetadata) // No spacing/formatting differences
      const nftHash = await sha256Hash(nftMetadataString)
      console.log('[registerIPAssetDirectContract] ✅ NFT metadata hash calculated (SHA256):', nftHash)
      console.log('[registerIPAssetDirectContract] NFT metadata JSON:', nftMetadataString)
      
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
      
      if (balance === BigInt(0)) {
        throw new Error('Wallet balance is zero. Please fund your wallet with IP tokens from the faucet: https://docs.story.foundation/aeneid')
      }
      
      if (balanceInEth < 0.001) {
        console.warn('[registerIPAssetDirectContract] ⚠️ Low balance detected. Registration may fail due to insufficient gas.')
      }
      
      // Use Pinata gateway for contract calls (more reliable than ipfs.io)
      // Pinata gateway is faster and more accessible, reducing transaction failures
      // Story Protocol contract accepts any HTTP gateway URL, not just ipfs.io
      console.log('[registerIPAssetDirectContract] Using Pinata gateway for metadata URIs (more reliable)...')
      const pinataGateway = `https://gateway.pinata.cloud/ipfs/`
      const ipfsGateway = `https://ipfs.io/ipfs/` // Fallback for verification
      
      // Use Pinata gateway for contract calls (more reliable and accessible)
      const ipMetadataURI = `${pinataGateway}${ipIpfsHash}`
      const nftMetadataURI = `${pinataGateway}${nftIpfsHash}`
      
      // Also prepare ipfs.io URLs as fallback for verification
      const ipMetadataURIIpfs = `${ipfsGateway}${ipIpfsHash}`
      const nftMetadataURIIpfs = `${ipfsGateway}${nftIpfsHash}`
      
      console.log('[registerIPAssetDirectContract] IP Metadata URI (Pinata - for contract):', ipMetadataURI)
      console.log('[registerIPAssetDirectContract] NFT Metadata URI (Pinata - for contract):', nftMetadataURI)
      console.log('[registerIPAssetDirectContract] IP Metadata URI (ipfs.io - fallback):', ipMetadataURIIpfs)
      console.log('[registerIPAssetDirectContract] NFT Metadata URI (ipfs.io - fallback):', nftMetadataURIIpfs)
      
      // Verify metadata accessibility and hash BEFORE contract call
      // This is critical to avoid transaction failures
      // Since we're using Pinata gateway for contract, verify from Pinata directly
      console.log('[registerIPAssetDirectContract] Verifying metadata accessibility and hash...')
      try {
        // Pinata gateway is immediately accessible (no propagation delay needed)
        // Wait a short time just to ensure upload is complete
        console.log('[registerIPAssetDirectContract] Waiting 2 seconds for Pinata upload to complete...')
        await new Promise(resolve => setTimeout(resolve, 2000))
        
        // Try to fetch and verify IP metadata from Pinata (same gateway as contract)
        console.log('[registerIPAssetDirectContract] Fetching IP metadata from Pinata gateway to verify hash...')
        let fetchedIpMetadata: any = null
        let fetchedIpMetadataString: string = ''
        
        try {
          const response = await fetch(ipMetadataURI, {
            method: 'GET',
            headers: { 'Accept': 'application/json' },
            signal: AbortSignal.timeout(15000), // 15 second timeout for Pinata
          })
          
          if (!response.ok) {
            throw new Error(`HTTP ${response.status}: ${response.statusText}`)
          }
          
          fetchedIpMetadata = await response.json()
          fetchedIpMetadataString = JSON.stringify(fetchedIpMetadata)
          console.log('[registerIPAssetDirectContract] ✅ IP metadata fetched from Pinata (contract will use this)')
        } catch (pinataError: any) {
          console.warn('[registerIPAssetDirectContract] ⚠️ Failed to fetch from Pinata, trying ipfs.io as fallback...', pinataError.message)
          
          // Try ipfs.io gateway as fallback (though it may not be accessible yet)
          try {
            const ipfsResponse = await fetch(ipMetadataURIIpfs, {
              method: 'GET',
              headers: { 'Accept': 'application/json' },
              signal: AbortSignal.timeout(10000),
            })
            
            if (!ipfsResponse.ok) {
              throw new Error(`ipfs.io gateway also failed: HTTP ${ipfsResponse.status}`)
            }
            
            fetchedIpMetadata = await ipfsResponse.json()
            fetchedIpMetadataString = JSON.stringify(fetchedIpMetadata)
            console.log('[registerIPAssetDirectContract] ✅ IP metadata fetched from ipfs.io (fallback)')
            console.warn('[registerIPAssetDirectContract] ⚠️ Using ipfs.io as fallback, but contract will use Pinata. This should still work.')
          } catch (ipfsError: any) {
            throw new Error(`Both Pinata and ipfs.io gateways failed. Pinata: ${pinataError.message}, ipfs.io: ${ipfsError.message}. Metadata may not be accessible yet.`)
          }
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
        
        // Verify NFT metadata (similar process - using Pinata gateway)
        console.log('[registerIPAssetDirectContract] Fetching NFT metadata from Pinata gateway to verify hash...')
        let fetchedNftMetadata: any = null
        let fetchedNftMetadataString: string = ''
        
        try {
          const response = await fetch(nftMetadataURI, {
            method: 'GET',
            headers: { 'Accept': 'application/json' },
            signal: AbortSignal.timeout(15000), // 15 second timeout for Pinata
          })
          
          if (!response.ok) {
            throw new Error(`HTTP ${response.status}: ${response.statusText}`)
          }
          
          fetchedNftMetadata = await response.json()
          fetchedNftMetadataString = JSON.stringify(fetchedNftMetadata)
          console.log('[registerIPAssetDirectContract] ✅ NFT metadata fetched from Pinata (contract will use this)')
        } catch (pinataError: any) {
          console.warn('[registerIPAssetDirectContract] ⚠️ Failed to fetch from Pinata, trying ipfs.io as fallback...', pinataError.message)
          
          // Try ipfs.io gateway as fallback
          try {
            const ipfsResponse = await fetch(nftMetadataURIIpfs, {
              method: 'GET',
              headers: { 'Accept': 'application/json' },
              signal: AbortSignal.timeout(10000),
            })
            
            if (!ipfsResponse.ok) {
              throw new Error(`ipfs.io gateway also failed: HTTP ${ipfsResponse.status}`)
            }
            
            fetchedNftMetadata = await ipfsResponse.json()
            fetchedNftMetadataString = JSON.stringify(fetchedNftMetadata)
            console.log('[registerIPAssetDirectContract] ✅ NFT metadata fetched from ipfs.io (fallback)')
            console.warn('[registerIPAssetDirectContract] ⚠️ Using ipfs.io as fallback, but contract will use Pinata. This should still work.')
          } catch (ipfsError: any) {
            throw new Error(`Both Pinata and ipfs.io gateways failed. Pinata: ${pinataError.message}, ipfs.io: ${ipfsError.message}. Metadata may not be accessible yet.`)
          }
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
      
      // Step 6: Final verification - ensure metadata is accessible from contract's perspective
      // Contract will fetch metadata during execution, so we need to ensure it's accessible
      console.log('[registerIPAssetDirectContract] Performing final metadata accessibility check...')
      try {
        // Test both gateways to ensure at least one is accessible
        const testGateways = [
          ipMetadataURI, // Pinata (primary)
          ipMetadataURI.replace('gateway.pinata.cloud', 'ipfs.io'), // IPFS.io (fallback)
        ]
        
        let accessibleGateway = null
        for (const gateway of testGateways) {
          try {
            const testResponse = await fetch(gateway, {
              method: 'HEAD', // Just check if accessible, don't download
              signal: AbortSignal.timeout(10000), // 10 second timeout
            })
            if (testResponse.ok) {
              accessibleGateway = gateway
              console.log(`[registerIPAssetDirectContract] ✅ Metadata accessible via: ${gateway}`)
              break
            }
          } catch (gatewayError) {
            console.warn(`[registerIPAssetDirectContract] ⚠️ Gateway not accessible: ${gateway}`, gatewayError)
          }
        }
        
        if (!accessibleGateway) {
          console.warn('[registerIPAssetDirectContract] ⚠️ WARNING: Metadata may not be accessible from contract perspective')
          console.warn('[registerIPAssetDirectContract] 💡 This might cause transaction failure. Waiting 10 seconds for IPFS propagation...')
          await new Promise(resolve => setTimeout(resolve, 10000))
        }
      } catch (finalCheckError) {
        console.warn('[registerIPAssetDirectContract] ⚠️ Final accessibility check failed:', finalCheckError)
        console.warn('[registerIPAssetDirectContract] 💡 Proceeding anyway, but transaction may fail if metadata is not accessible')
      }
      
      // Step 7: Call smart contract directly
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
        
        // Also try a direct call to see if we can get error data
        // This helps when simulation passes but actual transaction fails
        console.log('[registerIPAssetDirectContract] Performing additional call to check for execution errors...')
        try {
          const callResult = await publicClient.call({
            to: REGISTRATION_WORKFLOWS_ADDRESS,
            data: encodeFunctionData({
              abi: REGISTRATION_WORKFLOWS_ABI,
              functionName: 'mintAndRegisterIp',
              args: contractCallParams.args,
            }),
            account: params.account,
          } as any)
          console.log('[registerIPAssetDirectContract] ✅ Call simulation also passed')
        } catch (callError: any) {
          // If call fails, log the error - this might reveal why transaction fails
          console.warn('[registerIPAssetDirectContract] ⚠️ Call simulation failed (but simulateContract passed):', callError)
          if (callError.data || callError.cause?.data) {
            console.warn('[registerIPAssetDirectContract] Call error data:', callError.data || callError.cause?.data)
            // Try to decode
            try {
              const callErrorData = callError.data || callError.cause?.data
              if (callErrorData && typeof callErrorData === 'string' && callErrorData.startsWith('0x')) {
                const decoded = decodeErrorResult({
                  data: callErrorData as `0x${string}`,
                  abi: FULL_REGISTRATION_ABI,
                })
                console.error('[registerIPAssetDirectContract] ⚠️ Call error decoded:', decoded)
              }
            } catch (decodeErr) {
              console.warn('[registerIPAssetDirectContract] Could not decode call error:', decodeErr)
            }
          }
        }
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
          
          // Add gas estimation explicitly to catch gas-related issues
          console.log('[registerIPAssetDirectContract] Estimating gas...')
          try {
            const gasEstimate = await publicClient.estimateGas({
              ...contractCallParams,
              account: params.account,
            })
            console.log('[registerIPAssetDirectContract] Gas estimate:', gasEstimate.toString())
            
            // Add 20% buffer to gas estimate
            const gasWithBuffer = (gasEstimate * BigInt(120)) / BigInt(100)
            contractCallParams.gas = gasWithBuffer
            console.log('[registerIPAssetDirectContract] Gas with 20% buffer:', gasWithBuffer.toString())
          } catch (gasError: any) {
            console.warn('[registerIPAssetDirectContract] ⚠️ Gas estimation failed:', gasError)
            // Continue anyway - walletClient will estimate gas automatically
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
          
          // Try to decode contract error for better error message
          let decodedError: string | null = null
          let errorDataHex: string | null = null
          let errorSignature: string | null = null
          
          try {
            // Deep dive into error structure to find data
            // viem ContractFunctionRevertedError may have data in nested cause
            let errorData: any = null
            
            // Try multiple paths to find error data
            if (txError.data) {
              errorData = txError.data
            } else if (txError.cause?.data) {
              errorData = txError.cause.data
            } else if (txError.cause?.cause?.data) {
              errorData = txError.cause.cause.data
            } else if (txError.cause?.cause?.cause?.data) {
              errorData = txError.cause.cause.cause.data
            }
            
            // Also check for error in cause.name === 'ContractFunctionRevertedError'
            if (!errorData && txError.cause) {
              const findErrorData = (obj: any, depth = 0): any => {
                if (depth > 5) return null // Prevent infinite recursion
                if (obj?.data && typeof obj.data === 'string' && obj.data.startsWith('0x')) {
                  return obj.data
                }
                if (obj?.cause) return findErrorData(obj.cause, depth + 1)
                if (obj?.error?.data) return obj.error.data
                return null
              }
              errorData = findErrorData(txError.cause)
            }
            
            // Check if error has data that can be decoded
            if (errorData) {
              errorDataHex = errorData
              // Try to decode using ABI
              if (typeof errorDataHex === 'string' && errorDataHex.startsWith('0x')) {
                errorSignature = errorDataHex.slice(0, 10) // First 4 bytes (8 hex chars + 0x)
                console.log('[registerIPAssetDirectContract] Attempting to decode contract error...')
                console.log('[registerIPAssetDirectContract] Error data (hex):', errorDataHex)
                console.log('[registerIPAssetDirectContract] Error signature:', errorSignature)
                
                // Try to decode using viem's decodeErrorResult
                try {
                  const decoded = decodeErrorResult({
                    data: errorDataHex as `0x${string}`,
                    abi: FULL_REGISTRATION_ABI,
                  })
                  console.log('[registerIPAssetDirectContract] ✅ Decoded error:', decoded)
                  decodedError = `${decoded.errorName}${decoded.args ? ': ' + JSON.stringify(decoded.args) : ''}`
                  
                  // Handle specific decoded errors
                  if (decoded.errorName === 'MetadataHashMismatch' && decoded.args) {
                    const args = decoded.args as any
                    decodedError = `Metadata hash mismatch! Expected: ${args.expected}, Actual: ${args.actual}`
                  } else if (decoded.errorName === 'MetadataNotAccessible' && decoded.args) {
                    const args = decoded.args as any
                    decodedError = `Metadata not accessible: ${args.uri || 'unknown URI'}`
                  } else if (decoded.errorName === 'InvalidSPGContract' && decoded.args) {
                    const args = decoded.args as any
                    decodedError = `Invalid SPG NFT contract: ${args.contract || 'unknown'}`
                  }
                } catch (decodeErr: any) {
                  console.warn('[registerIPAssetDirectContract] Failed to decode with ABI:', decodeErr)
                  // Check for common error signatures
                  if (errorSignature === '0x3bdad64c') {
                    decodedError = 'TransactionFailed - Contract validation failed (likely metadata hash mismatch or IPFS accessibility issue)'
                  } else if (errorSignature === '0x08c379a0') {
                    // Standard Error(string) signature
                    try {
                      // Try to decode as Error(string)
                      const errorString = Buffer.from(errorDataHex.slice(10), 'hex').toString('utf-8').replace(/\0/g, '')
                      if (errorString.length > 0) {
                        decodedError = `Contract error: ${errorString}`
                      }
                    } catch (e) {
                      decodedError = `Contract error (signature: ${errorSignature})`
                    }
                  } else {
                    decodedError = `Contract error (signature: ${errorSignature})`
                  }
                }
              }
            }
            
            // Check error shortMessage or reason for more details
            if (!decodedError) {
              if (txError.shortMessage) {
                decodedError = txError.shortMessage
              } else if (txError.reason) {
                decodedError = txError.reason
              } else if (txError.cause?.reason) {
                decodedError = txError.cause.reason
              } else if (txError.message) {
                decodedError = txError.message
              }
            }
            
            // Log full error for debugging - including deep structure
            console.error('[registerIPAssetDirectContract] Full error object:', {
              message: txError.message,
              shortMessage: txError.shortMessage,
              reason: txError.reason,
              cause: txError.cause,
              data: errorDataHex,
              signature: errorSignature,
              decodedError,
            })
            
            // Deep log the entire error structure to find hidden data
            try {
              const errorKeys = Object.keys(txError)
              console.error('[registerIPAssetDirectContract] Error keys:', errorKeys)
              console.error('[registerIPAssetDirectContract] Error cause type:', txError.cause?.constructor?.name)
              console.error('[registerIPAssetDirectContract] Error cause keys:', txError.cause ? Object.keys(txError.cause) : 'none')
              
              // Try to extract all possible error data locations
              const allErrorData: any[] = []
              if (txError.data) allErrorData.push({ source: 'txError.data', data: txError.data })
              if (txError.cause?.data) allErrorData.push({ source: 'txError.cause.data', data: txError.cause.data })
              if (txError.cause?.cause?.data) allErrorData.push({ source: 'txError.cause.cause.data', data: txError.cause.cause.data })
              if ((txError.cause as any)?.error?.data) allErrorData.push({ source: 'txError.cause.error.data', data: (txError.cause as any).error.data })
              
              console.error('[registerIPAssetDirectContract] All error data found:', allErrorData)
              
              // Try to stringify safely
              try {
                const safeError = {
                  name: txError.name,
                  message: txError.message,
                  shortMessage: txError.shortMessage,
                  reason: txError.reason,
                  code: (txError as any).code,
                  data: txError.data,
                  cause: txError.cause ? {
                    name: txError.cause.name,
                    message: txError.cause.message,
                    data: (txError.cause as any).data,
                    reason: (txError.cause as any).reason,
                  } : null,
                }
                console.error('[registerIPAssetDirectContract] Safe error structure:', JSON.stringify(safeError, null, 2))
              } catch (stringifyErr) {
                console.warn('[registerIPAssetDirectContract] Could not stringify error:', stringifyErr)
              }
            } catch (logErr) {
              console.warn('[registerIPAssetDirectContract] Error logging failed:', logErr)
            }
            
            // Try to extract error from cause recursively
            const extractErrorInfo = (obj: any, depth = 0): any => {
              if (depth > 10) return null
              if (!obj) return null
              
              const info: any = {}
              if (obj.data) info.data = obj.data
              if (obj.message) info.message = obj.message
              if (obj.shortMessage) info.shortMessage = obj.shortMessage
              if (obj.reason) info.reason = obj.reason
              if (obj.name) info.name = obj.name
              if (obj.code) info.code = obj.code
              
              if (obj.cause) {
                const causeInfo = extractErrorInfo(obj.cause, depth + 1)
                if (causeInfo) info.cause = causeInfo
              }
              
              return Object.keys(info).length > 0 ? info : null
            }
            
            const deepErrorInfo = extractErrorInfo(txError)
            if (deepErrorInfo) {
              console.error('[registerIPAssetDirectContract] Extracted error info:', deepErrorInfo)
              // If we found data in deep structure, try to use it
              if (deepErrorInfo.data && !errorDataHex) {
                errorDataHex = deepErrorInfo.data
                if (typeof errorDataHex === 'string' && errorDataHex.startsWith('0x')) {
                  errorSignature = errorDataHex.slice(0, 10)
                  console.log('[registerIPAssetDirectContract] ✅ Found error data in deep structure:', errorDataHex)
                }
              }
            }
          } catch (decodeError) {
            console.warn('[registerIPAssetDirectContract] Failed to decode error:', decodeError)
            decodedError = txError.message || 'Unknown error'
          }
          
          // Check for specific error types
          const errorMessage = (decodedError || txError.message || '').toLowerCase()
          
          // Duplicate registration error - check multiple patterns
          const isDuplicate = errorMessage.includes('duplicate') || 
              errorMessage.includes('already registered') ||
              errorMessage.includes('metadata hash already exists') ||
              errorMessage.includes('hash already registered')
          
          if (isDuplicate) {
            console.warn('[registerIPAssetDirectContract] ⚠️ Duplicate registration detected')
            console.warn('[registerIPAssetDirectContract] 💡 This metadata hash has already been registered')
            throw new Error('This IP Asset metadata has already been registered. Each registration must have unique metadata. Please generate a new image with a different prompt or modify the metadata.')
          }
          
          // IPFS accessibility error
          const isIpfsError = errorMessage.includes('ipfs') || 
              errorMessage.includes('metadata not accessible') ||
              errorMessage.includes('failed to fetch')
          
          if (isIpfsError && attempt < MAX_TRANSACTION_RETRIES) {
            console.warn('[registerIPAssetDirectContract] ⚠️ IPFS accessibility issue detected')
            console.warn('[registerIPAssetDirectContract] 💡 Waiting longer for IPFS propagation...')
            // Wait longer for IPFS propagation
            await new Promise(resolve => setTimeout(resolve, 10000 * attempt)) // Progressive delay
          }
          
          if (attempt === MAX_TRANSACTION_RETRIES) {
            console.error(`[registerIPAssetDirectContract] ❌ Transaction failed after ${MAX_TRANSACTION_RETRIES} attempts`)
            console.error(`[registerIPAssetDirectContract] Last error signature: ${errorSignature || 'unknown'}`)
            console.error(`[registerIPAssetDirectContract] Last error data: ${errorDataHex || 'none'}`)
            console.error(`[registerIPAssetDirectContract] Decoded error: ${decodedError || 'none'}`)
            
            // Provide more helpful error message based on decoded error
            let finalErrorMsg = decodedError || txError.message || 'Transaction failed'
            
            // If we have a decoded error, use it
            if (decodedError && !decodedError.includes('Transaction failed') && !decodedError.includes('reverted')) {
              finalErrorMsg = `Contract error: ${decodedError}`
            } else {
              // Generic error message with troubleshooting
              finalErrorMsg = `Transaction failed after ${MAX_TRANSACTION_RETRIES} attempts. This may be because:\n\n` +
                `1. **Metadata hash mismatch**: Contract calculated different hash than expected\n` +
                `   - Expected hash: ${ipHash}\n` +
                `   - Check metadata format matches exactly\n\n` +
                `2. **IPFS metadata not accessible**: Contract cannot fetch metadata during execution\n` +
                `   - IP Metadata URI: ${ipMetadataURI}\n` +
                `   - NFT Metadata URI: ${nftMetadataURI}\n` +
                `   - Try accessing these URLs manually to verify accessibility\n\n` +
                `3. **Duplicate metadata hash**: Same hash already registered (even with allowDuplicates=true)\n` +
                `   - Registration ID: ${ipMetadata.registrationId}\n` +
                `   - Try generating a new image with different prompt\n\n` +
                `4. **Contract validation failed**: Invalid parameters or contract state\n` +
                `   - SPG NFT Contract: ${PUBLIC_SPG_NFT_CONTRACT}\n` +
                `   - Recipient: ${formattedRecipient}\n` +
                `   - Error signature: ${errorSignature || 'unknown'}\n\n` +
                `5. **Network/RPC issues**: Temporary network problems\n\n` +
                `💡 TROUBLESHOOTING:\n` +
                `- Wait 60-120 seconds and try again (IPFS propagation can take time)\n` +
                `- Generate a completely new image with a different prompt\n` +
                `- Verify metadata is accessible: ${ipMetadataURI}\n` +
                `- Check wallet balance (need IP tokens for gas)\n` +
                `- Try using Tenderly RPC for better error debugging`
            }
            
            throw new Error(finalErrorMsg)
          }
          
          console.warn(`[registerIPAssetDirectContract] ⚠️ Transaction attempt ${attempt} failed:`, decodedError || txError.message)
          if (decodedError && decodedError !== txError.message) {
            console.warn(`[registerIPAssetDirectContract] Decoded error: ${decodedError}`)
          }
          console.warn(`[registerIPAssetDirectContract] 💡 Retrying... (${attempt + 1}/${MAX_TRANSACTION_RETRIES})`)
          
          // Progressive delay between retries (longer for IPFS issues)
          const delay = isIpfsError ? 10000 * attempt : 5000 * attempt
          if (attempt < MAX_TRANSACTION_RETRIES) {
            console.log(`[registerIPAssetDirectContract] Waiting ${delay}ms before retry...`)
            await new Promise(resolve => setTimeout(resolve, delay))
          }
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
          const fromBlock = receipt.blockNumber > BigInt(1000) ? receipt.blockNumber - BigInt(1000) : BigInt(0)
          
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
              ipId = eventLog.args.ipId || null
              tokenId = eventLog.args.tokenId || null
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
      const rpcUrl = getStoryRpcUrl()
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
            const decoded = decodeEventLog({
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
      let balance = BigInt(0)
      try {
        balance = await this.publicClient.readContract({
          address: PUBLIC_SPG_NFT_CONTRACT,
          abi: ERC721_FULL_ABI,
          functionName: 'balanceOf',
          args: [ownerAddr],
        })
      } catch (error) {
        console.warn('[getIPAssetsByOwner] Failed to get balance from SPG contract:', error)
        balance = BigInt(0)
      }

      const ownedAssets: IPAsset[] = []

      // Get all token IDs owned by user
      // IMPORTANT: tokenOfOwnerByIndex is NOT available in SPG NFT contract
      // We use Transfer events instead to find tokens owned by user
      if (balance > BigInt(0)) {
        // Get total supply to know how many tokens exist
        let totalSupply = BigInt(0)
        try {
          totalSupply = await this.publicClient.readContract({
            address: PUBLIC_SPG_NFT_CONTRACT,
            abi: ERC721_FULL_ABI,
            functionName: 'totalSupply',
          })
        } catch (error) {
          console.warn('[getIPAssetsByOwner] Failed to get totalSupply, trying alternative method:', error)
          // If totalSupply fails, try querying Transfer events instead
          totalSupply = BigInt(0)
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
          fromBlock = currentBlock > BigInt(50000) ? currentBlock - BigInt(50000) : BigInt(0)
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
          for (const [tokenIdStr, owner] of Array.from(tokenOwnership.entries())) {
            if (owner.toLowerCase() === ownerAddr.toLowerCase()) {
              tokenIds.push(BigInt(tokenIdStr))
            }
          }
          
          // Verify ownership with ownerOf calls to ensure accuracy
          if (tokenIds.length > 0) {
            const verifiedTokenIds: bigint[] = []
            const verifyPromises = tokenIds.map(async (tokenId) => {
              try {
                if (!this.publicClient) return null
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
          if (totalSupply > BigInt(0)) {
            const maxTokensToCheck = totalSupply > BigInt(1000) ? BigInt(1000) : totalSupply
            console.log(`[getIPAssetsByOwner] Checking ownership for last ${maxTokensToCheck.toString()} tokens...`)
            
            const startToken = totalSupply - maxTokensToCheck + BigInt(1)
            const batchSize = 50
            for (let tokenId = startToken; tokenId <= totalSupply; tokenId += BigInt(batchSize)) {
              const endToken = tokenId + BigInt(batchSize) > totalSupply ? totalSupply : tokenId + BigInt(batchSize) - BigInt(1)
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
        const AENEID_CHAIN_ID = BigInt(1315)
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
          fromBlock = currentBlock > BigInt(20000) ? currentBlock - BigInt(20000) : BigInt(0)
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
          if (!this.publicClient) {
            throw new Error('Public client not initialized')
          }
          const ownershipChecks = await Promise.allSettled(
            batch.map(async (event) => {
              try {
                const nftOwner = await this.publicClient!.readContract({
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
        if (balance > BigInt(0)) {
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
   * Following Story Protocol SDK documentation for license management
   */
  async createLicense(
    ipId: string, 
    licenseType: 'commercial' | 'nonCommercial' | 'commercialRemix',
    account?: Account, // Optional account parameter - if provided, re-initialize client
    walletClient?: any // Optional walletClient for direct contract calls
  ): Promise<{
    licenseTermsId: bigint
    txHash?: string
    attachTxHash?: string
  }> {
    // CRITICAL: Re-initialize StoryClient with the account if provided
    // This ensures the client uses the correct account for signing transactions
    // The "unknown account" error happens when client was initialized with a different account
    if (account) {
      console.log('[createLicense] Re-initializing StoryClient with provided account...')
      console.log('[createLicense] Account:', account.address)
      
      try {
        const rpcUrl = getStoryRpcUrl()
        const config: StoryConfig = {
          account, // Use provided account
          transport: http(rpcUrl),
          chainId: STORY_CHAIN_ID,
        }
        // Create new client instance with the correct account
        this.client = StoryClient.newClient(config)
        console.log('[createLicense] ✅ StoryClient re-initialized with account:', account.address)
      } catch (initError: any) {
        console.error('[createLicense] Failed to re-initialize StoryClient:', initError)
        throw new Error(`Failed to initialize Story Protocol client with account: ${initError.message}`)
      }
    }

    if (!this.client) {
      throw new Error('Story Protocol client not initialized')
    }

    // Validate and normalize IP ID format
    // Note: Using lowercase is OK for internal use, SDK will handle checksumming if needed
    const normalizedIpId = ipId.trim().toLowerCase()
    if (!normalizedIpId.startsWith('0x') || normalizedIpId.length !== 42) {
      throw new Error(`Invalid IP Asset ID format: ${ipId}. Must be a valid Ethereum address (0x followed by 40 hex characters).`)
    }

    console.log('[createLicense] Creating license:', {
      ipId: normalizedIpId,
      licenseType,
    })

    try {
      let response
      
      // Register license terms based on type
      // Following Story Protocol PIL (Programmable IP License) templates
      switch (licenseType) {
        case 'commercial':
          // Register commercial use license
          // IMPORTANT: Commercial use PIL requires a valid ERC20 currency token address (not zero address)
          // For Aeneid testnet, we need to use a valid token address
          // Common approach: Use a wrapped native token or a testnet ERC20 token
          console.log('[createLicense] Registering commercial use license...')
          console.log('[createLicense] Note: Commercial use PIL requires valid currency token address')
          
          // For Aeneid testnet, we'll try to use a wrapped native token if available
          // If not available, we'll provide a clear error message
          // Note: You may need to deploy or use an existing ERC20 token on testnet
          try {
            // Try with zero address first (will fail, but we catch it)
            response = await this.client.license.registerCommercialUsePIL({
              defaultMintingFee: BigInt(0),
              currency: '0x0000000000000000000000000000000000000000' as `0x${string}`,
            })
          } catch (currencyError: any) {
            // Check if error is about currency token
            if (currencyError.message?.includes('currency') || 
                currencyError.message?.includes('Royalty policy') ||
                currencyError.message?.includes('requires currency token')) {
              throw new Error(
                'Commercial use license requires a valid ERC20 currency token address (not zero address). ' +
                'For free licenses without currency requirements, please use:\n' +
                '- "Non-Commercial Social Remixing" (free, no currency needed)\n\n' +
                'To use Commercial Use license, you need to provide a valid ERC20 token address on Aeneid testnet.'
              )
            }
            throw currencyError
          }
          break
        case 'nonCommercial':
          // Register non-commercial social remixing license
          console.log('[createLicense] Registering non-commercial social remixing license...')
          response = await this.client.license.registerNonComSocialRemixingPIL()
          break
        case 'commercialRemix':
          // Register commercial remix license (requires fee configuration)
          // IMPORTANT: Commercial remix PIL also requires a valid ERC20 currency token address
          console.log('[createLicense] Registering commercial remix license...')
          console.log('[createLicense] Note: Commercial remix PIL requires valid currency token address')
          
          try {
            response = await this.client.license.registerCommercialRemixPIL({
              defaultMintingFee: BigInt(0), // Set appropriate fee
              currency: '0x0000000000000000000000000000000000000000' as `0x${string}`, // Native token
              commercialRevShare: 100, // 100% revenue share
            })
          } catch (currencyError: any) {
            // Check if error is about currency token
            if (currencyError.message?.includes('currency') || 
                currencyError.message?.includes('Royalty policy') ||
                currencyError.message?.includes('requires currency token')) {
              throw new Error(
                'Commercial remix license requires a valid ERC20 currency token address (not zero address). ' +
                'For free licenses without currency requirements, please use:\n' +
                '- "Non-Commercial Social Remixing" (free, no currency needed)\n\n' +
                'To use Commercial Remix license, you need to provide a valid ERC20 token address on Aeneid testnet.'
              )
            }
            throw currencyError
          }
          break
        default:
          throw new Error(`Invalid license type: ${licenseType}`)
      }

      // Validate response
      if (!response || !response.licenseTermsId) {
        throw new Error('Failed to create license: No license terms ID returned from registration')
      }

      console.log('[createLicense] License terms registered:', {
        licenseTermsId: response.licenseTermsId.toString(),
        txHash: response.txHash,
        fullResponse: response, // Log full response to see if licenseTemplate is included
      })
      
      // Try to get license template from SDK if available
      // SDK might have a method to get license template address from license terms ID
      let licenseTemplateFromSDK: Address | null = null
      try {
        // Check if response includes licenseTemplate
        if ((response as any).licenseTemplate) {
          licenseTemplateFromSDK = (response as any).licenseTemplate as Address
          console.log('[createLicense] ✅ License template from SDK response:', licenseTemplateFromSDK)
        } else {
          console.log('[createLicense] ⚠️ License template not in SDK response, will use mapping')
        }
      } catch (error) {
        console.warn('[createLicense] Could not extract license template from response:', error)
      }

      // CRITICAL: Re-initialize client again before attach to ensure account is correct
      // The SDK may cache account state, so we need a fresh client instance
      // IMPORTANT: Use the SAME account that was used for registerLicenseTerms
      if (!account) {
        throw new Error('Account is required for attaching license terms. Please ensure wallet is connected.')
      }

      console.log('[createLicense] Re-initializing client again before attach...')
      console.log('[createLicense] Account details:', {
        address: account.address,
        type: account.type,
      })
      
      try {
        const rpcUrl = getStoryRpcUrl()
        
        // CRITICAL: Use the exact same account object that was used for registerLicenseTerms
        // Don't create a new account object - use the one passed in
        // This ensures SDK recognizes the account
        const config: StoryConfig = {
          account: account, // Use the exact same account object
          transport: http(rpcUrl),
          chainId: STORY_CHAIN_ID,
        }
        
        // Create completely new client instance with the same account
        // This ensures SDK has fresh state with the correct account
        this.client = StoryClient.newClient(config)
        console.log('[createLicense] ✅ Client re-initialized before attach with account:', account.address)
        
        // Verify client was created successfully
        if (!this.client) {
          throw new Error('Failed to create StoryClient instance')
        }
        
        // Small delay to ensure SDK internal state is ready
        // Sometimes SDK needs a moment to initialize account state
        await new Promise(resolve => setTimeout(resolve, 100))
        
      } catch (reinitError: any) {
        console.error('[createLicense] Failed to re-initialize before attach:', reinitError)
        throw new Error(`Failed to re-initialize StoryClient before attach: ${reinitError.message || 'Unknown error'}`)
      }

      // Attach license terms to IP Asset
      // CRITICAL: Use direct contract call if walletClient is provided
      // SDK's attachLicenseTerms doesn't work with wallet extension accounts (json-rpc type)
      console.log('[createLicense] Attaching license terms to IP Asset...')
      let attachResponse: { txHash: string } | undefined
      
      if (walletClient) {
        // Use direct contract call (same approach as registerIPAssetDirectContract)
        console.log('[createLicense] Using direct contract call for attachLicenseTerms (walletClient provided)')
        try {
          // IMPORTANT: Get license template address
          // For non-commercial, the template is usually the PIL template address
          // We need to use the correct template address for the license type
          let licenseTemplate: Address
          
          // Use license template from SDK response if available
          if (licenseTemplateFromSDK) {
            licenseTemplate = licenseTemplateFromSDK
            console.log('[createLicense] Using license template from SDK response:', licenseTemplate)
          } else {
            // Fallback: use mapping
            // Note: All PIL templates use the same address on Aeneid testnet
            // The difference is in the license terms ID, not the template address
            licenseTemplate = LICENSE_TEMPLATES[licenseType] || LICENSE_TEMPLATES.nonCommercial
            console.log('[createLicense] Using license template from mapping:', licenseTemplate)
            console.log('[createLicense] License type:', licenseType)
            console.log('[createLicense] License terms ID:', response.licenseTermsId.toString())
          }
          
          // ABI for attachLicenseTerms function
          const LICENSE_REGISTRY_ABI = [
            {
              name: 'attachLicenseTerms',
              type: 'function',
              stateMutability: 'nonpayable',
              inputs: [
                { name: 'ipId', type: 'address' },
                { name: 'licenseTemplate', type: 'address' },
                { name: 'licenseTermsId', type: 'uint256' },
              ],
              outputs: [],
            },
            {
              name: 'hasAttachedLicenseTerms',
              type: 'function',
              stateMutability: 'view',
              inputs: [
                { name: 'ipId', type: 'address' },
                { name: 'licenseTemplate', type: 'address' },
                { name: 'licenseTermsId', type: 'uint256' },
              ],
              outputs: [{ name: '', type: 'bool' }],
            },
          ] as const
          
          // Check if license terms already attached (to avoid duplicate error)
          try {
            const alreadyAttached = await this.publicClient?.readContract({
              address: LICENSE_REGISTRY_ADDRESS,
              abi: LICENSE_REGISTRY_ABI,
              functionName: 'hasAttachedLicenseTerms',
              args: [
                normalizedIpId as `0x${string}`,
                licenseTemplate,
                response.licenseTermsId,
              ],
            })
            
            if (alreadyAttached) {
              console.log('[createLicense] ⚠️ License terms already attached to this IP Asset')
              throw new Error('License terms already attached to this IP Asset. You may need to use a different license type or check existing licenses.')
            }
          } catch (checkError: any) {
            // If check fails, continue anyway (might be a view function issue)
            console.warn('[createLicense] Could not check if license already attached:', checkError.message)
          }
          
          // Simulate transaction first to catch errors early
          try {
            await this.publicClient?.simulateContract({
              address: LICENSE_REGISTRY_ADDRESS,
              abi: LICENSE_REGISTRY_ABI,
              functionName: 'attachLicenseTerms',
              args: [
                normalizedIpId as `0x${string}`,
                licenseTemplate,
                response.licenseTermsId,
              ],
              account: account,
            })
            console.log('[createLicense] ✅ Transaction simulation passed')
          } catch (simError: any) {
            console.error('[createLicense] Transaction simulation failed:', simError)
            let errorMsg = 'Transaction simulation failed'
            if (simError.message?.includes('already attached') || simError.message?.includes('duplicate')) {
              errorMsg = 'License terms already attached to this IP Asset. You may need to use a different license type or check existing licenses.'
            } else if (simError.message?.includes('not authorized') || simError.message?.includes('unauthorized')) {
              errorMsg = 'You are not authorized to attach license terms to this IP Asset. Please ensure you own the IP Asset.'
            } else if (simError.message?.includes('not found') || simError.message?.includes('does not exist')) {
              errorMsg = 'IP Asset or license terms not found. Please verify the IP Asset ID and license terms ID are correct.'
            } else {
              errorMsg = `Transaction simulation failed: ${simError.message || 'Unknown error'}`
            }
            throw new Error(errorMsg)
          }
          
          const attachTxHash = await walletClient.writeContract({
            address: LICENSE_REGISTRY_ADDRESS,
            abi: LICENSE_REGISTRY_ABI,
            functionName: 'attachLicenseTerms',
            args: [
              normalizedIpId as `0x${string}`,
              licenseTemplate,
              response.licenseTermsId,
            ],
          })
          
          console.log('[createLicense] ✅ Direct contract call sent. Transaction hash:', attachTxHash)
          
          // Wait for transaction confirmation
          const receipt = await this.publicClient?.waitForTransactionReceipt({ hash: attachTxHash })
          console.log('[createLicense] ✅ Transaction confirmed:', receipt?.transactionHash)
          
          attachResponse = { txHash: attachTxHash }
        } catch (directCallError: any) {
          console.error('[createLicense] Direct contract call failed:', directCallError)
          
          // Provide more specific error messages
          let errorMsg = directCallError.message || 'Unknown error'
          if (errorMsg.includes('already attached') || errorMsg.includes('duplicate')) {
            errorMsg = 'License terms already attached to this IP Asset. You may need to use a different license type or check existing licenses.'
          } else if (errorMsg.includes('not authorized') || errorMsg.includes('unauthorized')) {
            errorMsg = 'You are not authorized to attach license terms to this IP Asset. Please ensure you own the IP Asset.'
          } else if (errorMsg.includes('not found') || errorMsg.includes('does not exist')) {
            errorMsg = 'IP Asset or license terms not found. Please verify the IP Asset ID and license terms ID are correct.'
          } else if (errorMsg.includes('Transaction failed') || errorMsg.includes('revert')) {
            errorMsg = 'Transaction failed. This may be because:\n1. License terms already attached to this IP Asset\n2. You do not own this IP Asset\n3. License template address is incorrect\n\nPlease check existing licenses or try a different IP Asset.'
          }
          
          throw new Error(`Failed to attach license terms: ${errorMsg}`)
        }
      } else {
        // Fallback to SDK method (may fail with wallet extension accounts)
        try {
          const sdkResponse = await this.client.license.attachLicenseTerms({
            ipId: normalizedIpId as `0x${string}`,
            licenseTermsId: response.licenseTermsId,
          })
          attachResponse = sdkResponse.txHash ? { txHash: sdkResponse.txHash as string } : undefined
          console.log('[createLicense] License terms attached via SDK:', {
            txHash: attachResponse?.txHash,
          })
        } catch (attachError: any) {
          console.error('[createLicense] Failed to attach license terms via SDK:', attachError)
          
          // Provide specific error messages for attachment failures
          let attachErrorMessage = 'Failed to attach license terms to IP Asset'
          if (attachError.message) {
            attachErrorMessage = attachError.message
          } else if (attachError.cause?.message) {
            attachErrorMessage = attachError.cause.message
          }
          
          // Check for common attachment errors
          if (attachErrorMessage.includes('already attached') || attachErrorMessage.includes('duplicate')) {
            throw new Error('License terms already attached to this IP Asset. You may need to use a different license type or check existing licenses.')
          } else if (attachErrorMessage.includes('not authorized') || attachErrorMessage.includes('unauthorized')) {
            throw new Error('You are not authorized to attach license terms to this IP Asset. Please ensure you own the IP Asset.')
          } else if (attachErrorMessage.includes('not found') || attachErrorMessage.includes('does not exist')) {
            throw new Error('IP Asset not found. Please verify the IP Asset ID is correct.')
          } else if (attachErrorMessage.includes('unknown account') || attachErrorMessage.includes('Missing or invalid parameters')) {
            throw new Error('Account error: SDK cannot attach license terms with wallet extension accounts. Please ensure walletClient is passed to createLicense method.')
          }
          
          throw new Error(`Failed to attach license terms: ${attachErrorMessage}`)
        }
      }

      return {
        licenseTermsId: response.licenseTermsId,
        txHash: response.txHash,
        attachTxHash: attachResponse?.txHash,
      }
    } catch (error: any) {
      console.error('[createLicense] Failed to create license:', error)
      
      // Provide more specific error messages
      if (error.message) {
        throw new Error(error.message)
      }
      if (error.cause?.message) {
        throw new Error(error.cause.message)
      }
      throw new Error(`Failed to create license: ${error.toString()}`)
    }
  }
}

/**
 * Create Story Protocol service instance
 */
export function createStoryProtocolService(account: Account): StoryProtocolService {
  return new StoryProtocolService(account)
}

