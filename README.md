# Ollama AI Assistant

A Node.js CLI AI assistant powered by your local Ollama installation.

## Prerequisites

- Node.js 18+
- [Ollama](https://ollama.ai/) installed and running
- A model pulled (e.g., `ollama pull llama3.2`)

## Setup

```bash
cd ollama-assistant
npm install
```

## Usage

### Default (llama3.2):

```bash
npm start
```

### With a different model:

```bash
OLLAMA_MODEL=mistral npm start
```

### Custom Ollama host:

```bash
OLLAMA_HOST=http://192.168.1.100:11434 npm start
```

## Commands

- Type your message and press Enter
- Type `/quit` or `/exit` to close

## Environment Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `OLLAMA_HOST` | `http://localhost:11434` | Ollama server address |
| `OLLAMA_MODEL` | `llama3.2` | Model to use |
