import { LitElement, TemplateResult, css, html, nothing } from 'lit';
import { repeat } from 'lit/directives/repeat.js';
import { designTokens } from './shared/design-tokens';
import {
  CARD_TYPE,
  CARD_VERSION,
  MAX_TILES,
  convertCurrentUnit,
  createStubConfig,
  limitsValidationError,
  meterReading,
  normalizeConfig,
} from './config';
import type {
  CurrentMonitorCardConfig,
  CurrentMonitorTileConfig,
  HassEntity,
  HomeAssistant,
  MeterLevel,
  NormalizedCurrentMonitorCardConfig,
} from './types';
import './current-monitor-card-editor';

const SEGMENTS = [
  { index: 3, className: 'red', label: 'red' },
  { index: 2, className: 'orange', label: 'orange' },
  { index: 1, className: 'yellow', label: 'yellow' },
  { index: 0, className: 'green', label: 'green' },
] as const;

function fireEvent(node: HTMLElement, type: string, detail: unknown): void {
  node.dispatchEvent(new CustomEvent(type, {
    detail,
    bubbles: true,
    composed: true,
  }));
}

function levelClass(level: MeterLevel): string {
  return ['neutral', 'green', 'yellow', 'orange', 'red'][level] || 'neutral';
}

function textAttribute(entity: HassEntity | undefined, key: string): string {
  const value = entity?.attributes?.[key];
  return typeof value === 'string' ? value.trim() : '';
}

function fallbackEntityName(entityId: string): string {
  const objectId = entityId.includes('.') ? entityId.split('.').slice(1).join('.') : entityId;
  return objectId
    .split('_')
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ');
}

export class CurrentMonitorCard extends LitElement {
  public hass?: HomeAssistant;

  private _config?: NormalizedCurrentMonitorCardConfig;

  private _configurationError = '';

  private _holdTimer?: number;

  private _holdResetTimer?: number;

  private _holdTriggered = false;

  static properties = {
    hass: { attribute: false },
    _config: { state: true },
    _configurationError: { state: true },
  };

  public static async getConfigElement(): Promise<HTMLElement> {
    await customElements.whenDefined('current-monitor-card-editor');
    return document.createElement('current-monitor-card-editor');
  }

  public static getStubConfig(): CurrentMonitorCardConfig {
    return createStubConfig();
  }

  public setConfig(config: CurrentMonitorCardConfig): void {
    if (!config || typeof config !== 'object' || Array.isArray(config)) {
      throw new Error('Current Monitor Card configuration is required.');
    }
    if (config.tiles !== undefined && !Array.isArray(config.tiles)) {
      throw new Error('Current Monitor Card "tiles" must be an array.');
    }
    if ((config.tiles?.length || 0) > MAX_TILES) {
      throw new Error(`Current Monitor Card supports up to ${MAX_TILES} tiles.`);
    }

    const normalized = normalizeConfig(config);
    this._config = normalized;
    this._configurationError = limitsValidationError(normalized.limits) || '';
  }

  public disconnectedCallback(): void {
    this._cancelHold();
    this._clearHoldReset();
    super.disconnectedCallback();
  }

  public getCardSize(): number {
    if (!this._config) return 1;
    const renderedColumns = Math.min(this._config.columns, Math.max(1, this._config.tiles.length));
    const rows = Math.ceil(this._config.tiles.length / renderedColumns);
    const unitsPerGridRow = Math.max(1, Math.ceil(8 / renderedColumns));
    return Math.max(1, rows * unitsPerGridRow + (this._config.name.trim() ? 1 : 0));
  }

  protected render(): TemplateResult {
    if (!this._config) return html``;
    const config = this._config;
    const title = config.name.trim();
    const renderedColumns = Math.min(config.columns, Math.max(1, config.tiles.length));
    const densityClass = renderedColumns >= 9 ? 'dense' : renderedColumns >= 6 ? 'compact' : '';

    return html`
      <ha-card class="monitor-card">
        <div class="content">
          ${title ? html`<h2>${title}</h2>` : nothing}
          ${this._configurationError
            ? html`<div class="configuration-error" role="alert">${this._configurationError}</div>`
            : config.tiles.length === 0
              ? html`<div class="empty-state">Add at least one current sensor in the card editor.</div>`
              : html`
                <div
                  class="tiles ${densityClass}"
                  style=${`--cmc-columns:${renderedColumns}`}
                  role="list"
                  aria-label=${title || 'Current readings'}
                >
                  ${repeat(
                    config.tiles,
                    (tile, index) => `${tile.entity || 'empty'}-${index}`,
                    (tile, index) => this._renderTile(tile, index, config),
                  )}
                </div>
              `}
        </div>
      </ha-card>
    `;
  }

  private _renderTile(
    tile: CurrentMonitorTileConfig,
    index: number,
    config: NormalizedCurrentMonitorCardConfig,
  ): TemplateResult {
    const entityId = tile.entity?.trim() || '';
    const entity = entityId ? this.hass?.states?.[entityId] : undefined;
    const friendlyName = textAttribute(entity, 'friendly_name');
    const name = tile.name?.trim() || friendlyName || fallbackEntityName(entityId) || `Tile ${index + 1}`;
    const entityUnit = textAttribute(entity, 'unit_of_measurement');
    const sourceUnit = entityUnit || config.unit.trim() || 'A';
    const unit = tile.unit?.trim() || entityUnit || config.unit.trim() || 'A';
    const reading = meterReading(entity?.state, config.limits, sourceUnit);
    const displayValue = reading.value === undefined
      ? undefined
      : convertCurrentUnit(reading.value, sourceUnit, unit);
    const display = reading.available && displayValue !== undefined
      ? displayValue.toFixed(config.decimal_places)
      : '—';
    const level = levelClass(reading.level);
    const ariaValue = reading.available
      ? `${display} ${unit}${reading.alert ? ', alert' : ''}`
      : 'unavailable';

    return html`
      <div class="tile-wrap" role="listitem">
        <span class="glow-under ${reading.alert ? 'alert' : ''}" aria-hidden="true"></span>
        <button
          class="tile level-${level} ${reading.alert ? 'alert' : ''} ${reading.available ? '' : 'unavailable'}"
          type="button"
          data-index=${index}
          data-entity=${entityId}
          data-meter-level=${reading.level}
          aria-label=${`${name}: ${ariaValue}`}
          aria-disabled=${entityId ? 'false' : 'true'}
          title=${entityId ? `${name} · ${ariaValue}` : `${name} · choose a sensor in the editor`}
          @pointerdown=${() => this._startHold(entityId)}
          @pointerup=${this._finishHold}
          @pointercancel=${this._abortHold}
          @pointerleave=${this._abortHold}
          @click=${() => this._handleTileClick(entityId)}
        >
          <span class="meter" aria-hidden="true">
            ${SEGMENTS.map((segment) => html`
              <span
                class="segment ${segment.className} ${segment.index < reading.level ? 'active' : ''} ${reading.alert && segment.index === 3 ? 'segment-alert' : ''}"
                title=${segment.label}
              ></span>
            `)}
          </span>
          <span class="tile-content">
            <span class="tile-name">${name}</span>
            <span class="reading-anchor">
              <span class="reading">${display}</span>
              <span class="unit">${unit}</span>
            </span>
          </span>
        </button>
      </div>
    `;
  }

  private _openMoreInfo(entityId: string): void {
    if (!entityId) return;
    fireEvent(this, 'hass-more-info', { entityId });
  }

  private _startHold(entityId: string): void {
    this._cancelHold();
    this._clearHoldReset();
    this._holdTriggered = false;
    if (!entityId) return;
    this._holdTimer = window.setTimeout(() => {
      this._holdTimer = undefined;
      this._holdTriggered = true;
      this._openMoreInfo(entityId);
    }, 500);
  }

  private _cancelHold = (): void => {
    if (this._holdTimer !== undefined) {
      window.clearTimeout(this._holdTimer);
      this._holdTimer = undefined;
    }
  };

  private _clearHoldReset(): void {
    if (this._holdResetTimer !== undefined) {
      window.clearTimeout(this._holdResetTimer);
      this._holdResetTimer = undefined;
    }
  }

  private _finishHold = (): void => {
    this._cancelHold();
    if (!this._holdTriggered) return;
    this._clearHoldReset();
    this._holdResetTimer = window.setTimeout(() => {
      this._holdResetTimer = undefined;
      this._holdTriggered = false;
    }, 250);
  };

  private _abortHold = (): void => {
    this._cancelHold();
    this._clearHoldReset();
    this._holdTriggered = false;
  };

  private _handleTileClick(entityId: string): void {
    if (this._holdTriggered) {
      this._clearHoldReset();
      this._holdTriggered = false;
      return;
    }
    this._openMoreInfo(entityId);
  }

  static styles = [designTokens, css`
    :host {
      color: var(--primary-text-color);
      font-family: var(--paper-font-body1_-_font-family, Roboto, sans-serif);
      --cmc-inactive-segment: var(--disabled-text-color, var(--secondary-text-color));
    }

    * {
      box-sizing: border-box;
    }

    ha-card.monitor-card {
      overflow: hidden;
      border-radius: var(--ha-card-border-radius, 12px);
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
      overflow: hidden;
      color: var(--primary-text-color);
      font-size: 20px;
      font-weight: 800;
      line-height: 1.2;
      text-overflow: ellipsis;
      white-space: nowrap;
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
      z-index: var(--glow-z-index);
      border-radius: var(--tile-border-radius);
      opacity: 0;
      pointer-events: none;
    }

    .glow-under.alert {
      box-shadow: 0 0 18px var(--status-alert-color);
      background: color-mix(in srgb, var(--status-alert-color) 16%, transparent);
      box-shadow: 0 0 18px color-mix(in srgb, var(--status-alert-color) 52%, transparent);
      animation: glow-alert 1s steps(1, end) infinite;
    }

    .tile {
      --cmc-level-color: var(--primary-text-color);
      position: relative;
      z-index: var(--tile-z-index);
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

    .tile-content {
      display: grid;
      place-items: center;
      gap: var(--medium-gap);
      min-width: 0;
      max-width: 82%;
      text-align: center;
      pointer-events: none;
    }

    .tile-name {
      display: block;
      max-width: 100%;
      overflow: hidden;
      color: var(--secondary-text-color);
      font-size: clamp(12px, 10cqw, 16px);
      font-weight: 700;
      line-height: 1;
      text-overflow: ellipsis;
      white-space: nowrap;
    }

    .reading-anchor {
      position: relative;
      display: inline-block;
      max-width: 100%;
      line-height: 1;
    }

    .reading {
      display: inline-block;
      max-width: 100%;
      overflow: hidden;
      color: var(--cmc-level-color);
      font-size: clamp(16px, 22cqw, 35px);
      font-weight: 850;
      line-height: 1;
      letter-spacing: -0.035em;
      text-overflow: ellipsis;
      white-space: nowrap;
    }

    .unit {
      position: absolute;
      left: calc(100% + var(--small-gap));
      bottom: 0.08em;
      max-width: 5ch;
      overflow: hidden;
      color: currentColor;
      font-size: 0.46em;
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
      animation: card-border-alert 1s steps(1, end) infinite;
    }

    .tile.alert .reading,
    .segment-alert {
      animation: reading-alert 1s steps(1, end) infinite;
    }

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

    @keyframes reading-alert {
      0%, 49% {
        opacity: 1;
        filter: drop-shadow(0 0 0.25em var(--status-alert-color));
      }
      50%, 100% {
        opacity: 0.18;
        filter: none;
      }
    }

    @keyframes card-border-alert {
      0%, 49% {
        border-color: var(--status-alert-color);
      }
      50%, 100% {
        border-color: var(--status-alert-color);
        border-color: color-mix(in srgb, var(--status-alert-color) 28%, transparent);
      }
    }

    @keyframes glow-alert {
      0%, 49% { opacity: 1; }
      50%, 100% { opacity: 0.12; }
    }

    @container (max-width: 64px) {
      .unit {
        display: none;
      }

      .meter {
        left: var(--small-gap);
        width: clamp(2px, 8cqw, 5px);
        height: clamp(12px, 55cqw, 28px);
      }

      .tile-content {
        max-width: 94%;
        gap: var(--small-gap);
      }

      .tile-name {
        font-size: clamp(8px, 18cqw, 11px);
      }

      .reading {
        font-size: clamp(9px, 27cqw, 16px);
      }
    }

    @container (max-width: 34px) {
      .tile-name {
        display: none;
      }

      .meter {
        gap: 0;
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
  `];
}

if (!customElements.get('current-monitor-card')) {
  customElements.define('current-monitor-card', CurrentMonitorCard);
}

interface CustomCardMetadataWindow extends Window {
  customCards?: Array<Record<string, unknown>>;
}

const customCardsWindow = window as CustomCardMetadataWindow;
customCardsWindow.customCards = customCardsWindow.customCards || [];
if (!customCardsWindow.customCards.some((entry) => entry.type === 'current-monitor-card')) {
  customCardsWindow.customCards.push({
    type: 'current-monitor-card',
    name: 'Current Monitor Card',
    description: 'Configurable multi-sensor current meter with up to 33 ordered tiles.',
    preview: true,
    version: CARD_VERSION,
  });
}

declare global {
  interface HTMLElementTagNameMap {
    'current-monitor-card': CurrentMonitorCard;
  }
}

export type { CurrentMonitorCardConfig, CurrentMonitorTileConfig } from './types';
export { CARD_TYPE, CARD_VERSION };
