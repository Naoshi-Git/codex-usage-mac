# Codex Usage for Mac v1.2.0

## Interactive TUI

`codex-usage live` adds a Codex CLI-style long-running terminal experience.

- `/` opens a slash-command palette
- `Tab` completes command names and supported fixed arguments
- `/watch`, `/mascot`, `/lang`, `/refresh`, `/redraw`, `/width`, `/night`, `/help`, `/quit`
- `Ctrl+L` performs a hard redraw
- `Ctrl+C` exits cleanly

`--watch 60` now enters the same interactive live mode, so existing usage remains compatible.

## Cleaner redraw behavior

- live mode uses the terminal alternate screen
- terminal resize is detected and the view is rebuilt
- the timeline shrinks to fit the current terminal width
- `/mascot`, `/lang`, `/width`, and `/night` automatically trigger a hard redraw after changing layout
- terminals narrower than 68 columns show a compact resize notice instead of wrapping the dashboard into a broken layout

## Quota Buddy

Quota Buddy now evaluates three independent signals:

1. weekly pace delta
2. 5-hour pace delta
3. lowest remaining quota across both windows

The 5-hour thresholds are intentionally looser because short-window usage is naturally burstier. The mascot now shows the actual pace/remaining values and the main driver for its mood.

The pixel art is also upgraded to an 18×14 logical-pixel true-color design with highlight, shadow, antenna, and mood-specific expressions.

## Status feedback

- `● RUNNING`: no quota/reset change since the previous fetch
- `✦ UPDATED`: quota or reset data actually changed
- `Ⅱ PAUSED`: automatic refresh disabled with `/watch off`

Clock movement alone does not trigger `UPDATED`.
