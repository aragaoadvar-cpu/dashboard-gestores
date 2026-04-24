# Sistema ADSYNC3 — Guia Completo (Produto + Técnico)

> Documento vivo para onboarding, continuidade técnica e alinhamento de produto.
> Público-alvo: pessoas iniciantes e devs seniores.

---

## 1) O sistema explicado para uma criança

Imagine uma escola:

- Cada aluno tem seu caderno.
- O professor tem uma turma.
- O dono da escola vê tudo.

No ADSYNC3 é parecido:

- **Gestor**: cuida só das próprias operações.
- **Admin**: cuida das próprias operações e acompanha os gestores da equipe dele.
- **Dono**: visão geral da plataforma.

Cada operação é como uma “planilha de trabalho”:

- entra dinheiro (receita),
- sai dinheiro (custo e despesas),
- sobra lucro,
- parte do lucro vira comissão/repasse.

O sistema calcula tudo isso automaticamente e mostra em telas separadas para ficar organizado.

---

## 2) O que o sistema é hoje (visão de produto)

### Objetivo
Plataforma SaaS para gestão de operações financeiras de tráfego pago (ADS), com foco em:

- segurança multiusuário,
- precisão de cálculo,
- separação por papéis,
- crescimento para operação em rede (admin/gestores).

### Stack

- **Next.js App Router + TypeScript**
- **Supabase** (Auth + PostgreSQL + RLS)
- **TailwindCSS**

### Rotas principais

- `/login`: autenticação
- `/`: dashboard inteligente por papel
- `/operacoes`: gestão de operações
- `/operacao/[id]`: detalhe diário da operação
- `/despesas`: gestão de despesas por período
- `/gestores`: gestão da equipe (admin/dono)
- `/gestores/[id]`: detalhe gerencial do gestor
- `/convites`: central de convites (admin/dono)
- `/convite`: aceite de convite por token
- `/contabilidade`: fechamento contábil do admin

---

## 3) Papéis e permissões

## `gestor`

- Vê e altera somente o que pertence ao próprio `user_id`.
- Não gerencia equipe.
- Não acessa áreas administrativas.

## `admin`

- Possui operações próprias.
- Vê dados dos gestores vinculados em `admin_gestores`.
- Gerencia convites de gestores.
- Pode configurar taxas administrativas por gestor (visão admin).

## `dono`

- Visão global da plataforma.
- Convites de admin.
- Acesso estratégico (sem focar operação do dia a dia como admin).

---

## 4) Modelo de dados (núcleo)

### `operacoes`
Campos-chave:

- `id`, `nome`, `mes`, `ano`, `user_id`
- `cotacao_dolar`, `taxa_facebook`, `taxa_network`, `taxa_imposto`
- `repasse_percentual` (novo: repasse por operação)

### `lancamentos`

- `operacao_id`, `dia`, `facebook`, `usd`

### `despesas`

- `nome`, `valor`, `percentual_desconto`, `mes`, `ano`, `user_id`

### `profiles`

- `id` (ref `auth.users`)
- `nome`
- `role` (`dono` | `admin` | `gestor`)

### `admin_gestores`

- vínculo admin → gestor
- `status` (`ativo`/`inativo`)

### `user_invitations`

- convites por email com token hash
- status (`pending`, `accepted`, `revoked`, `expired`)
- tipo (`admin`/`gestor`)

### `admin_gestor_taxas`

- overrides administrativos por gestor:
  - cotação/taxas/repasse do admin
- não altera dados reais do gestor

---

## 5) Segurança (RLS e regras)

Este sistema foi estruturado para **não confiar no frontend**.
As regras críticas estão no banco:

- cada entidade principal usa `RLS`,
- ownership por `user_id`,
- validação de vínculo para acesso de admin a gestor,
- convites com escopo por papel,
- leitura do convidado por email autenticado.

Regra de ouro:

1. nunca consultar operação só por `id`,
2. sempre combinar com ownership/permissão (direta ou por vínculo),
3. nunca abrir policy genérica “para authenticated” sem filtro de negócio.

---

## 6) Cálculos financeiros (como o sistema pensa)

Para cada lançamento:

1. `receita = usd * cotacao_dolar`
2. `tx_facebook = facebook * taxa_facebook%`
3. `tx_network = receita * taxa_network%`
4. `tx_imposto = receita * taxa_imposto%`
5. `custo = facebook + tx_facebook + tx_network + tx_imposto`
6. `lucro = receita - custo`
7. `roi = (lucro / custo) * 100` (quando custo > 0)
8. `repasse = lucro * repasse_percentual%`

Despesas:

- `desconto_despesa = valor * percentual_desconto%`

Líquido de comissão (quando exibido):

- `comissao_liquida = comissao_bruta - soma_descontos_despesas`

---

## 7) Taxas administrativas do admin (ponto crucial)

O sistema separa dois mundos:

### Mundo real do gestor

- usa taxas reais da operação do gestor,
- é o que o gestor vê e edita.

### Mundo administrativo do admin

- pode aplicar override por gestor em `admin_gestor_taxas`,
- serve para leitura administrativa (simulação/visão de gestão),
- **não grava nada dentro da operação real do gestor**.

Fallback:

- `null` no override = usa valor real da operação,
- `0` = zera na visão admin,
- `> 0` = usa valor do override.

---

## 8) Convites (MVP atual)

Fluxos:

- `dono -> admin`
- `admin -> gestor`

Criação:

- token seguro gerado no servidor,
- banco guarda somente hash.

Aceite:

- valida token, status, revogação, expiração e email do usuário logado,
- aplica role,
- cria/reativa vínculo em `admin_gestores` para gestor.

---

## 9) Organização atual da UI

Sidebar:

- Dashboard
- Operações
- Despesas
- Contabilidade (admin)
- Gestores (admin/dono)
- Convites (admin/dono)
- Configurações (placeholder)

Diretriz aplicada:

- Home executiva,
- telas operacionais separadas por responsabilidade.

---

## 10) Contabilidade (estado atual)

Página `/contabilidade` focada no admin com:

- total consolidado (próprio + equipe),
- card individual do admin (operações próprias),
- cards por gestor com despesas detalhadas para conferência.

**Ajuste recente importante:**

- contabilidade dos gestores está 100% baseada em valores reais das operações deles (sem override admin nessa página).

---

## 11) O que já está forte no projeto

- Segurança no banco com RLS por domínio.
- Multiusuário isolado por ownership e vínculo.
- Fluxo de convite e aceite funcionando.
- Estrutura de papéis pronta para escalar.
- Cálculo financeiro central já consistente.

---

## 12) Riscos e pontos de atenção

1. Evitar regressão de filtros por `user_id`/vínculo.
2. Manter consistência entre “visão real” e “visão administrativa”.
3. Evitar duplicar funções de cálculo em múltiplos arquivos.
4. Consolidar regras de negócio críticas em helpers compartilhados.
5. Testar cenários com usuário sem nome/profile incompleto.

---

## 13) Como um dev sênior deve continuar sem quebrar nada

### Princípios

- Segurança > conveniência
- Clareza > complexidade
- Evolução incremental com validação em cada etapa

### Ordem recomendada de continuidade

1. **Camada de cálculo compartilhada**
   - extrair cálculos para módulo único (ex.: `lib/finance/*`).
2. **Testes**
   - unitários de cálculo e autorização.
   - integração para fluxos de convite e aceite.
3. **Contabilidade dual**
   - bloco “Real” e bloco “Administrativo” lado a lado (quando desejado).
4. **Responsividade completa**
   - mobile-first nas páginas com tabelas extensas.
5. **Logs/auditoria**
   - registrar ações sensíveis (promover, remover, revogar convite, etc.).

### Checklist de PR

- [ ] Respeitou RLS e escopo de papel?
- [ ] Manteve dados reais do gestor intactos?
- [ ] Não removeu filtros de ownership?
- [ ] Cálculos continuam coerentes (real vs admin)?
- [ ] UI permanece legível em mobile e desktop?

---

## 14) Glossário curto

- **Ownership**: dado pertence ao usuário dono (`user_id`).
- **Vínculo ativo**: relação válida entre admin e gestor.
- **Override administrativo**: taxa aplicada só na visão do admin.
- **Comissão bruta**: percentual sobre lucro.
- **Comissão líquida**: bruta menos descontos de despesas.

---

## 15) Resumo final em uma frase

O ADSYNC3 hoje é um SaaS multiusuário seguro, com papéis, convites, operação financeira por período, vínculo de equipe e camada administrativa avançada — mantendo separação clara entre dado real do gestor e visão gerencial do admin.

