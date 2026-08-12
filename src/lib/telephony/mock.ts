import { randomUUID } from 'crypto'
import type { TelephonyService, CallStatus } from './types'

const callStatuses = new Map<string, CallStatus>()

export class MockTelephonyService implements TelephonyService {
  async makeCall(_params: { from: string; to: string; campaignId: string }): Promise<{ callId: string }> {
    const callId = randomUUID()
    callStatuses.set(callId, 'ringing')
    setTimeout(() => {
      if (callStatuses.get(callId) === 'ringing') {
        callStatuses.set(callId, 'connected')
      }
    }, 1500)
    return { callId }
  }

  async endCall(callId: string): Promise<void> {
    callStatuses.set(callId, 'ended')
  }

  async getCallStatus(callId: string): Promise<CallStatus> {
    return callStatuses.get(callId) ?? 'failed'
  }

  async getRecordingUrl(_callId: string): Promise<string | null> {
    return null
  }

  async registerWebhook(eventType: string, _callbackUrl: string): Promise<void> {
    if (process.env.NODE_ENV === 'development') {
      console.log(`[MockTelephony] registerWebhook no-op: ${eventType}`)
    }
  }
}
