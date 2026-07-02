# Admin Phase 1 Blueprint

## 1. Purpose

This document is the working blueprint for the admin-side redesign of `earn-master-services-main`.

It is intentionally limited to:

- the **admin login page**
- the **main admin dashboard**

The user-facing experience is excluded from this redesign cycle.

---

## 2. What the uploaded project currently contains

### App structure
The project is already split into the expected layers:

- `server.py` as the Flask application and admin route host
- `routes/` for API endpoints
- `services/` for business logic
- `database/` for schema and seed tooling
- `templates/` for rendered pages
- `static/` for CSS and JavaScript assets
- `utils/` for shared auth and enums

### Admin entry points
Relevant admin pieces currently live in:

- `templates/admin.html`
- `static/css/admin.css`
- `static/js/admin-shell.js`
- `static/js/admin.js`
- `server.py` routes such as `/admin` and `/api/admin/*`

### Dashboard sections already present
From the screenshots in the PDF, the dashboard already has:

- a top admin bar
- summary metrics
- tabbed module navigation
- overview state
- payments / deposits review
- withdrawals review
- user controls
- risk review
- audit logs
- an admin inspector panel

This is a solid functional base. The problem is not structure. The problem is finish, depth, and visual authority.

---

## 3. Phase 1 design target

The design target for the admin area should be:

- premium
- dark
- disciplined
- high-trust
- modern
- operational
- clean under pressure

The dashboard should feel like a serious internal control system. The login page should feel like a secure gate into that system.

---

## 4. Visual system to lock before coding

### Palette
Use one consistent dark foundation with layered surfaces.

Recommended role categories:

- base background
- elevated panel background
- secondary panel background
- border line
- primary text
- secondary text
- muted text
- primary accent
- success
- warning
- danger
- info

The key rule is consistency. Every screen should use the same role-based colors, not ad hoc shades chosen because they looked fine at 1 a.m.

### Typography
Define a clear hierarchy:

- page title
- section title
- card title
- body text
- helper text
- label text
- tiny metadata

The design should avoid weak or cramped text styles. Admin tools need confidence, not decorative typography tricks.

### Surface language
Lock the following rules:

- panel radius standard
- card radius standard
- table row radius standard
- border opacity standard
- hover elevation standard
- shadow strength standard
- focus ring style standard

### Motion language
Lock a narrow motion set:

- hover lift
- fade + slide on open
- smooth transition for drawers
- button loading feedback
- toast entrance/exit
- skeleton shimmer
- count-up for metrics

No excessive animation. The goal is confidence, not a demo reel.

---

## 5. Login page blueprint

### Layout recommendation
A premium login page should use one of these patterns:

#### Pattern A: Split-screen
- left side for branding and trust
- right side for the login form

#### Pattern B: Centered glass card
- ambient dark background
- centered form card
- subtle brand header
- calm, focused layout

### Content recommendation
The login screen should include:

- system title
- small trust or security message
- username field
- password field
- reveal password button
- remember-me option if needed
- login button
- forgotten password link if the app supports it
- inline validation and error handling

### Interaction requirements
- show loading state on submit
- clearly show invalid credentials
- keep focus visible
- keep the button disabled during submission
- keep keyboard access clean

### Success criteria
The login page should feel:
- secure
- official
- direct
- visually polished
- easy to understand at a glance

---

## 6. Dashboard blueprint

### Shell
The dashboard shell should contain:

- sidebar navigation
- topbar
- main canvas
- optional inspector panel
- responsive collapse behavior

### Navigation
Navigation must be grouped and prioritized:

- Overview
- Payments / Deposits
- Withdrawals
- Users
- Risk / Flags
- Audit Logs

Active state should be unmistakable. Urgent counts should use badges where needed.

### Homepage structure
The dashboard homepage should be rebuilt around three layers:

#### Layer 1: Summary metrics
Show the highest-value operational numbers first.

#### Layer 2: Priority queue
Show what needs action now.

#### Layer 3: Activity and system state
Show recent events, policy state, and supporting context.

### Table and review screens
The work screens should use:

- readable row density
- sticky headers
- proper filters
- hover actions
- clear status tags
- selected-row detail preview
- safe action confirmation

### Inspector panel
The inspector should be context-aware and should show:

- summary
- status
- history
- metadata
- related events
- available actions

This is one of the strongest pieces in the current dashboard concept and should be preserved, expanded, and cleaned up.

---

## 7. Phase 1 implementation checklist

Before any visual code is changed, complete these tasks:

### A. Inventory all admin UI pieces
List:
- login view
- shell layout
- topbar
- sidebar
- tabs
- summary cards
- review tables
- inspector
- modals
- toasts
- empty states
- loading states

### B. Decide what must be rebuilt
Mark each part as:
- keep
- improve
- rebuild
- remove

### C. Lock the design tokens
Set:
- colors
- fonts
- spacing
- borders
- shadows
- radius
- animation timing

### D. Write the page-by-page direction
For:
- login page
- overview
- payments
- withdrawals
- users
- risk
- logs

### E. Define the interaction contract
Every important action should specify:
- loading behavior
- success behavior
- error behavior
- empty state behavior
- destructive confirmation behavior

---

## 8. Phase 1 output files

The main deliverables from this phase are documentation files that can guide implementation.

Current updated files should be limited to the Phase 1 docs only, so the next build phase stays controlled.

Expected files for this phase:

- `docs/phase1-notes.md`
- `docs/admin-phase1-blueprint.md`

No production logic should be changed in this phase unless a tiny route-level adjustment is later needed for the login/dashboard shell split.

---

## 9. Phase 1 done state

Phase 1 is complete when the team can answer these questions clearly:

- What should the login page feel like?
- What should the dashboard feel like?
- Which parts are being preserved?
- Which parts are being redesigned?
- What is the exact component list?
- What visual system will govern the entire admin area?
- What does Phase 2 need to build?

If those answers are locked, then Phase 2 can begin without guesswork.
