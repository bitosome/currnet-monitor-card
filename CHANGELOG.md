# Changelog

## 0.7.1 — 2026-10-26

- Use the shared details icon for phase aggregators, explicitly bounded to 16px so it cannot grow over the reading.
- Give circuit and note launchers consistent dialog semantics and restore focus to the actual tapped control on touch browsers.
- Keep configuration in Home Assistant's native card editor and retain the shared Back/X flow for phase and note details.

Validation: typecheck, production build and 50 offline smoke checks. Mobile browser checks verify icon sizing, phase-to-note navigation and focus return. Thresholds, readings and configured circuit order are unchanged.

## 0.6.3 — 2026-10-25

- Adopt the shared Space Hub design primitives, synchronized tokens and source/hash provenance.
- Replace hand-built overlays with native modal dialogs: consistent MDI X, safe-area margins, bounded scrolling, focus restoration and Escape/backdrop handling.
- Keep only one circuit/phase dialog active, and release it before opening native Home Assistant more-info. Removing a card no longer resets Home Assistant page scrolling.
- Make circuit notes separate keyboard-accessible controls, with compact excerpts and a complete note view.
- Use calmer numeric typography and persistent alert colors/underglow instead of flashing readings. Thresholds, phase colors and unavailable values are unchanged.
- Increase editor actions to 44px and inputs to 16px; align package and source versions with the existing 0.6.x releases.

Validation: typecheck/build and smoke coverage for native focus, note/phase navigation, telemetry updates, more-info handoff, removal cleanup, threshold boundaries and editor behavior. Responsive browser checks cover 320px and 390px widths; physical-device commands are not part of this read-only card.
