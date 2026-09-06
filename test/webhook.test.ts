import { createHmac } from 'node:crypto'
import { describe, expect, it } from 'vitest'
import { RESEND_EVENT_COLUMN, verifySvixSignature } from '../server/utils/webhook'

const secret = `whsec_${Buffer.from('a-very-secret-signing-key').toString('base64')}`
const id = 'msg_123'
const ts = '1700000000'
const body = '{"type":"email.opened","data":{"email_id":"re_1"}}'

function sign(s: string, mid: string, mts: string, mbody: string): string {
  const key = Buffer.from(s.replace(/^whsec_/, ''), 'base64')
  return `v1,${createHmac('sha256', key).update(`${mid}.${mts}.${mbody}`).digest('base64')}`
}

describe('verifySvixSignature', () => {
  it('accepts a correctly signed payload', () => {
    const signatureHeader = sign(secret, id, ts, body)
    expect(verifySvixSignature({ secret, id, timestamp: ts, body, signatureHeader })).toBe(true)
  })

  it('accepts when the header lists multiple signatures', () => {
    const valid = sign(secret, id, ts, body)
    expect(verifySvixSignature({ secret, id, timestamp: ts, body, signatureHeader: `v1,deadbeef ${valid}` })).toBe(true)
  })

  it('rejects a tampered body', () => {
    const signatureHeader = sign(secret, id, ts, body)
    expect(verifySvixSignature({ secret, id, timestamp: ts, body: '{"type":"email.clicked"}', signatureHeader })).toBe(false)
  })

  it('rejects a signature made with a different secret', () => {
    const signatureHeader = sign(`whsec_${Buffer.from('other-key').toString('base64')}`, id, ts, body)
    expect(verifySvixSignature({ secret, id, timestamp: ts, body, signatureHeader })).toBe(false)
  })

  it('rejects when required fields are missing', () => {
    expect(verifySvixSignature({ secret, id: '', timestamp: ts, body, signatureHeader: 'v1,x' })).toBe(false)
    expect(verifySvixSignature({ secret, id, timestamp: ts, body, signatureHeader: '' })).toBe(false)
  })
})

describe('RESEND_EVENT_COLUMN', () => {
  it('maps tracked events to their columns and ignores others', () => {
    expect(RESEND_EVENT_COLUMN['email.delivered']).toBe('delivered_at')
    expect(RESEND_EVENT_COLUMN['email.opened']).toBe('opened_at')
    expect(RESEND_EVENT_COLUMN['email.clicked']).toBe('clicked_at')
    expect(RESEND_EVENT_COLUMN['email.bounced']).toBe('bounced_at')
    expect(RESEND_EVENT_COLUMN['email.sent']).toBeUndefined()
  })
})
