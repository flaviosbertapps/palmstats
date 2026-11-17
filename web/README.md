# PalmStats — site

Next.js 15 (App Router). As consultas SQL rodam só no servidor (`lib/db.ts`), e as páginas ficam em cache por 1 hora.

```bash
npm install
DATABASE_URL=postgresql://... npm run dev
```

Páginas, curiosidades e o passo a passo de publicação na Vercel: [`docs/produto.md`](../docs/produto.md).
