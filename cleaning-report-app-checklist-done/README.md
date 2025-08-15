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
