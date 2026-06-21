# StudySpace Web Design

## Goal
Build a demo-ready web dashboard for the StudySpace PostgreSQL project. The web app must connect to the live `namt_studyspace` database and expose the main project workflows through a usable interface.

## Scope
- Dashboard overview for revenue, orders, rooms, low stock, and staffing.
- Orders workflow: create active order, create reservation, check in, add item, pay.
- Rooms/seats views: shared-room availability and private-room status.
- Inventory workflow: low-stock list and stock import through `fn_nhap_hang`.
- Package workflow: register, extend, cancel, update package status.
- Staff/shift workflow: shift shortage, salary, performance, early leave, shift swap, shift substitute.
- Reports: revenue, top items, time-slot usage, employee performance.

## Architecture
- `studyspace-web/server`: Express API, PostgreSQL connection pool, thin route modules that call SQL functions/procedures and query views.
- `studyspace-web/client`: React + Vite dashboard. The UI is an operational dashboard, not a marketing page.
- API returns JSON consistently: `{ ok, data }` on success and `{ ok:false, error }` on failure.

## Constraints
- Keep the demo pragmatic and broad rather than production-complete.
- Do not implement authentication unless needed later.
- Prefer calling existing database functions/procedures over duplicating business logic in JavaScript.
