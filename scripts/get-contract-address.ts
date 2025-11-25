/**
 * Script to get IPAssetRegistry contract address from Story Protocol
 * 
 * Usage:
 *   npx tsx scripts/get-contract-address.ts
 * 
 * Or in browser console:
 *   Copy-paste this code and run
 */

import { StoryClient, StoryConfig } from '@story-protocol/core-sdk'
import { http, createPublicClient, parseAbiItem } from 'viem'
import { privateKeyToAccount } from 'viem/accounts'

// Aeneid Testnet config
const RPC_URL = process.env.NEXT_PUBLIC_STORY_RPC_URL || 'https://aeneid.storyrpc.io'
const CHAIN_ID = 1315

// Temporary account (just for querying, not for transactions)
const TEMP_PRIVATE_KEY = '0x0000000000000000000000000000000000000000000000000000000000000001' // Dummy key

async function getIPAssetRegistryAddress() {
  try {
    console.log('🔍 Getting IPAssetRegistry contract address...\n')
    
    // Create temporary account
    const account = privateKeyToAccount(TEMP_PRIVATE_KEY as `0x${string}`)
    
    // Initialize Story Protocol client
    const config: StoryConfig = {
      account,
      transport: http(RPC_URL),
      chainId: CHAIN_ID,
    }
    
    const client = StoryClient.newClient(config)
    console.log('✅ Story Protocol client initialized\n')
    
    // Try to get contract address from SDK
    const clientAny = client as any
    
    console.log('📋 Checking SDK for contract address...\n')
    
    // Method 1: Check ipAsset.address
    if (clientAny.ipAsset?.address) {
      console.log('✅ Found in client.ipAsset.address:')
      console.log(`   ${clientAny.ipAsset.address}\n`)
      return clientAny.ipAsset.address
    }
    
    // Method 2: Check config.ipAssetRegistry
    if (clientAny.config?.ipAssetRegistry) {
      console.log('✅ Found in client.config.ipAssetRegistry:')
      console.log(`   ${clientAny.config.ipAssetRegistry}\n`)
      return clientAny.config.ipAssetRegistry
    }
    
    // Method 3: Check address property
    if (clientAny.address) {
      console.log('✅ Found in client.address:')
      console.log(`   ${clientAny.address}\n`)
      return clientAny.address
    }
    
    // Method 4: Check all properties
    console.log('🔍 SDK structure:')
    console.log(JSON.stringify(Object.keys(clientAny), null, 2))
    console.log('\n')
    
    // Method 5: Query from recent IPRegistered events
    console.log('🔍 Querying blockchain for IPRegistered events...\n')
    const publicClient = createPublicClient({
      transport: http(RPC_URL),
    })
    
    const IP_REGISTERED_EVENT = parseAbiItem(
      'event IPRegistered(address indexed caller, address indexed ipId, address indexed ipAssetRegistry, uint256 tokenId, string ipMetadataURI)'
    )
    
    // Get recent events (last 1000 blocks)
    const latestBlock = await publicClient.getBlockNumber()
    const fromBlock = latestBlock - 1000n > 0n ? latestBlock - 1000n : 0n
    
    console.log(`   Scanning blocks ${fromBlock} to ${latestBlock}...\n`)
    
    const logs = await publicClient.getLogs({
      event: IP_REGISTERED_EVENT,
      fromBlock,
      toBlock: latestBlock,
    })
    
    if (logs.length > 0) {
      // Get unique registry addresses from events
      const registryAddresses = [...new Set(logs.map(log => log.address))]
      console.log('✅ Found IPAssetRegistry addresses from events:')
      registryAddresses.forEach((addr, i) => {
        console.log(`   ${i + 1}. ${addr}`)
      })
      console.log('\n')
      return registryAddresses[0] // Return first one
    }
    
    console.log('❌ Could not find contract address automatically\n')
    console.log('📝 Manual steps:')
    console.log('   1. Check Story Protocol docs: https://docs.story.foundation')
    console.log('   2. Check explorer: https://explorer.aeneid.storyprotocol.xyz')
    console.log('   3. Contact Story Protocol team\n')
    
    return null
  } catch (error) {
    console.error('❌ Error:', error)
    return null
  }
}

// Run if called directly
if (require.main === module) {
  getIPAssetRegistryAddress()
    .then((address) => {
      if (address) {
        console.log('🎯 Contract Address to use in Goldsky:')
        console.log(`   ${address}\n`)
        console.log('📝 Update goldsky-pipeline.yaml:')
        console.log(`   address: "${address}"\n`)
      }
      process.exit(0)
    })
    .catch((error) => {
      console.error('Fatal error:', error)
      process.exit(1)
    })
}

export { getIPAssetRegistryAddress }

