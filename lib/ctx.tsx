'use client'
import { createContext, useContext } from 'react'
export type AppCtx = { me: any; partner: any; space: any; reload: () => void }
export const C = createContext<AppCtx>(null as any)
export const useApp = () => useContext(C)
