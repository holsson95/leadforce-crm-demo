import type { TelephonyService } from './types'
import { MockTelephonyService } from './mock'

export function getTelephonyService(): TelephonyService {
  if (process.env.TELEPHONY_PROVIDER === 'justcall') {
    throw new Error(
      'JustCall not yet configured — implement src/lib/telephony/justcall.ts and set JUSTCALL_API_KEY'
    )
  }
  return new MockTelephonyService()
}

export type { TelephonyService, CallStatus } from './types'
