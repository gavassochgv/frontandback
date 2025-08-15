# Cleaning Report App — Deploy Notes

## E-mail via Resend (Serverless)
1. No Vercel, adicione variáveis de ambiente:
   - `RESEND_API_KEY` (obrigatório)
   - `RESEND_FROM` (opcional, ex: `noreply@seu-dominio.com`)
2. O endpoint está em `/api/send-email`.
3. O front está configurado com `CUSTOM_EMAIL_ENDPOINT="/api/send-email"`.

## Favicon
- Ícone em `public/favicon.ico` e linkado no `index.html`.

## Build
- `npm run build` roda `tsc && vite build`.

## Sync entre dispositivos (Vercel KV)
- Configure no Vercel os envs do KV (Upstash): `KV_URL`, `KV_REST_API_URL`, `KV_REST_API_TOKEN`, `KV_REST_API_READ_ONLY_TOKEN`.
- Endpoints criados: `/api/sync/pull` e `/api/sync/push`.
- O app gera um `workspaceId` (salvo no localStorage). Use o mesmo no outro dispositivo (o código já usa automaticamente o mesmo valor do navegador onde foi gerado; você pode expor na UI se quiser compartilhar).
