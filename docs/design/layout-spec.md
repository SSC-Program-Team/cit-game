# Layout spec

The numbers every screen is drawn to. If a mockup disagrees with this file, the mockup is wrong.

## Canvas

| | |
|---|---|
| Native size | **384 × 216** (16:9). iPad: fixed 384 width, fluid height 216–272 |
| Scale | integer only — 3× for docs, 3–4× on device, `Image.NEAREST` |
| Tile (overworld) | 12 px → 32 × 18 tiles visible |
| Unit of alignment | **4 px**; everything lands on it |

## Margins and gutters

| Zone | Value |
|---|---|
| Screen margin (left/right/top) | **8 px** |
| Screen margin (bottom, above prompt) | 8 px |
| Gutter between two columns | 6–8 px |
| Panel/scrim inner padding | 4–6 px |
| Gap between stacked text rows | 1 px (7 px line + 1) |

## Vertical anchors

| Band | Y | Content |
|---|---|---|
| Wire | 0–10 | hairline headline strip, always full width |
| HUD row | 12–26 | district name left; clock, money, energy right; all at `y = 16` |
| Content | 26–190 | the screen's one focus surface |
| Prompt | **196** | one line, active option marked with a 3 px caret |
| Hint | **208** | secondary key, grey, optional |

Nothing is placed between 190 and 196 except the prompt's own scrim. The prompt baseline is the same on every screen; a screen with a different one is a bug.

## Type

| Use | Spec |
|---|---|
| Body, HUD values, prompts | 5×7, scale 1 (6 px advance) |
| Section heading | scale 2 (10 px per glyph, 12 px advance) |
| Title / logo | scale 3 |
| 繁體 signage | Noto Sans CJK Bold, 10–13 px, thresholded to 1 bit, on a dark plate |
| 繁體 names on paper | 12 px on a light paper tab — white-on-dark blobs its strokes |

Character budget: `(width − padding) // 6`. A 176 px card holds 26 characters; a full-width line holds 62. Write the copy to the budget, never widen a panel to fit a sentence.

## Objects vs panels

- **Panels are gone.** A thing gets an edge only if it is physical: paper (ticket, save card), a sticky note, your laptop screen, a sign.
- Everything else sits on a **scrim** (`ui.scrim`, 150–238 alpha) with no border.
- Numbers that are not tiles or objects get no box at all — bare text.

## Touch (iPad)

| Element | Minimum |
|---|---|
| Action bar segment | 24 px tall (≈70 pt) |
| Icon button | 20 × 20 px (≈60 pt) |
| Hit slop around small controls | 6 px |
| Safe inset (top and bottom) | 8 px — nothing tappable inside |

## Checks before a mockup is accepted

```bash
PIXEL_AUDIT=1 python3 tools/mockup/build.py
```

Prints anything drawn past the canvas edge (`CLIPPED`) and deliberate bleed (`BLEED`). A `CLIPPED` line is always a bug: it means content the player was supposed to see never reached the screen.

Then, by eye:

1. Hide the UI in your head — can you say what the next action is? (§7.1 5-second test)
2. Any two elements closer than 4 px that are not the same group.
3. Every text run inside its container's character budget.
4. Screen margins equal on all four sides.

## Defects found in the visual pass (kept as a record)

| Screen | Defect | Cause |
|---|---|---|
| Overworld | Energy cluster drawn **23 px past the right edge** — visible HUD had two numbers, not three | coordinates copied from the 432-wide iPad scene into a 384-wide one |
| Overworld | Cross-street painted to y = 228 | road length written as a constant instead of `H - y` |
| Job screen | Prompt sat at y = 190, hint at 205 | no shared baseline |
| Hub | Title and card on a 14 px margin | ad-hoc margin |
| Home network | Three score labels collided with their meters; room labels showed signal rings through the plate | row spacing 9 vs panel height; plate alpha 205 |
| Wire sheet | Sample spacing inherited from the old 12 px strip | strip slimmed to 10 px, coordinates not re-derived |
