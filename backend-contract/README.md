# Contrato do front NutriAI

Tudo o que o backend precisa para implementar as rotas que o front ([nutriai-front](https://github.com/fabioviniciusfs1/nutriai-front),
branch `feature/api-integration`) chama. Copie esta pasta inteira para o repositório do backend
(ex.: `docs/frontend-contract/`).

| Arquivo | O que é |
| --- | --- |
| [`api.md`](api.md) | Todas as rotas: corpo, resposta de exemplo, erros, autenticação, login/conexão com Google e as regras de negócio que o backend implementa. **Comece por aqui.** |
| [`contract.ts`](contract.ts) | Tipos TypeScript exatos de cada corpo e resposta, num arquivo só, sem dependências. Se algo divergir de `api.md`, os tipos valem. |
| [`reference/`](reference/) | Código antigo do front, de quando as regras rodavam no navegador: a referência exata do comportamento esperado. Só para leitura (os imports não resolvem fora do front). |

## Sobre `reference/`

- `mock-data.ts` serve de semente para o banco (plano base, catálogo de alimentos, sugestões de refeição,
  nutrientes, histórico, chat). Diferenças para o contrato atual: os nutrientes não têm `id` (crie ids estáveis,
  ex.: `"vitamina-c"`) e os dados de histórico eram gerados, não reais.
- `auth.ts` era uma autenticação **simulada** no `localStorage` (não segura): use só para ver quais dados eram
  guardados por usuário (`planChanges`, `dayPlan`, trocas de alimentos, restrições, horários, pesos).
- `MealPlan.tsx` é a parte mais importante: `buildPlan`, `fitFactor`, `planNewMeal`, `planFood`,
  `removeExtraFood`, `planRedistribution` e `confirmRemoval` são as regras do plano do dia.

## Para um agente de IA no backend

Se usar o Claude Code (ou outro agente) no backend, acrescente ao `CLAUDE.md` / `AGENTS.md` de lá:

```markdown
## Contrato com o front

As rotas que o front NutriAI chama estão em `docs/frontend-contract/`:
- `api.md` — rotas, exemplos e regras de negócio. Leia a seção da rota antes de criá-la ou alterá-la.
- `contract.ts` — tipos exatos de corpo e resposta (valem sobre o `api.md` se divergirem).
- `reference/` — código antigo do front com o comportamento esperado das regras (só leitura).
Todas as contas (metas, plano do dia, porções, trocas, estatísticas) são responsabilidade do backend.
Mensagens de erro vão em pt-BR em `{ "error": "..." }` e são mostradas ao usuário como estão.
```

## Mantendo em dia

Esta pasta é uma cópia. No front, a fonte é `docs/api.md` e `src/lib/api/types.ts`; quando o contrato mudar
lá, copie de novo.
