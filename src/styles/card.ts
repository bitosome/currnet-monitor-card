/** Current and phase presentation. Threshold interpretation lives in config.ts. */
import { css } from 'lit';

export const currentMonitorStyles = css`
    :host {
      color: var(--primary-text-color);
      font-family: var(--ha-font-family-body, var(--paper-font-body1_-_font-family, inherit));
      --cmc-inactive-segment: var(--disabled-text-color, var(--secondary-text-color));
    }

    * {
      box-sizing: border-box;
    }

    ha-card.monitor-card {
      overflow: hidden;
      border-radius: var(--ha-card-border-radius, 24px);
      background: var(--ha-card-background, var(--card-background-color));
      box-shadow: var(--ha-card-box-shadow, none);
    }

    .content {
      display: grid;
      gap: var(--large-gap);
      padding: var(--tile-padding-large);
    }

    h2 {
      margin: 0;
      overflow-wrap: anywhere;
      color: var(--primary-text-color);
      font-size: 18px;
      font-weight: 700;
      line-height: 1.2;
    }

    .tiles {
      display: grid;
      grid-template-columns: repeat(var(--cmc-columns), minmax(0, 1fr));
      gap: var(--large-gap);
      width: 100%;
      isolation: isolate;
    }

    .tiles.compact {
      gap: var(--medium-gap);
    }

    .tiles.dense {
      gap: var(--small-gap);
    }

    .tile-wrap {
      position: relative;
      min-width: 0;
    }

    .glow-under {
      position: absolute;
      inset: var(--small-gap);
      z-index: 0;
      border-radius: var(--tile-border-radius);
      opacity: 0;
      pointer-events: none;
    }

    .glow-under.alert {
      box-shadow: 0 0 18px var(--status-alert-color);
      background: color-mix(in srgb, var(--status-alert-color) 16%, transparent);
      box-shadow: 0 0 18px color-mix(in srgb, var(--status-alert-color) 52%, transparent);
      opacity: 1;
    }

    .tile {
      --cmc-level-color: var(--primary-text-color);
      position: relative;
      z-index: 1;
      display: grid;
      place-items: center;
      width: 100%;
      min-width: 0;
      aspect-ratio: 1;
      margin: 0;
      padding: var(--tile-padding);
      overflow: hidden;
      border: 1px solid var(--divider-color, rgba(128, 128, 128, 0.24));
      border-color: color-mix(in srgb, var(--cmc-level-color) 24%, transparent);
      border-radius: var(--tile-border-radius);
      appearance: none;
      background: var(--ha-card-background, var(--card-background-color));
      background:
        linear-gradient(
          145deg,
          color-mix(in srgb, var(--cmc-level-color) 9%, transparent),
          transparent 78%
        ),
        var(--ha-card-background, var(--card-background-color));
      box-shadow: var(--tile-shadow-default);
      color: var(--cmc-level-color);
      font: inherit;
      cursor: pointer;
      container-type: inline-size;
      transition: transform 0.12s ease, box-shadow 0.12s ease, border-color 0.12s ease;
      -webkit-tap-highlight-color: transparent;
    }

    .tile.level-green { --cmc-level-color: var(--status-success-color); }
    .tile.level-yellow { --cmc-level-color: var(--status-dry-color); }
    .tile.level-orange { --cmc-level-color: var(--status-warn-color); }
    .tile.level-red { --cmc-level-color: var(--status-alert-color); }

    .tile.unavailable {
      --cmc-level-color: var(--disabled-text-color, var(--secondary-text-color));
      cursor: default;
    }

    @media (hover: hover) {
      .tile:hover {
        transform: translateY(-1px);
        box-shadow: var(--tile-shadow-hover);
      }
    }

    .tile:focus {
      outline: none;
    }

    .tile:focus-visible {
      outline: 2px solid var(--primary-color);
      outline-offset: 2px;
    }

    .reading-center {
      position: absolute;
      inset: 0;
      z-index: 1;
      display: grid;
      place-items: center;
      padding: 0 6%;
      pointer-events: none;
    }

    .tile-meta {
      position: absolute;
      inset: 0;
      z-index: 2;
      pointer-events: none;
    }

    .meta-header {
      position: absolute;
      top: var(--tile-padding);
      left: var(--tile-padding);
      right: var(--tile-padding);
      display: grid;
      gap: 2px;
      justify-items: center;
    }

    .meta-badges {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: var(--small-gap);
      width: 100%;
    }

    .meta-badge {
      max-width: 48%;
      overflow: hidden;
      padding: 1px 5px;
      border: 1px solid color-mix(in srgb, var(--cmc-level-color) 30%, transparent);
      border-radius: 999px;
      background: color-mix(in srgb, var(--cmc-level-color) 14%, transparent);
      color: var(--cmc-level-color);
      font-size: clamp(8px, 8cqw, 11px);
      font-weight: 600;
      line-height: 1.35;
      text-overflow: ellipsis;
      white-space: nowrap;
    }

    .meta-badges:has(.meta-ct:only-child) {
      justify-content: flex-end;
    }

    .meta-phase.phase-l1 {
      border-color: #5d4037;
      background: #795548;
      color: #fff;
    }

    .meta-phase.phase-l2 {
      border-color: #000;
      background: #212121;
      color: #fff;
    }

    .meta-phase.phase-l3 {
      border-color: #757575;
      background: #9e9e9e;
      color: #212121;
    }

    .meta-name {
      display: block;
      max-width: 100%;
      overflow: hidden;
      color: var(--secondary-text-color);
      font-size: clamp(10px, 9cqw, 14px);
      font-weight: 700;
      line-height: 1.1;
      text-align: center;
      text-overflow: ellipsis;
      white-space: nowrap;
    }

    .note-trigger {
      position: relative;
      z-index: 1;
      display: block;
      width: 100%;
      min-height: 44px;
      margin-top: 4px;
      padding: 6px;
      border: 0;
      border-radius: var(--tile-border-radius);
      background: var(--family-tile);
      color: var(--secondary-text-color);
      font: inherit;
      font-family: var(--family-font);
      font-size: 11px;
      font-weight: 500;
      line-height: 1.4;
      overflow-wrap: anywhere;
      text-align: center;
      cursor: pointer;
      touch-action: manipulation;
    }
    .note-trigger span { display: -webkit-box; -webkit-box-orient: vertical; -webkit-line-clamp: 2; overflow: hidden; }
    .note-trigger:focus-visible { outline: 3px solid var(--primary-color); outline-offset: 2px; }

    .note-badges {
      display: flex;
      flex-wrap: wrap;
      gap: 6px;
      margin-bottom: 8px;
    }

    .note-badge {
      padding: 2px 9px;
      border: 1px solid var(--divider-color, rgba(128, 128, 128, 0.3));
      border-radius: 999px;
      background: var(--secondary-background-color, rgba(128, 128, 128, 0.14));
      color: var(--primary-text-color);
      font-size: 12px;
      font-weight: 600;
      line-height: 1.5;
    }

    .note-badge.phase-l1 {
      border-color: #5d4037;
      background: #795548;
      color: #fff;
    }

    .note-badge.phase-l2 {
      border-color: #000;
      background: #212121;
      color: #fff;
    }

    .note-badge.phase-l3 {
      border-color: #757575;
      background: #9e9e9e;
      color: #212121;
    }

    .note-body {
      color: var(--primary-text-color);
      font-size: 15px;
      font-weight: 500;
      line-height: 1.45;
      white-space: pre-wrap;
      overflow-wrap: anywhere;
    }

    .tile.is-aggregator {
      border-color: color-mix(in srgb, var(--cmc-level-color) 55%, transparent);
    }

    .agg-indicator {
      position: absolute;
      right: var(--small-gap);
      bottom: var(--small-gap);
      z-index: 3;
      color: var(--cmc-level-color);
      font-size: clamp(9px, 10cqw, 13px);
      line-height: 1;
      opacity: 0.85;
      pointer-events: none;
    }

    .agg-panel { --family-dialog-width: 720px; }

    .agg-panel .tiles {
      isolation: isolate;
    }

    .reading-anchor {
      display: inline-flex;
      align-items: baseline;
      justify-content: center;
      gap: 2px;
      max-width: 100%;
      line-height: 1;
    }

    .reading {
      display: inline-block;
      max-width: 100%;
      overflow: hidden;
      color: color-mix(in srgb, var(--cmc-level-color) 55%, var(--primary-text-color));
      font-size: clamp(16px, 22cqw, 35px);
      font-weight: 600;
      font-variant-numeric: tabular-nums;
      line-height: 1;
      letter-spacing: -0.035em;
      text-overflow: ellipsis;
      white-space: nowrap;
    }

    .unit {
      flex: 0 0 auto;
      max-width: 5ch;
      overflow: hidden;
      color: var(--secondary-text-color);
      font-size: 10px;
      font-weight: 700;
      line-height: 1;
      letter-spacing: 0;
      text-overflow: ellipsis;
      white-space: nowrap;
    }

    .meter {
      position: absolute;
      left: var(--tile-padding);
      top: 50%;
      display: grid;
      grid-template-rows: repeat(4, 1fr);
      gap: var(--small-gap);
      width: clamp(5px, 7cqw, 11px);
      height: clamp(28px, 40cqw, 56px);
      transform: translateY(-50%);
      pointer-events: none;
    }

    .segment {
      display: block;
      width: 100%;
      min-height: 0;
      border-radius: var(--small-gap);
      background: var(--cmc-inactive-segment);
      color: var(--segment-color);
      opacity: 0.18;
    }

    .segment.green { --segment-color: var(--status-success-color); }
    .segment.yellow { --segment-color: var(--status-dry-color); }
    .segment.orange { --segment-color: var(--status-warn-color); }
    .segment.red { --segment-color: var(--status-alert-color); }

    .segment.active {
      background: currentColor;
      box-shadow: 0 0 0.35em currentColor, 0 0 0.7em currentColor;
      box-shadow: 0 0 0.35em currentColor, 0 0 0.7em color-mix(in srgb, currentColor 70%, transparent);
      opacity: 1;
    }

    .tile.alert {
      box-shadow: var(--tile-shadow-active);
      border-color: var(--status-alert-color);
    }

    .tile.alert .reading {
      color: color-mix(in srgb, var(--status-alert-color) 55%, var(--primary-text-color));
    }

    .segment-alert { color: var(--status-alert-color); }

    .configuration-error,
    .empty-state {
      padding: var(--tile-padding-large);
      border-radius: var(--tile-border-radius);
      font-size: 13px;
      font-weight: 700;
      line-height: 1.4;
    }

    .configuration-error {
      background: var(--secondary-background-color, rgba(128, 128, 128, 0.12));
      background: color-mix(in srgb, var(--status-alert-color) 12%, transparent);
      color: var(--status-alert-color);
    }

    .empty-state {
      border: 1px dashed var(--divider-color, rgba(128, 128, 128, 0.3));
      color: var(--secondary-text-color);
      text-align: center;
    }

    @container (max-width: 64px) {
      .meter {
        left: var(--small-gap);
        width: clamp(2px, 8cqw, 5px);
        height: clamp(12px, 55cqw, 28px);
      }

      .meta-header {
        top: var(--small-gap);
        left: var(--small-gap);
        right: var(--small-gap);
        gap: 1px;
      }

      .meta-badge {
        padding: 0 3px;
        font-size: clamp(6px, 11cqw, 11px);
      }

      .meta-name {
        font-size: clamp(7px, 15cqw, 12px);
      }

      .reading {
        font-size: clamp(9px, 24cqw, 16px);
      }


    }

    @container (max-width: 34px) {
      .meter {
        gap: 0;
      }

      .meta-name {
        font-size: clamp(6px, 16cqw, 9px);
      }

    }

    @media (prefers-reduced-motion: reduce) {
      .tile,
      .tile.alert,
      .tile.alert .reading,
      .glow-under.alert,
      .segment-alert {
        animation: none;
        transition: none;
      }
    }
`;
