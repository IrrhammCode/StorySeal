'use client'

import { createContext, useContext, useState, useCallback } from 'react'
import { Toast, ToastType } from '@/components/Toast'
import { ToastContainer } from '@/components/Toast'

interface ToastContextType {
  showToast: (type: ToastType, message: string, duration?: number) => void
  toasts: Toast[]
}

const ToastContext = createContext<ToastContextType>({
  showToast: () => {},
  toasts: [],
})

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([])

  const showToast = useCallback((type: ToastType, message: string, duration?: number) => {
    // Use more unique ID to prevent duplicate keys
    const id = `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`
    const newToast: Toast = { id, type, message, duration }
    setToasts(prev => [...prev, newToast])
  }, [])

  const removeToast = useCallback((id: string) => {
    setToasts(prev => prev.filter(toast => toast.id !== id))
  }, [])

  return (
    <ToastContext.Provider value={{ showToast, toasts }}>
      {children}
      <ToastContainer toasts={toasts} onClose={removeToast} />
    </ToastContext.Provider>
  )
}

export function useToast() {
  return useContext(ToastContext)
}

