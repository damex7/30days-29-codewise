# Codewise

A calm workbench for developers: paste code or an error, pick a mode (Explain, Generate, Review, Fix an error, Write tests, Convert), and get an answer that has been checked before you see it. Codewise only reads and writes text. **It never runs your code.**

Day 29 of a 30-day dev challenge. Built with Next.js (App Router), TypeScript, Tailwind CSS v4, PostgreSQL on Neon (plain SQL), Zod and Google Gemini (with a deterministic mock).

> Work in progress: the full README (setup, deploy, diagrams, security notes and the concepts table) is completed in the final stage.

## Quick start

```bash
npm install
cp .env.example .env.local   # fill in DATABASE_URL at least
npm run db:migrate
npm run db:seed
npm run dev                  # http://localhost:3029
```
