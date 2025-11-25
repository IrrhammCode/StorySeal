'use client'

import { useAccount, useConnect, useDisconnect, useSwitchChain, useChainId } from 'wagmi'
import { Wallet, LogOut, ChevronDown, AlertCircle } from 'lucide-react'
import { motion, AnimatePresence } from 'framer-motion'
import { useState, useEffect } from 'react'
import { aeneidTestnet } from '@/config/wagmi'

export function ConnectWallet() {
  const { address, isConnected, chain } = useAccount()
  const { connect, connectors, isPending } = useConnect()
  const { disconnect } = useDisconnect()
  const { switchChain, isPending: isSwitching } = useSwitchChain()
  const chainId = useChainId()
  const [showMenu, setShowMenu] = useState(false)
  const [mounted, setMounted] = useState(false)
  
  // Check if connected to Aeneid Testnet
  const isAeneidTestnet = chainId === aeneidTestnet.id

  useEffect(() => {
    setMounted(true)
  }, [])

  const formatAddress = (addr: string) => {
    return `${addr.slice(0, 6)}...${addr.slice(-4)}`
  }

  // Prevent hydration mismatch by not rendering wallet state until mounted
  if (!mounted) {
    return (
      <button
        className="flex items-center space-x-2 px-4 py-2 bg-indigo dark:bg-indigo-600 text-white rounded-lg hover:bg-indigo/90 dark:hover:bg-indigo-700 transition-colors"
      >
        <Wallet className="w-4 h-4" />
        <span>Connect Wallet</span>
      </button>
    )
  }

  if (isConnected && address) {
    return (
      <div className="relative">
        <button
          onClick={() => setShowMenu(!showMenu)}
          className="flex items-center space-x-2 px-4 py-2 bg-indigo dark:bg-indigo-600 text-white rounded-lg hover:bg-indigo/90 dark:hover:bg-indigo-700 transition-colors w-full"
        >
          <Wallet className="w-4 h-4" />
          <span className="font-medium flex-1 text-left">{formatAddress(address)}</span>
          {!isAeneidTestnet && (
            <AlertCircle className="w-4 h-4 text-yellow-300" />
          )}
          <ChevronDown className="w-4 h-4" />
        </button>

        <AnimatePresence>
          {showMenu && (
            <>
              <div
                className="fixed inset-0 z-10"
                onClick={() => setShowMenu(false)}
              />
              <motion.div
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: 10 }}
                className="absolute bottom-full left-0 mb-2 w-full bg-white dark:bg-gray-800 rounded-lg shadow-lg border border-gray-200 dark:border-gray-700 z-50 overflow-hidden min-w-[280px]"
              >
                <div className="p-2">
                  <div className="px-3 py-2 text-sm text-gray-600 dark:text-gray-400 border-b border-gray-200 dark:border-gray-700">
                    {formatAddress(address)}
                  </div>
                  
                  {/* Network Status */}
                  <div className="px-3 py-2 border-b border-gray-200 dark:border-gray-700">
                    <div className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase mb-1">
                      Network
                    </div>
                    <div className="text-sm text-gray-900 dark:text-white">
                      {chain?.name || `Chain ${chainId}`}
                    </div>
                    {!isAeneidTestnet && (
                      <div className="mt-2 p-2 bg-yellow-50 dark:bg-yellow-900/20 border border-yellow-200 dark:border-yellow-800 rounded text-xs text-yellow-800 dark:text-yellow-300">
                        <div className="flex items-center space-x-1 mb-1">
                          <AlertCircle className="w-3 h-3" />
                          <span className="font-semibold">Switch to Aeneid Testnet</span>
                        </div>
                        <p className="text-yellow-700 dark:text-yellow-400">
                          StorySeal requires Aeneid Testnet for IP registration
                        </p>
                      </div>
                    )}
                    {isAeneidTestnet && (
                      <div className="mt-2 p-2 bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded text-xs">
                        <div className="text-blue-800 dark:text-blue-300 mb-1">
                          <span className="font-semibold">Need IP Tokens?</span>
                        </div>
                        <p className="text-blue-700 dark:text-blue-400 mb-2">
                          Get testnet tokens from faucet to register IP assets
                        </p>
                        <a
                          href="https://docs.story.foundation/aeneid"
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-blue-600 dark:text-blue-400 hover:underline font-medium"
                          onClick={(e) => e.stopPropagation()}
                        >
                          Get IP Tokens →
                        </a>
                      </div>
                    )}
                  </div>

                  {/* Switch Network Button */}
                  {!isAeneidTestnet && (
                    <button
                      onClick={async () => {
                        try {
                          // Try to switch chain first
                          await switchChain({ chainId: aeneidTestnet.id })
                          setShowMenu(false)
                        } catch (error: any) {
                          console.error('Failed to switch chain:', error)
                          
                          // Error 4902: Chain not added to wallet
                          // Error -32603: Network already exists but with different chain ID
                          if (error?.code === 4902 || error?.code === -32603 || error?.message?.includes('not added') || error?.message?.includes('Unrecognized chain ID')) {
                            // Try to add chain manually using window.ethereum
                            if (typeof window !== 'undefined' && (window as any).ethereum) {
                              try {
                                await (window as any).ethereum.request({
                                  method: 'wallet_addEthereumChain',
                                  params: [{
                                    chainId: `0x${aeneidTestnet.id.toString(16)}`, // Convert to hex (0x523 for 1315)
                                    chainName: 'Aeneid Testnet',
                                    nativeCurrency: {
                                      name: 'Ether',
                                      symbol: 'ETH',
                                      decimals: 18,
                                    },
                                    rpcUrls: ['https://aeneid.storyrpc.io'],
                                    blockExplorerUrls: ['https://explorer.aeneid.storyprotocol.xyz'],
                                  }],
                                })
                                // After adding, try to switch again
                                await switchChain({ chainId: aeneidTestnet.id })
                                setShowMenu(false)
                              } catch (addError: any) {
                                console.error('Failed to add chain:', addError)
                                
                                // Check if error is about existing network with wrong chain ID
                                if (addError?.code === -32603 || addError?.message?.includes('same RPC endpoint') || addError?.message?.includes('existing network')) {
                                  // User has "Aeneid Testnet" with wrong chain ID
                                  const message = `⚠️ Network Conflict Detected!\n\n` +
                                    `MetaMask already has a network named "Aeneid Testnet" but with the wrong Chain ID.\n\n` +
                                    `Please remove the incorrect network first:\n` +
                                    `1. Open MetaMask\n` +
                                    `2. Go to Settings → Networks\n` +
                                    `3. Find "Aeneid Testnet" (with wrong Chain ID)\n` +
                                    `4. Click the trash icon to remove it\n` +
                                    `5. Then try switching again\n\n` +
                                    `Required Network Details:\n` +
                                    `- Network Name: Aeneid Testnet\n` +
                                    `- RPC URL: https://aeneid.storyrpc.io\n` +
                                    `- Chain ID: 1315 (0x523) ← Must be exactly this!\n` +
                                    `- Currency Symbol: ETH\n` +
                                    `- Block Explorer: https://explorer.aeneid.storyprotocol.xyz`
                                  alert(message)
                                } else {
                                  // Other add chain errors
                                  const message = `Please add Aeneid Testnet manually to your wallet:\n\n` +
                                    `Network Name: Aeneid Testnet\n` +
                                    `RPC URL: https://aeneid.storyrpc.io\n` +
                                    `Chain ID: 1315 (0x523)\n` +
                                    `Currency Symbol: ETH\n` +
                                    `Block Explorer: https://explorer.aeneid.storyprotocol.xyz\n\n` +
                                    `Error: ${addError?.message || 'Unknown error'}`
                                  alert(message)
                                }
                              }
                            } else {
                              // No window.ethereum, show manual instructions
                              alert(`Please add Aeneid Testnet to your wallet:\n\nNetwork Name: Aeneid Testnet\nRPC URL: https://aeneid.storyrpc.io\nChain ID: 1315\nCurrency: ETH`)
                            }
                          } else {
                            // Other errors (user rejection, etc.)
                            console.error('Chain switch error:', error)
                          }
                        }
                      }}
                      disabled={isSwitching}
                      className="w-full flex items-center justify-center space-x-2 px-3 py-2 text-sm bg-indigo dark:bg-indigo-600 text-white hover:bg-indigo/90 dark:hover:bg-indigo-700 rounded transition-colors disabled:opacity-50 disabled:cursor-not-allowed mb-2"
                    >
                      {isSwitching ? (
                        <>
                          <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                          <span>Switching...</span>
                        </>
                      ) : (
                        <>
                          <AlertCircle className="w-4 h-4" />
                          <span>Switch to Aeneid Testnet</span>
                        </>
                      )}
                    </button>
                  )}

                  <button
                    onClick={() => {
                      disconnect()
                      setShowMenu(false)
                    }}
                    className="w-full flex items-center space-x-2 px-3 py-2 text-sm text-red-600 dark:text-red-400 hover:bg-gray-100 dark:hover:bg-gray-700 rounded transition-colors"
                  >
                    <LogOut className="w-4 h-4" />
                    <span>Disconnect</span>
                  </button>
                </div>
              </motion.div>
            </>
          )}
        </AnimatePresence>
      </div>
    )
  }

  return (
    <div className="relative">
      <button
        onClick={() => setShowMenu(!showMenu)}
        disabled={isPending}
        className="flex items-center space-x-2 px-4 py-2 bg-indigo dark:bg-indigo-600 text-white rounded-lg hover:bg-indigo/90 dark:hover:bg-indigo-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
      >
        <Wallet className="w-4 h-4" />
        <span className="font-medium">
          {isPending ? 'Connecting...' : 'Connect Wallet'}
        </span>
      </button>

      <AnimatePresence>
        {showMenu && (
          <>
            <div
              className="fixed inset-0 z-10"
              onClick={() => setShowMenu(false)}
            />
            <motion.div
              initial={{ opacity: 0, y: -10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              className="absolute right-0 mt-2 w-56 bg-white dark:bg-gray-800 rounded-lg shadow-lg border border-gray-200 dark:border-gray-700 z-20 overflow-hidden"
            >
              <div className="p-2">
                <div className="px-3 py-2 text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase">
                  Connect Wallet
                </div>
                {connectors.map((connector) => (
                  <button
                    key={connector.uid}
                    onClick={() => {
                      connect({ connector })
                      setShowMenu(false)
                    }}
                    disabled={isPending}
                    className="w-full flex items-center space-x-3 px-3 py-3 text-left hover:bg-gray-100 dark:hover:bg-gray-700 rounded transition-colors disabled:opacity-50"
                  >
                    <Wallet className="w-5 h-5 text-indigo dark:text-indigo-400" />
                    <div>
                      <div className="text-sm font-medium text-gray-900 dark:text-white">
                        {connector.name}
                      </div>
                      {connector.name === 'MetaMask' && (
                        <div className="text-xs text-gray-500 dark:text-gray-400">
                          Browser extension
                        </div>
                      )}
                    </div>
                  </button>
                ))}
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>
    </div>
  )
}

