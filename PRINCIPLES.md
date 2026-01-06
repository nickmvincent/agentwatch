# Principles

- Transparency first: always show where data is stored and make persistence self-documenting.
- State less: agentwatch works with the jsonl files that already are produced by coding agents + log files produced while agentwatch runs. There's no database.
- Self-documenting web UX: web ux is the most fully featured UX, and it should contain as much embedded documentatin as we can reasonably fit.
- Plain text where possible: prefer human-readable formats like TOML, JSON, JSONL.
- Flexible backend: remain backend-agnostic so data can flow to multiple destinations.
- Two UI surfaces for contribution: maintain a static demo site and a full web app that share core logic.
