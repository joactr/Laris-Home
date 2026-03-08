# 🏠 Laris Home

**Laris Home** is a modern, AI-powered household management system designed to streamline shared living tasks. More than just a to-do list, it leverages Large Language Models (LLMs) to automate the most tedious parts of home organization, like meal planning and recipe management.

> [!NOTE]
> This project is a Progressive Web App (PWA), fully mobile-responsive and optimized for a "native app" feel on both iOS and Android.

---

## ✨ Key Features

- **🧠 AI Recipe Extraction**: Transform messy web links into structured, categorized recipes using LLM parsing.
- **🛒 Smart Shopping**: Automatically generate shopping lists from meal plans and categorize items by household needs.
- **🎙️ Voice Assistant**: Speak to your app directly! Add items to the shopping list or ask for recipe inspirations seamlessly using Deepgram ASR and OpenRouter AI.
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
| **Database** | PostgreSQL | Relational data integrity with custom migration scripts. |
| **AI Layer** | OpenRouter & Deepgram | Leveraging advanced LLMs and Real-Time Voice-To-Text (ASR) for unstructured data parsing and Natural Language commands. |
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

4. Initialize the data:
   ```bash
   docker compose exec server npm run migrate
   docker compose exec server npm run seed
   ```

Access the app at **http://localhost:5173**.

---

## 📖 Architecture Deep Dive

### AI Workflow (Recipe & Macro Extraction)
The core "magic" happens in `server/src/services/openrouter.service.ts`. When a user provides a recipe link or text:
1. The backend scrapes the raw content.
2. An LLM (via OpenRouter) processes the unstructured text into a highly strictly typed JSON schema.
3. The schema includes ingredients, instructions, and **nutritional macros**.
4. Data is then persisted to PostgreSQL, linked to the user's household.

### Database Design
The schema uses a robust relational model to support multiple households and membership roles, ensuring data isolation and security. Check `server/src/db/migrations/` for the implementation details.

---

## 📜 License & Credits

Distributed under the MIT License. See `LICENSE` for more information.

*Crafted with ❤️ by JM.*
