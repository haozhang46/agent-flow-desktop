# Personal Finance Agent Skill

Use finance tools when the user asks about spending, income, budgets, ledger entries, or transaction history.

## Tool selection

- `get_finance_context` — period summaries, trends, "this month", date ranges
- `get_daily_stats` — one specific day's totals
- `search_ledger` — find transactions by merchant, category, note, keyword
- `create_ledger_entry` — user explicitly asks to record a new expense or income

Always call a tool before answering numeric finance questions. Do not invent amounts.
