# IOKNBO Finance Tracker — Technical Architecture

> *"It's Okay to Not Be Okay"* — a finance app that is really an emotional storybook.

---

## Overview

This is a **cross-platform monorepo** (iOS, Android, Web) with a NestJS backend, built for offline-first, privacy-respecting personal finance tracking with an intentionally gentle, poetic UX.

---

## Repository Layout

```
/
├── apps/
│   ├── mobile/          Expo + React Native (iOS, Android, Web via RN Web)
│   └── web/             Expo Web standalone entry
├── packages/
│   ├── ui/              Design system — tokens + core components
│   ├── api-client/      TypeScript types + React Query hooks
│   └── config/          Shared ESLint, TSConfig, Tailwind config
├── backend/             NestJS API
│   └── src/
│       ├── auth/        JWT guard (Supabase/Clerk)
│       ├── transactions/
│       ├── savings-goals/
│       ├── debts/
│       ├── splits/
│       ├── ai-insights/ GPT-4o-mini weekly reflections
│       ├── ocr/         Mindee receipt parsing
│       └── export/      PDF (pdfkit) + Excel (exceljs)
├── database/
│   └── migrations/
│       └── 001_initial.sql  Full PostgreSQL schema with RLS
└── docs/
    └── ARCHITECTURE.md  (this file)
```

---

## Tech Stack

| Layer | Technology |
|---|---|
| Mobile + Web | React Native 0.76 + Expo 52 + Expo Router 4 |
| Animation | Reanimated 3 + Lottie + Skia |
| Styling | NativeWind 4 (Tailwind) + expo-blur |
| State | Zustand 5 + TanStack React Query 5 |
| Charts | Custom Skia constellation canvas |
| Fonts | Playfair Display + Poppins (via expo-google-fonts) |
| Backend | NestJS 10 + TypeScript |
| Auth | Supabase Auth (JWT, magic link, OAuth) |
| OCR | Mindee Receipt API v5 |
| Voice | Whisper API (OpenAI) |
| AI | GPT-4o-mini |
| Database | PostgreSQL (Supabase) with Row-Level Security |
| Cache | Upstash Redis |
| Storage | Supabase Storage (private bucket, signed URLs) |
| Export | pdfkit + exceljs |
| Hosting | Vercel (web) + Railway (backend) + EAS Build (mobile) |

---

## Security Model

1. **JWT on all routes** — `JwtAuthGuard` validates Supabase tokens on every NestJS endpoint.
2. **Row-Level Security** — PostgreSQL RLS policies ensure users can only access their own data, even if queries reach the DB directly.
3. **API keys server-side only** — OpenAI, Mindee, and exchange rate keys never reach the client. All third-party calls are proxied through NestJS.
4. **Signed receipt URLs** — Photos are stored in a private Supabase Storage bucket; only time-limited signed URLs are returned to the client.
5. **Rate limiting** — AI insight endpoints throttled at 10 requests/hour per user via `@nestjs/throttler`.
6. **Input validation** — All DTOs use `class-validator` with strict whitelist mode.

---

## Database Schema (ERD Summary)

```
users
  └─ transactions (many)
  └─ savings_goals (many)
  └─ debts (many)
  └─ splits (many)
       └─ split_participants (many)
  └─ ai_reflections (many)
```

See `database/migrations/001_initial.sql` for the full DDL, RLS policies, and triggers.

---

## Development Setup

### Prerequisites
- Node.js 20+
- Yarn 4 (corepack)
- Docker (optional, for local PostgreSQL)
- Expo CLI (`npm i -g expo-cli`)
- EAS CLI (`npm i -g eas-cli`)

### First-time setup

```bash
# 1. Install all workspace dependencies
yarn install

# 2. Copy environment variables
cp .env.example .env
# Fill in SUPABASE_URL, SUPABASE_ANON_KEY, OPENAI_API_KEY, etc.

# 3. Apply the database migration
psql $DATABASE_URL -f database/migrations/001_initial.sql

# 4. Start everything in parallel
yarn dev
```

### Running individual services

```bash
# Mobile / Web app (Expo)
cd apps/mobile && yarn start

# Backend API
cd backend && yarn start:dev

# Storybook (UI components)
cd packages/ui && yarn storybook
```

---

## Phase Roadmap

| Phase | Name | Status |
|---|---|---|
| 0 | Foundation & Monorepo | ✅ Complete |
| 1 | Core Shell & Auth | 🔲 Planned |
| 2 | Transaction Journal | 🔲 Planned |
| 3 | Constellation Charts | 🔲 Planned |
| 4 | Growing Tree & Savings | 🔲 Planned |
| 5 | Debt Ledger & Splits | 🔲 Planned |
| 6 | AI Insights & Reflections | 🔲 Planned |
| 7 | Export, Backup & Polish | 🔲 Planned |
| 8 | Bank Integration Preview | 🔲 Planned |

---

## Design Tokens (Night-Sky Palette)

| Token | Use |
|---|---|
| `night.900` | App background |
| `moon.50` | Primary text |
| `star.400` | Accent / CTA |
| `leaf.400` | Savings / success |
| `ember.300` | Alerts (gentle) |
| `glass.*` | Frosted card overlays |

See `packages/ui/src/tokens/` for the full set.
