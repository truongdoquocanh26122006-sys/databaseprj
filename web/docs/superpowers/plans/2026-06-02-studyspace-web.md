# StudySpace Web Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a demo-ready fullstack web dashboard for the StudySpace PostgreSQL database.

**Architecture:** Create a new `studyspace-web` app with an Express API and React/Vite frontend. Backend routes are thin wrappers over existing PostgreSQL tables, views, functions, and procedures.

**Tech Stack:** Node.js, Express, PostgreSQL `pg`, React, Vite, TypeScript, CSS.

---

### Task 1: Scaffold Fullstack App

**Files:**
- Create: `studyspace-web/package.json`
- Create: `studyspace-web/server/*`
- Create: `studyspace-web/client/*`

- [ ] Create package scripts for `dev`, `server`, `client`, and `build`.
- [ ] Add Express server entry, database pool, route modules, and frontend skeleton.
- [ ] Add `.env.example` with `DATABASE_URL`.

### Task 2: Backend API

**Files:**
- Create: `studyspace-web/server/db.js`
- Create: `studyspace-web/server/routes/*.js`

- [ ] Implement `/api/dashboard` summary.
- [ ] Implement `/api/orders` workflows using `fn_tao_order`, `fn_dat_truoc`, `fn_checkin`, `fn_them_chitietorder`, `fn_thanh_toan`.
- [ ] Implement `/api/inventory`, `/api/packages`, `/api/staff`, `/api/reports`.
- [ ] Return consistent JSON success/error envelopes.

### Task 3: Frontend Dashboard

**Files:**
- Create: `studyspace-web/client/src/App.tsx`
- Create: `studyspace-web/client/src/api.ts`
- Create: `studyspace-web/client/src/styles.css`

- [ ] Build tabbed dashboard sections for overview, orders, rooms, inventory, packages, staff, reports.
- [ ] Add compact forms for the core workflows.
- [ ] Render API errors and success messages.

### Task 4: Verification

- [ ] Install dependencies.
- [ ] Run API health checks against PostgreSQL.
- [ ] Run frontend build.
- [ ] Start local dev server and provide URL.
