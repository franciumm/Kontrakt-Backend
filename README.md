# Kontrakt-Backend

Kontrakt is an intelligent Express.js backend designed for freelancers to generate custom contracts and audit external contracts for red flags. 

It provides two main engines:
1. **Contract Interrogator**: A dynamic graph-based clause builder that creates a bulletproof freelancer contract (for design or software) based on a Q&A flow. 
2. **Contract Audit Engine**: An LLM-powered auditor that analyzes third-party contracts for dangerous clauses, protected against prompt injection.

---

## 🌟 Key Features

### 1. Smart Contract Interrogator
- **Dynamic Graph Logic**: Uses `graphWalker` to traverse contract clauses based on previous answers and state dependencies.
- **Exposure Scoring**: Calculates an "exposure-coverage score" indicating how legally and financially protected the freelancer is based on included clauses (e.g., Kill Fees, Revision Limits, Payment Terms).
- **Domain Specific**: Includes specialized clauses for Software Development and Design gigs.

### 2. AI Contract Auditor (Clauseguard)
- **Red Flag Detection**: Analyzes uploaded contracts for traps like `work-for-hire-trap`, `unlimited-revisions`, `asymmetric-indemnification`, and `overbroad-nda`.
- **Severity Ratings**: Flags are categorized into RED, YELLOW, or GREEN severity levels.
- **Prompt Injection Defense**: Implements advanced AI security layers (Layer 1 text sanitization, random per-call delimiters, and sandwich defense) to ensure malicious contract text cannot override the auditor instructions.

---

## 🛠️ Tech Stack & Architecture

- **Server**: Express.js with Node.js
- **Validation & Security**: Zod for schema validation, Helmet for HTTP headers, and CORS.
- **LLM Integration**: Uses the Fireworks API (via the Anthropic SDK pattern) to run high-performance AI models for contract auditing.
- **Caching**: Local caching layers (`audit.cache.js`, `contract.cache.js`) for optimized processing.

---

## 🚀 Getting Started

### Prerequisites
- Node.js (v18+)
- A Fireworks API Key

### Installation

1. **Clone the repository:**
   ```bash
   git clone https://github.com/franciumm/Kontrakt-Backend.git
   cd Kontrakt-Backend
   ```

2. **Install dependencies:**
   ```bash
   npm install
   ```

3. **Environment Setup:**
   Copy the example environment file and configure it with your API keys.
   ```bash
   cp .env.example .env
   ```
   *Make sure to add your `FIREWORKS_API_KEY` to the `.env` file.*

4. **Run the Server:**
   - **Development mode (with nodemon):**
     ```bash
     npm run dev
     ```
   - **Production mode:**
     ```bash
     npm start
     ```

## 📂 Project Structure

\`\`\`
src/
├── config/             # Application configuration & env loading
├── constants/          # Static definitions (Audit Categories, HTTP Status)
├── controllers/        # Route handlers (Audit, Contract, Health)
├── data/               
│   ├── cache/          # In-memory caching mechanisms
│   └── clauses/        # Gig-specific contract clause data (Software, Design)
├── lib/                # Core domain logic (GraphWalker, AI Audit Prompts, Sanitization)
├── middleware/         # Express middlewares (Error Handling, Validation, Async)
├── providers/          # Third-party integrations (Fireworks API)
├── routes/             # Express route definitions
├── services/           # Business logic layer
├── utils/              # Utility functions (Logger, etc.)
└── validators/         # Zod schemas for request validation
\`\`\`
