export type CallStatus = 'ringing' | 'connected' | 'ended' | 'failed'

export interface TelephonyService {
  makeCall(params: { from: string; to: string; campaignId: string }): Promise<{ callId: string }>
  endCall(callId: string): Promise<void>
  getCallStatus(callId: string): Promise<CallStatus>
  getRecordingUrl(callId: string): Promise<string | null>
  registerWebhook(eventType: string, callbackUrl: string): Promise<void>
}
