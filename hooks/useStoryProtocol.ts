'use client'

import { useAccount } from 'wagmi'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { StoryProtocolService, createStoryProtocolService } from '@/services/story-protocol'
import { useMemo, useState, useEffect } from 'react'
import { useWalletClient } from 'wagmi'

export function useStoryService() {
  const { data: walletClient, isLoading: isWalletClientLoading } = useWalletClient()
  const { address, isConnected, connector } = useAccount()
  const [mounted, setMounted] = useState(false)
  
  // Wait for component to mount (client-side only)
  useEffect(() => {
    setMounted(true)
  }, [])
  
  const service = useMemo(() => {
    // Don't create service during SSR or before mount
    if (!mounted) {
      return null
    }
    
    // Wait for wallet client to be ready
    if (isWalletClientLoading) {
      return null
    }
    
    if (!isConnected || !address) {
      return null
    }
    
    // If walletClient is not available but wallet is connected, try to create account from address
    // This can happen if walletClient hasn't loaded yet but wallet is already connected
    let account
    
    if (walletClient?.account) {
      // Use account from wallet client if available
      account = walletClient.account
    } else if (address) {
      // Fallback: create account object from address
      // This allows service to be created even if walletClient.account is not available
      account = {
        address: address as `0x${string}`,
        type: 'json-rpc' as const,
      }
    } else {
      return null
    }
    
    try {
      const serviceInstance = createStoryProtocolService(account as any)
      
      // Verify service was created successfully
      if (!serviceInstance) {
        console.error('[StoryService] Service instance is null')
        return null
      }
      
      return serviceInstance
    } catch (error) {
      console.error('[StoryService] Failed to create Story Protocol service:', error)
      return null
    }
  }, [mounted, isConnected, address, walletClient, isWalletClientLoading, connector])

  return service
}

/**
 * Query IP Asset by ID
 */
export function useIPAsset(ipId?: string) {
  const service = useStoryService()
  
  return useQuery({
    queryKey: ['ip-asset', ipId],
    queryFn: async () => {
      if (!ipId || !service) return null
      return await service.getIPAsset(ipId)
    },
    enabled: !!ipId && !!service,
  })
}

/**
 * Register IP Asset
 */
export function useRegisterIPAsset() {
  const queryClient = useQueryClient()
  const service = useStoryService()
  const { address, isConnected } = useAccount()
  const { data: walletClient } = useWalletClient()

  return useMutation({
    mutationFn: async (data: {
      name: string
      mediaUrl?: string
      metadata?: Record<string, any>
    }) => {
      if (!isConnected || !address || !service) {
        throw new Error('Wallet not connected or Story service not available')
      }

      // Get account from wallet client
      if (!walletClient || !walletClient.account) {
        throw new Error('Account not available')
      }

      const account = walletClient.account

      return await service.registerIPAsset({
        name: data.name,
        mediaUrl: data.mediaUrl,
        metadata: data.metadata,
        account,
      })
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['ip-assets'] })
    },
  })
}

/**
 * Query IP Assets by owner
 * Merges results from blockchain with manually saved IP assets from localStorage
 */
export function useIPAssetsByOwner(ownerAddress?: string) {
  const service = useStoryService()
  
  return useQuery({
    queryKey: ['ip-assets', 'owner', ownerAddress],
    queryFn: async () => {
      if (!ownerAddress) return []
      
      // Get assets from blockchain
      const blockchainAssets = service ? await service.getIPAssetsByOwner(ownerAddress) : []
      
      // Get manually saved assets from localStorage
      const manualAssetsKey = `storyseal_manual_ip_assets_${ownerAddress}`
      let manualAssets: any[] = []
      try {
        const stored = localStorage.getItem(manualAssetsKey)
        if (stored) {
          manualAssets = JSON.parse(stored)
        }
      } catch (error) {
        console.warn('[useIPAssetsByOwner] Failed to load manual IP assets from localStorage:', error)
      }
      
      // Merge blockchain assets with manual assets
      // Use a Map to deduplicate by IP ID (blockchain assets take priority)
      const assetMap = new Map<string, any>()
      
      // First, add blockchain assets
      for (const asset of blockchainAssets) {
        assetMap.set(asset.id.toLowerCase(), asset)
      }
      
      // Then, add manual assets that don't exist in blockchain
      for (const asset of manualAssets) {
        const ipId = asset.id?.toLowerCase()
        if (ipId && !assetMap.has(ipId)) {
          assetMap.set(ipId, asset)
        }
      }
      
      // Convert map back to array
      const mergedAssets = Array.from(assetMap.values())
      
      console.log(`[useIPAssetsByOwner] Merged ${blockchainAssets.length} blockchain assets + ${manualAssets.length} manual assets = ${mergedAssets.length} total assets`)
      
      return mergedAssets
    },
    enabled: !!ownerAddress,
    refetchOnWindowFocus: true,
    refetchOnMount: true,
    staleTime: 0, // Always consider data stale to allow refetch
    gcTime: 5 * 60 * 1000, // Keep in cache for 5 minutes
  })
}

/**
 * Verify IP Asset ownership
 */
export function useVerifyIPAsset() {
  const service = useStoryService()
  
  return useMutation({
    mutationFn: async (data: {
      ipId: string
      expectedOwner?: string
    }) => {
      if (!service) {
        throw new Error('Story Protocol service not available')
      }
      return await service.verifyIPAsset(data.ipId, data.expectedOwner)
    },
  })
}

/**
 * Fund wallet using Tenderly's tenderly_setBalance
 */
export function useFundWallet() {
  const service = useStoryService()
  
  return useMutation({
    mutationFn: async (amount?: string) => {
      if (!service) {
        throw new Error('Story Protocol service not available')
      }
      return await service.fundWallet(amount)
    },
  })
}

