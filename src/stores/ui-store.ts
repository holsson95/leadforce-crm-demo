// src/stores/ui-store.ts
import { create } from 'zustand'

interface UIState {
  sidebarCollapsed: boolean
  toggleSidebar: () => void
  activeDrawer: string | null
  drawerPayload: unknown
  openDrawer: (id: string, payload?: unknown) => void
  closeDrawer: () => void
}

export const useUIStore = create<UIState>((set) => ({
  sidebarCollapsed: false,
  toggleSidebar: () => set((s) => ({ sidebarCollapsed: !s.sidebarCollapsed })),
  activeDrawer: null,
  drawerPayload: null,
  openDrawer: (id, payload = null) => set({ activeDrawer: id, drawerPayload: payload }),
  closeDrawer: () => set({ activeDrawer: null, drawerPayload: null }),
}))
