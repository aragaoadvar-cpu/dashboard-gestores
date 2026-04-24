# Architecture

## App Router (Next.js)
O projeto usa App Router. As rotas são organizadas no diretório `app/` e combinam componentes server e client conforme responsabilidade.

## Separação Server / Client
- Server components/arquivos de rota:
  - protegem acesso
  - validam sessão
  - fazem redirect quando necessário
- Client components:
  - renderizam interface interativa
  - controlam estado local
  - executam interações de usuário

## Páginas Principais
- `app/page.tsx`
  - entrada da home no server, com proteção e bootstrap.
- `app/HomePageClient.tsx`
  - dashboard interativo no client.
- `app/operacao/[id]/_OperacaoPageBase.tsx`
  - tela de detalhe da operação no client, com leitura filtrada por `id` e `user_id`.

## Supabase SSR
Uso separado por contexto:
- Server: client SSR para autenticação e proteção de rota.
- Client: `createClient()` para renderização e ações do usuário.

Diretriz central: nunca confiar apenas na URL; toda leitura crítica deve validar ownership do usuário.
