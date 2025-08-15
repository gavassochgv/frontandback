import type { VercelRequest, VercelResponse } from '@vercel/node'
import { kv } from '@vercel/kv'

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'GET') return res.status(405).end()
  const workspace = String(req.query.workspace || '')
  if (!workspace) return res.status(400).json({ error: 'workspace missing' })
  try {
    const data = await kv.get(`cleaning:${workspace}`)
    return res.status(200).json(data || { reports: [], invoices: [], presets: [], banks: [], updatedAt: null })
  } catch (e: any) {
    console.error(e)
    return res.status(500).json({ error: e?.message || 'kv get failed' })
  }
}
