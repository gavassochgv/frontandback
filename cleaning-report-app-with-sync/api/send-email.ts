import type { VercelRequest, VercelResponse } from '@vercel/node'
import { Resend } from 'resend'

const resend = new Resend(process.env.RESEND_API_KEY as string)

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') return res.status(405).end()
  try {
    const { to, subject, body, filename, base64 } = req.body || {}
    if (!to || !subject || !base64) return res.status(400).json({ error: 'Missing fields: to, subject, base64' })

    const { data, error } = await resend.emails.send({
      from: process.env.RESEND_FROM || 'noreply@example.com',
      to,
      subject,
      html: body || '',
      attachments: [{ filename: filename || 'attachment.pdf', content: base64, encoding: 'base64' }],
    })
    if (error) return res.status(500).json({ error })
    return res.status(200).json({ ok: true, id: data?.id })
  } catch (e: any) {
    console.error(e)
    return res.status(500).json({ error: e?.message || 'Unknown error' })
  }
}
