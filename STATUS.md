# Status

## Architecture Split ✅ Complete

Agentwatch has been split into two components:

### Watcher (port 8420)
Always-on background daemon for real-time monitoring:
- Process scanning (detect running AI agents)
- Hook capture (session lifecycle, tool usage)
- Repository status tracking
- Port monitoring
- WebSocket for live updates

**Start:** `aw watcher start`

### Analyzer (port 8421)
On-demand browser-based analysis:
- Session enrichments (quality scores, auto-tags)
- Transcript discovery and indexing
- Analytics dashboards
- Annotation workflows
- Share/export preparation

**Start:** `aw analyze` (opens browser, closes when browser closes)

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

### Benefits Realized
1. **Performance isolation** - Analysis workloads can't affect monitoring uptime
2. **Resource efficiency** - No idle browser tab consuming memory for hooks to work
3. **Clear mental model** - "Watcher watches, Analyzer analyzes"
4. **Independent lifecycles** - Analysis can iterate without restarting monitoring
5. **Optional analysis** - Users who only need monitoring never load analysis code

### Legacy Daemon
The combined `@agentwatch/daemon` package is deprecated. Use watcher + analyzer instead.