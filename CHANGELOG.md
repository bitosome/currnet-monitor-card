# Changelog

## 0.6.3 — 2026-10-25

- Adopt the shared Space Hub design primitives, synchronized tokens and source/hash provenance.
- Replace hand-built overlays with native modal dialogs: consistent MDI X, safe-area margins, bounded scrolling, focus restoration and Escape/backdrop handling.
- Keep only one circuit/phase dialog active, and release it before opening native Home Assistant more-info. Removing a card no longer resets Home Assistant page scrolling.
- Make circuit notes separate keyboard-accessible controls, with compact excerpts and a complete note view.
- Use calmer numeric typography and persistent alert colors/underglow instead of flashing readings. Thresholds, phase colors and unavailable values are unchanged.
- Increase editor actions to 44px and inputs to 16px; align package and source versions with the existing 0.6.x releases.

Validation: typecheck/build and smoke coverage for native focus, note/phase navigation, telemetry updates, more-info handoff, removal cleanup, threshold boundaries and editor behavior. Responsive browser checks cover 320px and 390px widths; physical-device commands are not part of this read-only card.
