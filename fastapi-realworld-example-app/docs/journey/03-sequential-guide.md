# Developer Onboarding Journey: Sequential Setup & Coding Guide

This module is designed for sequential and hands-on learners. We walk through a step-by-step playbook to initialize dependencies, configure databases, run migrations, and launch our development runtime.

---

## 🛠️ Step-by-Step Workspace Setup

To establish your local TypeScript environment from scratch, run these commands in your shell sequentially:

### Step 1: Initialize Project Configuration
Initialize `package.json` to configure the Node project and compile properties:
```bash
npm init -y
```

### Step 2: Install Base Dependencies
Install our core runtime packages:
```bash
npm install express @prisma/client jsonwebtoken bcryptjs cors zod dotenv
```

### Step 3: Install Development Tooling
Install our TypeScript compiler engines, auto-reload developers runtime, and local typings:
```bash
npm install -D typescript @types/node @types/express @types/jsonwebtoken @types/bcryptjs @types/cors ts-node-dev prisma
```

### Step 4: Bootstrap TypeScript Configurations
Initialize the `tsconfig.json` template sheet:
```bash
npx tsc --init
```
*Action:* Open `tsconfig.json` and verify the compiler targets compile parameters:
```json
{
  "compilerOptions": {
    "target": "es2022",
    "module": "commonjs",
    "lib": ["es2022"],
    "strict": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "forceConsistentCasingInFileNames": true,
    "outDir": "./dist"
  },
  "include": ["src/**/*"]
}
```

### Step 5: Initialize Prisma Engine
Initialize Prisma database mapper files in the directory root:
```bash
npx prisma init
```
This automatically generates:
*   `prisma/schema.prisma` (relational blueprint schema).
*   `.env` (environment variables file containing `DATABASE_URL="file:./dev.db"`).

---

## 💾 Database Schema Migration Playbook

Once `prisma/schema.prisma` is populated with our relational models:

### 1. Generate & Run Database Migration
Execute this command to compile database revisions and initialize your local SQLite binary file:
```bash
npx prisma migrate dev --name init
```
*What this does:*
1.  Creates a SQL migration file in `prisma/migrations/`.
2.  Creates the `dev.db` SQLite binary file inside the `prisma/` directory.
3.  Generates the fully typed Prisma Client classes inside `node_modules/@prisma/client` for instant query autocompletes.

### 2. Launch Prisma Studio
Prisma Studio provides a rich, web-based visual spreadsheet to inspect and modify database records directly in your browser:
```bash
npx prisma studio
```
Access the spreadsheet at `http://localhost:5555`.

---

## 🚀 Running the Server locally

To launch the Express server with live reload enabled during coding, add these commands under the `scripts` object in `package.json`:

```json
"scripts": {
  "dev": "ts-node-dev --respawn --transpile-only src/server.ts",
  "build": "tsc",
  "start": "node dist/server.js"
}
```

Now, boot your local development server:
```bash
npm run dev
```
The console will output:
`🚀 Server listening on port 8000`
`💾 SQLite database connected via Prisma Client`
