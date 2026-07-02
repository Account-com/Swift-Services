# Admin dashboard cleanup pass

This update focuses on the root layout/UX issues in the admin shell.

## Fixed
- Removed duplicate quick actions from the sidebar.
- Removed the visible hamburger controls from the sidebar and top bar.
- Removed theme switching from the UI and forced the dashboard to stay dark.
- Reworked the top sticky navbar into a cleaner inline layout.
- Made the topbar, page header, panels, and notifications fully opaque and less blurry.
- Changed the page header to scroll normally instead of sticking under the top bar.
- Reduced toast width and duration.
- Made the sidebar title/branding read inline and cleaner.
- Replaced the sidebar shield icon with the current avatar asset placeholder.
- Moved the inspector and notifications into fixed overlay panels so they do not steal layout width.
- Tightened the overall dark color scheme toward a darker graphite/indigo palette.

## Files updated
- `templates/admin.html`
- `static/css/admin.css`
- `static/js/admin-shell.js`
