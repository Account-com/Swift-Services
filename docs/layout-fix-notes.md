# Layout Fix Notes

## What changed
- Removed the duplicate top tabbar and page-level compact/signals controls.
- Moved the overview summary cards into the Overview tab only.
- Converted the admin inspector into a conditional overlay drawer so it no longer steals width on every page.
- Made tab changes scroll back to the top of the workspace.
- Tightened toast notifications so they are smaller, dismiss automatically, and stay out of the way.
- Kept the laptop-first layout as the default structure.

## Files updated
- templates/admin.html
- static/css/admin.css
- static/js/admin-shell.js
