# Focus Ledger

A tiny focus timer and task ledger. Plain HTML, CSS and JavaScript. No build step, no account, no telemetry.

## Run

```bash
python3 -m http.server 4173
```

Then open http://localhost:4173.

## Files

- `index.html` — layout and static markup
- `styles.css` — the whole visual system
- `app.js` — timer, tasks and localStorage

## Notes

- Tasks and session count persist in `localStorage` under `focus-ledger.v1`.
- The timer runs on a 1 second interval. Pausing keeps the remaining time.
- Notification permission is requested on the first start.
