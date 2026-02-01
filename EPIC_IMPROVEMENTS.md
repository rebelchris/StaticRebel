# StaticRebel Epic Improvements Plan

*Generated 2026-02-01 by Charlize after deep-dive review*

---

## 🔴 HIGH PRIORITY

### 1. Refactor the Monolith (`assistant.js` - 6000 lines!)

**Problem:** Everything is in one massive file - browser, web search, file ops, profiles, Telegram, etc.

**Solution:** Extract into focused modules:
```
lib/
├── browser/           # CDP browser automation
│   ├── cdp-client.js
│   ├── page-actions.js
│   └── twitter-scraper.js
├── web/               # Web operations
│   ├── search.js      # DuckDuckGo, Brave search
│   └── fetch.js       # URL fetching
├── files/             # File operations
│   ├── workspace.js
│   └── safe-io.js
├── telegram/          # Telegram bot (currently inline)
│   ├── bot.js
│   ├── handlers.js
│   └── commands.js
└── profiles/          # User profiles
    └── profile-manager.js
```

**Impact:** Maintainability, testability, easier contributions

---

### 2. SQLite for Vector Memory (not JSONL)

**Problem:** `vectorMemory.js` uses JSONL files - won't scale past ~10k memories.

**Solution:** Use SQLite with `sqlite-vec` extension (already in dependencies!):
```sql
CREATE TABLE memories (
  id TEXT PRIMARY KEY,
  content TEXT,
  embedding BLOB,  -- Float32Array as blob
  metadata JSON,
  created_at DATETIME
);

CREATE VIRTUAL TABLE memories_fts USING fts5(content);

-- Vector search
SELECT *, vec_distance_cosine(embedding, ?) AS dist
FROM memories ORDER BY dist LIMIT 10;

-- Keyword search with BM25
SELECT *, bm25(memories_fts) AS rank 
FROM memories_fts WHERE memories_fts MATCH ?;
```

**Impact:** 10-100x faster search, scales to millions of memories

---

### 3. Voice Input/Output

**Problem:** Only text input. Voice would be huge for mobile/casual use.

**Solution:**
- **Input:** Whisper via Ollama or OpenAI API
- **Output:** TTS via edge-tts (free), ElevenLabs, or Coqui

```js
// lib/voice/whisper.js
export async function transcribe(audioBuffer) {
  // Use Ollama's whisper endpoint or OpenAI
}

// lib/voice/tts.js
export async function speak(text, voice = 'en-US-AriaNeural') {
  // edge-tts is free and high quality
}
```

**Impact:** Hands-free usage, accessibility, mobile-friendly

---

### 4. Mobile App / PWA

**Problem:** Dashboard is web-only, no mobile presence.

**Solution:** Make dashboard a Progressive Web App (PWA):
- Add `manifest.json` and service worker
- Responsive design (already Next.js)
- Push notifications for nudges
- Offline skill logging

**Impact:** Use StaticRebel from phone with app-like experience

---

## 🟡 MEDIUM PRIORITY

### 5. Unified Tool System

**Problem:** Tools are scattered - some in `assistant.js`, some in `lib/toolRegistry.js`, some in skills.

**Solution:** Single tool registry with schema validation:
```js
// lib/tools/registry.js
export const tools = {
  web_search: {
    schema: { query: 'string', limit: 'number?' },
    handler: async (params) => { ... },
    rateLimit: { requests: 10, window: '1m' }
  },
  log_skill: {
    schema: { skill_id: 'string', data: 'object' },
    handler: async (params) => { ... }
  }
};
```

**Impact:** Cleaner architecture, easier to add new tools

---

### 6. Multi-Provider LLM Support

**Problem:** Tightly coupled to Ollama. Users might want OpenAI, Anthropic, Groq, etc.

**Solution:** Provider abstraction layer:
```js
// lib/llm/providers/index.js
export const providers = {
  ollama: OllamaProvider,
  openai: OpenAIProvider,
  anthropic: AnthropicProvider,
  groq: GroqProvider,
};

// Config
{
  "llm": {
    "provider": "ollama",
    "model": "llama3.2",
    "fallback": { "provider": "groq", "model": "llama-3.1-70b" }
  }
}
```

**Impact:** Flexibility, cloud fallback when local is slow

---

### 7. Apple Health / Google Fit Integration

**Problem:** Users manually log exercise/steps when phones already track it.

**Solution:** 
- Export from Apple Health → import JSON
- Google Fit API integration
- Auto-correlate with mood/productivity

**Impact:** Zero-effort fitness tracking, better insights

---

### 8. Calendar Integration

**Problem:** No awareness of user's schedule.

**Solution:**
- Google Calendar API
- iCal feed parsing
- "You have a meeting in 30 min" nudges
- "Busy day - maybe skip the gym today?"

**Impact:** Context-aware suggestions

---

### 9. Conversation Branching / Checkpoints

**Problem:** Long conversations can't be "rewound" to try different approaches.

**Solution:**
```js
// Save checkpoint
const checkpoint = await conversation.saveCheckpoint('before-big-change');

// Later, if needed
await conversation.restoreCheckpoint(checkpoint);
```

**Impact:** Experimentation without losing context

---

### 10. Plugin Marketplace

**Problem:** Skills are local-only, no sharing.

**Solution:**
- `staticrebel.json` manifest for skill packs
- Registry (like npm) for community skills
- `sr install fitness-pack`

**Impact:** Community ecosystem, viral growth

---

## 🟢 NICE TO HAVE

### 11. Natural Language Scheduling

"Remind me to drink water every 2 hours"
"Log my mood at 9pm every day"

Already have `cronScheduler.js` - just need NL parsing.

---

### 12. Collaborative Tracking

"Share my water streak with @friend"
"Challenge: Who drinks more water this week?"

---

### 13. AI Personality Customization

Let users tune the personality:
- Encouraging coach vs neutral tracker
- Emoji usage level
- Verbosity

---

### 14. Data Export & Portability

- Export all data as JSON/CSV
- GDPR-compliant data deletion
- Import from other trackers

---

### 15. Widgets / Desktop Integration

- macOS menu bar widget
- Windows system tray
- Linux desktop notifications

---

## 📊 Quick Wins (< 1 hour each)

1. **Add `--version` flag** to CLI
2. **Colored terminal output** for better readability
3. **Tab completion** for commands
4. **`/stats` command** showing usage summary
5. **`/export` command** for data backup
6. **Loading spinner** during LLM calls
7. **Retry on Ollama timeout** (network hiccups)
8. **Graceful shutdown** (save state on Ctrl+C)

---

## Implementation Order Recommendation

1. **SQLite vector memory** - Foundation for everything else
2. **Refactor assistant.js** - Makes everything else easier
3. **Voice I/O** - Game changer for UX
4. **PWA dashboard** - Mobile access
5. **Calendar integration** - Context awareness
6. **Multi-provider LLM** - Flexibility

---

*Want me to start on any of these?*
