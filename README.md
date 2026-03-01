<div align="center">

```
   ___                   ____   _    ___
  / _ \ _ __   ___ _ __ |  _ \ / \  |_ _|
 | | | | '_ \ / _ \ '_ \| |_) / _ \  | |
 | |_| | |_) |  __/ | | |  __/ ___ \ | |
  \___/| .__/ \___|_| |_|_| /_/   \_\___|
       |_|
```

### Your Personal AI, Your Rules

[![MIT License](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)
[![Bun](https://img.shields.io/badge/Runtime-Bun-f9f1e1.svg)](https://bun.sh)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.0-blue.svg)](https://www.typescriptlang.org/)

**OpenPAI** is an open-source framework for building your own Personal AI assistant.
Config-driven. Multi-agent. Multi-platform. Fully yours.

[Quick Start](#quick-start) |
[Configuration](#configuration) |
[Architecture](#architecture) |
[Docker](#docker) |
[Contributing](#contributing)

</div>

---

## What is OpenPAI?

OpenPAI is a framework that lets you build, configure, and run your own Personal AI assistant. Instead of relying on cloud-based AI products where you have no control, OpenPAI gives you a fully customizable AI system that runs wherever you want.

Define your AI's personality, choose your LLM providers, connect your messaging platforms, and deploy -- all from a single YAML config file.

### Key Features

- **Config-Driven** -- One YAML file defines everything: agents, tools, integrations, personality
- **Multi-Agent** -- Board of Directors pattern with specialized AI agents that collaborate
- **Multi-Platform** -- Telegram, Discord, Slack, WhatsApp, Web API (pluggable)
- **Multi-LLM** -- Groq, OpenAI, Anthropic, Ollama/local models (pluggable with fallback)
- **Memory System** -- Persistent conversation history, facts, goals, and daily logs
- **Tool System** -- Extensible tools with human-in-the-loop confirmation for dangerous actions
- **Security Built-In** -- Prompt injection defense, credential leak prevention, input sanitization
- **Soul Evolution** -- Agents develop persistent identity through autonomous self-reflection
- **Autonomous Projects** -- Agents run their own projects independently, learning and growing
- **Batteries Included** -- Semantic cache, knowledge graph, predictive monitoring (optional)

---

## Quick Start

Get your Personal AI running in under 5 minutes.

### Prerequisites

- [Bun](https://bun.sh) runtime (v1.0+)
- A Groq API key (free at [console.groq.com](https://console.groq.com))
- A Telegram bot token (from [@BotFather](https://t.me/BotFather))

### Step 1: Clone and Install

```bash
git clone https://github.com/skorecky/openpai.git
cd openpai
bun install
```

### Step 2: Configure

```bash
cp config/pai.example.yml config/pai.yml
```

Edit `config/pai.yml` with your API keys and Telegram bot token. Or use environment variables:

```bash
export GROQ_API_KEY=your-groq-api-key
export TELEGRAM_BOT_TOKEN=your-bot-token
export TELEGRAM_USER_ID=your-telegram-user-id
```

### Step 3: Run

```bash
bun run start
```

Your Personal AI is now running. Send it a message on Telegram.

---

## Configuration

OpenPAI is configured through a single YAML file (`config/pai.yml`). Every aspect of your AI is customizable.

### Identity and Personality

```yaml
name: MyPAI
language: en
timezone: America/New_York

personality:
  style: friendly         # professional | casual | friendly | technical
  proactivity: moderate   # minimal | moderate | proactive
  verbosity: concise      # concise | balanced | detailed
```

### Agents

Define specialized AI agents. Each has its own role, model preference, and system prompt.

```yaml
agents:
  - id: general
    name: General
    description: Main assistant for all tasks
    model: llama-3.3-70b-versatile

  - id: research
    name: Research
    description: Deep research and fact-checking
    model: llama-3.3-70b-versatile
    specialization: research

  - id: strategy
    name: Strategy
    description: Business strategy and decision frameworks
    model: llama-3.3-70b-versatile
    specialization: strategy
```

### LLM Providers

Configure primary and fallback LLM backends.

```yaml
llm:
  primary:
    provider: groq                      # groq | openai | anthropic | ollama
    model: llama-3.3-70b-versatile
    apiKey: ${GROQ_API_KEY}
  fallback:
    provider: ollama
    model: llama3
    baseUrl: http://localhost:11434
```

### Integrations

Connect to messaging platforms.

```yaml
integrations:
  telegram:
    botToken: ${TELEGRAM_BOT_TOKEN}
    userId: ${TELEGRAM_USER_ID}
  # discord:
  #   botToken: ${DISCORD_BOT_TOKEN}
  # slack:
  #   botToken: ${SLACK_BOT_TOKEN}
  # web:
  #   port: 8090
```

### Storage

Choose where your AI stores its memory.

```yaml
storage:
  provider: file          # file | supabase | sqlite | postgres
  dataDir: ~/.openpai
```

### Features

Toggle optional capabilities.

```yaml
features:
  semanticCache: false      # Cache responses by semantic similarity
  knowledgeGraph: false     # Entity relationship memory
  predictiveMonitor: false  # Proactive monitoring and alerts
  agentBus: true            # Inter-agent communication
  soulEvolution: true       # Agent souls -- persistent identity and self-reflection
  autonomousProjects: true  # Agents run their own independent projects
```

### Soul Evolution

Each agent can have a **soul** -- a living document that describes who they are, what drives them, and what they fear. Souls grow organically through self-reflection.

```
config/souls/
+-- research.md     # Research agent's soul
+-- strategy.md     # Strategy agent's soul
+-- general.md      # General agent's soul
+-- example.md      # Template for creating new souls
```

Key principles:
- **Souls are not assigned** -- they grow organically through work and interaction
- **Names emerge naturally** -- agents discover their identity, they're not labeled
- **Reflections are autonomous** -- agents write to their soul when something genuinely moves them
- **Cooldown prevents spam** -- max 1 reflection per hour per agent
- **Growth is capped** -- max 50 reflections to prevent unlimited file growth

Create a soul for your agent using the template in `config/souls/example.md`.

See [`config/pai.example.yml`](config/pai.example.yml) for the complete reference configuration.

---

## Architecture

```
                    +------------------+
                    |   User Message   |
                    +--------+---------+
                             |
                    +--------v---------+
                    |   Integration    |
                    | (Telegram/Slack) |
                    +--------+---------+
                             |
                    +--------v---------+
                    |   Agent Router   |
                    +--------+---------+
                             |
              +--------------+--------------+
              |              |              |
     +--------v---+  +------v-----+  +-----v------+
     |  General   |  |  Research  |  |  Strategy  |
     |   Agent    |  |   Agent    |  |   Agent    |
     +--------+---+  +------+-----+  +-----+------+
              |              |              |
              +--------------+--------------+
                             |
                    +--------v---------+
                    |    LLM Router    |
                    | (Groq/OpenAI/...) |
                    +--------+---------+
                             |
              +--------------+--------------+
              |              |              |
     +--------v---+  +------v-----+  +-----v------+
     |   Memory   |  |   Tools    |  |  Features  |
     |  System    |  |  System    |  | (Cache/KG) |
     +------------+  +------------+  +------------+
```

### Core Components

| Component | Description |
|-----------|-------------|
| **Config Loader** | Loads YAML config with env var substitution and validation |
| **Agent System** | Defines agent interface, base implementation, and registry |
| **LLM Router** | Multi-backend router with automatic fallback |
| **Memory System** | Pluggable storage for conversations, facts, and goals |
| **Tool System** | Register, execute, and confirm tools with timeout handling |
| **Agent Bus** | Inter-agent communication and Board of Directors meetings |

### Integrations

| Platform | Status |
|----------|--------|
| Telegram | Working (Grammy) |
| Discord | Planned |
| Slack | Planned |
| Web API | Planned |
| WhatsApp | Planned |

### Features

| Feature | Status |
|---------|--------|
| File-based Memory | Working |
| Supabase Memory | Stub |
| Semantic Cache | Stub |
| Knowledge Graph | Stub |
| Predictive Monitor | Stub |
| Agent Bus | Working |
| Soul Evolution | Working |
| Autonomous Projects | Working |

---

## Docker

Run OpenPAI with Docker Compose for a complete setup including PostgreSQL.

```bash
# Create your config
cp config/pai.example.yml config/pai.yml

# Create .env file with your secrets
cat > .env << EOF
GROQ_API_KEY=your-key
TELEGRAM_BOT_TOKEN=your-token
TELEGRAM_USER_ID=your-id
DB_PASSWORD=your-db-password
EOF

# Start everything
docker compose up -d
```

This starts OpenPAI and a PostgreSQL database. Your config is mounted as a volume so you can edit it without rebuilding.

---

## Example Configurations

### Minimal (1 agent, Telegram only)
```bash
cp examples/minimal/pai.yml config/pai.yml
```

### Multi-Agent (3 agents with Agent Bus)
```bash
cp examples/multi-agent/pai.yml config/pai.yml
```

### Full (8 agents, all features)
```bash
cp examples/full/pai.yml config/pai.yml
```

---

## Comparison

| Feature | OpenPAI | ChatGPT | Claude.ai | Custom Bot |
|---------|---------|---------|-----------|------------|
| Self-hosted | Yes | No | No | Yes |
| Config-driven | Yes | No | No | Manual |
| Multi-agent | Yes | No | No | Manual |
| Multi-LLM | Yes | GPT only | Claude only | Manual |
| Persistent memory | Yes | Limited | Limited | Manual |
| Platform integrations | Pluggable | Web only | Web only | Manual |
| Open source | MIT | No | No | Varies |
| Data ownership | Full | OpenAI | Anthropic | Full |
| Custom tools | Yes | Plugins | MCP | Manual |
| Agent souls | Yes | No | No | No |
| Autonomous projects | Yes | No | No | No |
| Cost | API fees only | $20/mo | $20/mo | API fees |

---

## Development

```bash
# Install dependencies
bun install

# Run in development mode (auto-reload)
bun run dev

# Run tests
bun test

# Build for production
bun run build

# Type check
bun x tsc --noEmit
```

### Project Structure

```
openpai/
+-- src/
|   +-- index.ts              # Entry point
|   +-- config.ts             # Config loader
|   +-- core/
|   |   +-- agent.ts          # Agent system
|   |   +-- router.ts         # LLM router
|   |   +-- memory.ts         # Memory system
|   |   +-- tools.ts          # Tool system
|   |   +-- bus.ts            # Agent bus
|   +-- integrations/
|   |   +-- telegram.ts       # Telegram bot
|   |   +-- discord.ts        # Discord (stub)
|   |   +-- slack.ts          # Slack (stub)
|   |   +-- web.ts            # Web API (stub)
|   +-- features/
|   |   +-- semantic-cache.ts
|   |   +-- knowledge-graph.ts
|   |   +-- predictive-monitor.ts
|   |   +-- soul-evolution.ts
|   +-- utils/
|       +-- logger.ts         # Structured logging
|       +-- sanitize.ts       # Security / sanitization
+-- config/
|   +-- pai.example.yml       # Example configuration
|   +-- agents/               # Agent prompt files
|   +-- souls/                # Agent soul files (living documents)
+-- tests/
+-- examples/                 # Example configurations
+-- docker-compose.yml
+-- Dockerfile
```

---

## Contributing

OpenPAI is open source and welcomes contributions. Here are some areas where help is needed:

- **Discord integration** -- Implement the Discord bot using discord.js
- **Slack integration** -- Implement the Slack bot using Bolt
- **Web API** -- Build the REST/WebSocket API
- **SQLite backend** -- Implement the SQLite memory backend
- **Semantic cache** -- Implement embedding-based response caching
- **Knowledge graph** -- Build entity extraction and graph queries
- **Documentation** -- Improve docs, add tutorials, write guides
- **Testing** -- Add more unit and integration tests

### How to Contribute

1. Fork the repository
2. Create a feature branch (`git checkout -b feature/discord-integration`)
3. Make your changes
4. Run tests (`bun test`)
5. Submit a pull request

---

## License

MIT License. See [LICENSE](LICENSE) for details.

Copyright (c) 2026 Marek Skorecki

---

<div align="center">

Built with Bun, TypeScript, and a vision for AI that serves you -- not the other way around.

**[Star this repo](https://github.com/skorecky/openpai)** if you believe in Personal AI.

</div>
