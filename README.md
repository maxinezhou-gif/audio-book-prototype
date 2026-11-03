# Record a book — interactive prototype

A coded prototype of a recording flow from a connected-device companion app:
create a page, record audio for it, play it back, and reorder the list.

Anonymised build. The product name, brand palette and cover art have been changed;
the flows, measurements and interaction behaviour are the originals.

## Running it

```bash
python3 serve.py            # http://127.0.0.1:8787/
python3 serve.py --lan      # also reachable from a phone on the same wi-fi
```

Must be served, not opened as a `file://` URL.

## Files

| File | What it holds |
|---|---|
| `index.html` | Prototype index |
| `record-book.html` | The flow, with the halo around the record dial while recording |
| `record-book-flat.html` | Identical, halo removed |
| `success-animation.html` | Success screen, three motion options |
| `tokens.css` | Colour, shape, spacing and type tokens |
| `components.css` | Button, icon button, field, switch, app bar, nav bar, status chip, audio tile, sheet, menu |
| `app.js` | Flow state machine, waveform, overflow menu, drag-to-reorder |
| `prefs.js` | Viewing preferences shared by the index and the prototypes |

The two builds differ by one attribute — `<body data-motion="pulse">` vs `"flat"`.
Regenerate the flat build rather than hand-editing both:

```bash
sed -e 's|<body data-motion="pulse">|<body data-motion="flat">|' \
    -e 's|<title>Pagelark — Record a book</title>|<title>Pagelark — Record a book (no dial halo)</title>|' \
    record-book.html > record-book-flat.html
```

## ⚠️ Before this repo goes public

- [ ] **`assets/success/option3.json` and `option4.json` still carry the original product
      name and book title as baked text layers.** They are whole-screen Figma exports, so
      the strings are pre-rendered glyphs and cannot be find-and-replaced. Re-export them
      with the new copy, or ship `option2.json` only — it is the art-frame export and has
      no text layers at all.
- [ ] **`assets/success/*.svg` is the original character.** Replace before publishing.
- [ ] Product name is a placeholder. One find-and-replace for `Pagelark`.

## The flow

```
empty ──Record Front Page │ Add │ Create──▶ tile dissolves in (No audio)
                                              ▼  tile centres itself, 800ms pause
                                           sheet slides in — "Tap to start"
                                              ▼  tap dial, recording starts at once
                                           Recording ──tap dial──▶ Recorded
                                              │
                   ┌──────────────────────────┤
              tap dial ⇄ Listen back    Record next audio
                                              │
                        sheet slides out ▸ previous tile ▸ Unlinked
                                              │
                     dismiss sheet with 2+ unlinked ──▶ bulk actions
```

Chip states: **No audio** → **Unlinked** (recorded, not yet linked) → **Linked**.

## Tuning

Top of `app.js`: `SHEET_DELAY` 800 · `SHEET_EXIT` 320 · `MAX_SECONDS` 1200 ·
`WAVE_FULL_SCALE` 27 · `BULK_THRESHOLD` 2.
