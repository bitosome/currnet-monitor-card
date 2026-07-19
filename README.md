# Current Monitor Card

A configurable Home Assistant Lovelace card for visualizing current across phases, circuits, chargers, or other electrical loads.

The card mirrors a physical four-segment current meter while using the shared `bitosome` card design language. It supports up to 48 ordered sensor tiles and includes a full visual editor.

## Features

- One dynamic card instead of duplicated nested `button-card` templates.
- From 1 to 48 current tiles.
- Add, remove, drag, and arrow-reorder tiles in the visual editor.
- Configurable number of tiles per row.
- Native Home Assistant sensor picker for every tile.
- Optional tile names and unit overrides.
- Four cumulative current segments: green, yellow, orange, and red.
- Configurable limits and decimal precision.
- Alert animation above the configured alert limit.
- Tap or hold any configured tile to open Home Assistant's more-info dialog.
- Entity `unit_of_measurement` and `friendly_name` support.
- Safe handling of missing, `unknown`, `unavailable`, and non-numeric states.
- Responsive compact rendering for narrow tiles and reduced-motion support.
- Shared design tokens from `space-hub-card`.

## Installation

### HACS custom repository

1. Open HACS.
2. Add `https://github.com/bitosome/current-monitor-card` as a **Dashboard** custom repository.
3. Install **Current Monitor Card**.
4. Refresh the browser cache.

The HACS resource URL is:

```text
/hacsfiles/current-monitor-card/current-monitor-card.js
```

### Manual

Copy `dist/current-monitor-card.js` to:

```text
/config/www/community/current-monitor-card/current-monitor-card.js
```

Then add the Lovelace resource:

```yaml
url: /local/community/current-monitor-card/current-monitor-card.js
type: module
```

## Visual editor

Add **Current Monitor Card** from the dashboard card picker. The visual editor provides:

- card title, columns, decimal places, and default unit;
- green, yellow, orange, and alert limits;
- add/remove controls for up to 48 tiles;
- drag-and-drop and accessible up/down reordering;
- a sensor entity picker, name, and unit override for each tile.

The tile list itself defines how many tiles are shown. No separate tile-count value is needed.

## Example

```yaml
type: custom:current-monitor-card
name: Phase currents
columns: 3
decimal_places: 1
limits:
  green: 4
  yellow: 8
  orange: 12
  alert: 16
tiles:
  - name: L1
    entity: sensor.shelly_pro_3em_1_phase_a_current
  - name: L2
    entity: sensor.shelly_pro_3em_1_phase_b_current
  - name: L3
    entity: sensor.shelly_pro_3em_1_phase_c_current
```

The same configuration is available in [`example.yaml`](./example.yaml).

## Configuration

| Option | Type | Default | Description |
| --- | --- | --- | --- |
| `name` | string | empty | Optional card title. |
| `columns` | integer | `3` | Maximum number of tiles per row, from 1 to 48. If fewer tiles exist, only the required columns are rendered. |
| `decimal_places` | integer | `1` | Reading precision, from 0 to 4 decimal places. |
| `unit` | string | empty | Source/display unit when an entity has no unit. The final fallback is `A`. |
| `limits.green` | number (A) | `4` | Upper limit for one active green segment. |
| `limits.yellow` | number (A) | `8` | Upper limit for green and yellow segments. |
| `limits.orange` | number (A) | `12` | Upper limit for green, yellow, and orange segments. |
| `limits.alert` | number (A) | `16` | Values above this limit blink in alert mode. |
| `tiles` | array | three empty named tiles in the card picker | Ordered list of tile configurations. Maximum 48. |
| `tiles[].entity` | string | empty | Sensor entity whose numeric state is displayed. |
| `tiles[].name` | string | empty | Optional display name. If left empty, no name is shown (the entity name is still used for accessibility). |
| `tiles[].phase` | `L1` \| `L2` \| `L3` | empty | Optional phase badge (top-left corner). Chosen from a dropdown in the editor and colour-coded: L1 brown, L2 black, L3 grey. |
| `tiles[].current_transformer` | string | empty | Optional current-transformer badge shown in the top-right corner (e.g. `CT1`). |
| `tiles[].note` | string | empty | Optional note shown at the bottom of the tile, e.g. devices connected to this circuit breaker. |
| `tiles[].unit` | string | entity unit | Optional per-tile display-unit override. Recognized current units are converted. |

Limits must be finite and strictly increasing:

```text
green < yellow < orange < alert
```

Limits are always expressed in amperes. Entity states reported as `mA`, `µA`/`uA`, or `kA` are converted to amperes before level and alert comparisons. A recognized per-tile unit override also converts the displayed number; unknown custom unit labels retain the raw value.

## Meter behavior

With the defaults, the cumulative segment behavior is:

| Reading | Active segments | State |
| --- | --- | --- |
| unavailable | none | neutral |
| `0 A` to `4 A` | green | normal |
| `> 4 A` to `8 A` | green + yellow | elevated |
| `> 8 A` to `12 A` | green + yellow + orange | high |
| `> 12 A` to `16 A` | all four | red, steady |
| `> 16 A` | all four | alert animation |

The strict `> alert` boundary intentionally matches the physical monitor in the sibling `esphome-current-monitor` project.

Unit precedence is:

1. tile `unit` override;
2. entity `unit_of_measurement`;
3. card-level `unit`;
4. `A`.

## Migrating from the nested button card

Replace the complete `custom:button-card` configuration with the example above. The three Shelly Pro 3EM entities are read directly by this card; the ESPHome monitor imports them internally and does not expose replacement entities.

There is one deliberate boundary change from the supplied legacy template: that template alerts at exactly `16 A` (`>= 16`), while this card alerts only above `16 A`. The new behavior matches the physical ESPHome monitor. Change the alert limit slightly below 16 if the legacy inclusive behavior is required.

Unlike the previous template, styling and animations are defined once, regardless of whether the card renders 3 or 48 tiles.

## Design system

This card is part of the `bitosome` Home Assistant card family used by:

- `space-hub-card`;
- `real-electricity-price-card`;
- `smartevse-dual-charger-card`.

The canonical shared library is `space-hub-card/src/shared/design-tokens.ts`. It is vendored into this repository at `src/shared/design-tokens.ts` for a self-contained HACS build and composed into both the card and editor Lit styles. The canonical unavailable-state helper is also reused through `src/shared/state.ts`.

UI code uses the shared spacing, tile radii, shadows, and semantic `--status-*` palette instead of defining a separate visual language.

## Development

Requirements: Node.js 20 or newer.

```bash
npm install
npm run check
```

Commands:

- `npm run typecheck` — strict TypeScript check;
- `npm run build` — create `dist/current-monitor-card.js`;
- `npm test` — build and run headless card/editor smoke tests;
- `npm run check` — typecheck, build, and test.

For a local visual preview:

```bash
python3 -m http.server 8000
```

Then open `http://localhost:8000/preview/`.

Tagged releases matching `v*.*.*` run the same checks and publish `dist/current-monitor-card.js` as the HACS release asset.
