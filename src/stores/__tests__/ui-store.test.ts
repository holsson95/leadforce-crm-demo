// src/stores/__tests__/ui-store.test.ts
import { describe, it, expect, beforeEach } from 'vitest'
import { useUIStore } from '../ui-store'

describe('useUIStore', () => {
  beforeEach(() => {
    useUIStore.setState({
      sidebarCollapsed: false,
      activeDrawer: null,
      drawerPayload: null,
    })
  })

  it('starts with sidebar expanded', () => {
    expect(useUIStore.getState().sidebarCollapsed).toBe(false)
  })

  it('toggles sidebar collapsed state', () => {
    useUIStore.getState().toggleSidebar()
    expect(useUIStore.getState().sidebarCollapsed).toBe(true)
    useUIStore.getState().toggleSidebar()
    expect(useUIStore.getState().sidebarCollapsed).toBe(false)
  })

  it('opens a drawer with id and payload', () => {
    useUIStore.getState().openDrawer('create-client', { clientId: '123' })
    expect(useUIStore.getState().activeDrawer).toBe('create-client')
    expect(useUIStore.getState().drawerPayload).toEqual({ clientId: '123' })
  })

  it('opens a drawer without payload', () => {
    useUIStore.getState().openDrawer('create-campaign')
    expect(useUIStore.getState().activeDrawer).toBe('create-campaign')
    expect(useUIStore.getState().drawerPayload).toBeNull()
  })

  it('closes the active drawer and clears payload', () => {
    useUIStore.getState().openDrawer('create-client', { id: 'x' })
    useUIStore.getState().closeDrawer()
    expect(useUIStore.getState().activeDrawer).toBeNull()
    expect(useUIStore.getState().drawerPayload).toBeNull()
  })
})
