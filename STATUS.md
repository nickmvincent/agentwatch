# Todo

## Proposal: Split Agentwatch into Watcher + Analyzer

### Current State
Single monolithic daemon serving both real-time monitoring and historical analysis through one web UI. Heavy transcript processing (search, aggregation, annotation workflows) can degrade the dashboard experience.

### Proposed Architecture

**Component 1: Watcher Daemon**
- Always-on background service
- Responsibilities:
  - Process scanning (detect running Claude sessions)
  - Hook capture (session lifecycle, tool usage)
  - Managed session orchestration
  - Minimal status dashboard ("what's running now")
- Characteristics:
  - Low memory footprint
  - No heavy computation
  - Designed to run 24/7 unattended
  - Writes data to `~/.agentwatch/`

**Component 2: Analyzer**
- On-demand tool, launched when needed
- Responsibilities:
  - Multi-transcript search and filtering
  - Annotation and quality scoring workflows
  - Share/export preparation
  - Historical analytics and aggregation
  - Project-level insights across time
- Characteristics:
  - Can be resource-intensive at startup (indexing, pre-processing)
  - Spins up when user wants to review, closes when done
  - Reads data from `~/.agentwatch/`

**Shared Foundation: `@agentwatch/core`**
- Types, interfaces, constants
- Transcript parsing
- Sanitization logic
- Both components depend on core, minimizing code duplication and drift

### Data Contract
```
~/.agentwatch/
├── hooks/          # Written by Watcher, read by Analyzer
├── processes/      # Written by Watcher, read by Analyzer
├── transcripts/    # Read by both (source: Claude)
├── annotations.json    # Written by Analyzer
├── enrichments/        # Written by Analyzer
└── artifacts.json      # Written by Analyzer
```

JSONL/JSON files serve as the stable interface between components.

### Benefits
1. **Performance isolation** - Analysis workloads can't affect monitoring uptime
2. **Resource efficiency** - No idle browser tab consuming memory for hooks to work
3. **Clear mental model** - "Watcher watches, Analyzer analyzes"
4. **Independent lifecycles** - Daemon updates don't require restarting analysis; analysis can iterate faster
5. **Optional analysis** - Users who only need monitoring never load analysis code