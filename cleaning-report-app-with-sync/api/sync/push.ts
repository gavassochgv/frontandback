import type { VercelRequest, VercelResponse } from '@vercel/node'
import { kv } from '@vercel/kv'

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') return res.status(405).end()
  const { workspace, payload } = req.body || {}
  if (!workspace || !payload) return res.status(400).json({ error: 'missing workspace or payload' })
  try {
    await kv.set(`cleaning:${workspace}`, payload)
    return res.status(200).json({ ok: true })
  } catch (e: any) {
    console.error(e)
    return res.status(500).json({ error: e?.message || 'kv set failed' })
  }
}
