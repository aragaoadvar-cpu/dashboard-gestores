# DB Rules

## Regras de Segurança
- Sempre aplicar filtro por `user_id` em entidades pertencentes ao usuário.
- Nunca acessar operação apenas por `id`.
- Em consultas de detalhe de operação, usar no mínimo:
  - `id = operacaoId`
  - `user_id = user.id`

## Tabelas

### `operacoes`
- Representa a operação principal do usuário.
- Campos relevantes: `id`, `nome`, `mes`, `ano`, `user_id`, taxas e cotação.
- Regra: toda consulta sensível deve validar ownership por `user_id`.

### `lancamentos`
- Registros diários vinculados a uma operação.
- Campos relevantes: `id`, `operacao_id`, `dia`, `facebook`, `usd`.
- Regra: só acessar lançamentos de operações autorizadas para o usuário.

### `despesas`
- Despesas mensais por usuário.
- Campos relevantes: `id`, `nome`, `valor`, `percentual_desconto`, `mes`, `ano`, `user_id`.
- Regra: sempre filtrar por `user_id`.

## Diretriz de Evolução
Implementar RLS no Supabase para reforçar as regras de ownership também no banco, não apenas na aplicação.
