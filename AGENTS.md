<!-- BEGIN:nextjs-agent-rules -->
# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` before writing any code. Heed deprecation notices.
<!-- END:nextjs-agent-rules -->

# Dashboard de Operações (ADS) — Agent Guide

## Regras Obrigatórias
- Nunca remover filtro por `user_id` em consultas de dados do usuário.
- Nunca buscar operação apenas por `id`; sempre combinar com `user_id`.
- Sempre usar `createClient()` do Supabase apropriado ao contexto (client/server).
- Não usar o client antigo de Supabase (`lib/supabase.ts`) em código novo.
- Não alterar cálculos financeiros existentes sem instrução explícita.
- Não mudar layout/UX sem instrução explícita.

## Estrutura do Projeto
- `/` (home): dashboard consolidado por usuário.
- `/operacao/[id]`: detalhe da operação com lançamentos diários e métricas.
- `/login`: autenticação com Supabase Auth.

## Fluxo de Execução
- Server protege acesso e resolve autenticação/redirect.
- Client renderiza interface interativa e estado local.
- Queries devem respeitar isolamento por usuário em toda leitura/escrita.

## Workflow Padrão do Agente
1. Ler contexto (`docs/*.md`) e regras deste arquivo.
2. Propor plano curto e validar escopo/impacto.
3. Implementar mudanças mínimas necessárias.
4. Resumir mudanças e riscos/testes executados.

## Do
- Validar ownership (`user_id`) em toda query crítica.
- Preferir mensagens de erro amigáveis para o usuário final.
- Preservar App Router e separação Server/Client.
- Manter mudanças pequenas, seguras e rastreáveis.

## Don't
- Não acessar dados de operação sem filtro de usuário.
- Não introduzir dependências desnecessárias.
- Não refatorar áreas não solicitadas.
- Não trocar contratos de dados sem alinhamento.
