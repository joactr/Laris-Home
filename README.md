# 🏠 Laris Home

**Laris Home** is a modern, AI-powered household management system designed to streamline shared living tasks. More than just a to-do list, it leverages Large Language Models (LLMs) to automate the most tedious parts of home organization, like meal planning and recipe management.

> [!NOTE]
> This project is a Progressive Web App (PWA), fully mobile-responsive and optimized for a "native app" feel on both iOS and Android.

---

## ✨ Key Features

- **🧠 AI Recipe Extraction**: Transform messy web links into structured, categorized recipes using LLM parsing.
- **🛒 Smart Shopping**: Automatically generate shopping lists from meal plans and categorize items by household needs.
- 🎙️ **Voice Assistant**: Speak to your app directly! Add items to the shopping list or query your recipes using natural language. Fast, local processing powered by Deepgram ASR and a custom RAG (Retrieval-Augmented Generation) pipeline.
- 🔍 **Semantic Search**: Find recipes by concepts, not just words. "Something with fish" will find your salmon recipes using local vector embeddings.
- **📅 Interactive Calendar**: A shared timeline for chores, events, and important household milestones.
- **📊 Macro-Tracking**: Detailed nutritional breakdown for every recipe, automatically calculated during the import process.
- **🏗️ Project Management**: Break down complex home improvement or life goals into actionable subtasks.
- **🔐 Multi-User Security**: Shared household access with secure JWT authentication and role-based views.

---

## 🛠️ Tech Stack

Laris Home is built with a focus on **Type Safety**, **Scalability**, and **Developer Experience**.

| Layer | Technology | Key Highlights |
|---|---|---|
| **Frontend** | React 18 + TypeScript | Vite for lightning-fast HMR, Vanilla CSS for a bespoke design system. |
| **State** | Zustand | Persistent auth and global application state. |
| **Backend** | Node.js + Express | RESTful API built with TypeScript and Zod for strict schema validation. |
| **Database** | PostgreSQL + pgvector | Efficient semantic search using vector similarity (cosine distance). |
| **AI Layer** | OpenRouter & Deepgram | Leveraging advanced LLMs and Real-Time Voice-To-Text (ASR). |
| **Embeddings** | Transformers.js | **Local execution** of `all-MiniLM-L6-v2` for 100% private, fast vector generation (no external API local calls). |
| **Infra** | Docker | Seamless containerization for local development and deployment. |

---

## 🚀 Getting Started

### Prerequisites
- [Docker](https://www.docker.com/) and [Docker Compose](https://docs.docker.com/compose/)
- An [OpenRouter API Key](https://openrouter.ai/) (for AI features)

### 🐳 The One-Command Setup (Recommended)

1. Clone the repository:
   ```bash
   git clone https://github.com/[your-username]/laris-home.git
   cd laris-home
   ```

2. Configure environment variables. Copy the `.env.example` file to `.env` in the root directory:
   ```bash
   cp .env.example .env
   ```
   
   Then open `.env` and configure your API keys:
   ```bash
   # Add your OpenRouter API Key and preferred model
   OPENROUTER_API_KEY=your_openrouter_key_here
   OPENROUTER_MODEL=minimax/minimax-m2.5
   
   # Add your Deepgram API Key for Voice Control
   DEEPGRAM_API_KEY=your_deepgram_key_here
   DEEPGRAM_LANGUAGE=es
   DEEPGRAM_ENDPOINTING=2000
   
   # Setup Server Settings
   JWT_SECRET=your_jwt_secret_here
   ```

3. Spin up the entire stack:
   ```bash
   docker compose up --build
   ```

   This also starts an automatic Postgres backup sidecar that writes dumps to `./backups/postgres`.

4. Initialize the data:
   ```bash
   docker compose exec server npm run migrate
   docker compose exec server npm run seed
   ```

Access the app at **http://localhost:5173**.

### Automatic Database Backups

- A `db-backup` service creates a compressed Postgres dump on startup and then every 24 hours by default.
- Backup files are written to `./backups/postgres`.
- Old backups are pruned after `DB_BACKUP_RETENTION_DAYS` days.
- You can tune the schedule with:
  ```bash
  DB_BACKUP_INTERVAL_SECONDS=86400
  DB_BACKUP_RETENTION_DAYS=7
  ```
- You can trigger an extra manual backup at any time with:
  ```bash
  docker compose exec db-backup sh /usr/local/bin/backup.sh once
  ```

---

## 📖 Architecture Deep Dive

### AI Workflow (Recipe & Macro Extraction)
The core "magic" happens in `server/src/services/openrouter.service.ts`. When a user provides a recipe link or text:
1. The backend scrapes the raw content.
2. An LLM (via OpenRouter) processes the unstructured text into a highly strictly typed JSON schema.
3. The schema includes ingredients, instructions, and **nutritional macros**.
4. Data is then persisted to PostgreSQL, linked to the user's household.

### Voice & Semantic Search (RAG)
Laris Home uses a privacy-first **Retrieval-Augmented Generation (RAG)** approach for recipes:
1. **Local Embedding**: User voice commands are converted to vectors locally on your server using `MiniLM` (via ONNX Runtime). No recipe data is sent to external APIs for indexing.
2. **Vector Similarity**: The system queries PostgreSQL using `pgvector` to find the top 10 most relevant recipes based on semantic meaning.
3. **LLM Context**: Only the selected candidates are sent to the LLM (OpenRouter) as context, ensuring fast responses and high accuracy while keeping your full database private.

### Database Design
The schema uses a robust relational model to support multiple households and membership roles, ensuring data isolation and security. Check `server/src/db/migrations/` for the implementation details.

---

## 📜 License & Credits

Distributed under the MIT License. See `LICENSE` for more information.

*Crafted with ❤️ by JM.*
