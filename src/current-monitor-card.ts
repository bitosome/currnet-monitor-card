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

  private _noteModal?: { title: string; phase: string; ct: string; note: string };

  private _pendingNote?: { title: string; phase: string; ct: string; note: string };

  private _aggregatorPhase?: string;

  private _holdTimer?: number;

  private _holdResetTimer?: number;

  private _holdTriggered = false;

  static properties = {
    hass: { attribute: false },
    _config: { state: true },
    _configurationError: { state: true },
    _noteModal: { state: true },
    _aggregatorPhase: { state: true },
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
    window.removeEventListener('keydown', this._onNoteKeydown);
    window.removeEventListener('keydown', this._onAggKeydown);
    super.disconnectedCallback();
  }

  public getCardSize(): number {
    if (!this._config) return 1;
    const activeCount = this._config.tiles.filter((tile) => tile.active !== false).length;
    const renderedColumns = Math.min(this._config.columns, Math.max(1, activeCount));
    const rows = Math.ceil(Math.max(1, activeCount) / renderedColumns);
    const unitsPerGridRow = Math.max(1, Math.ceil(8 / renderedColumns));
    return Math.max(1, rows * unitsPerGridRow + (this._config.name.trim() ? 1 : 0));
  }

  protected render(): TemplateResult {
    if (!this._config) return html``;
    const config = this._config;
    const title = config.name.trim();
    const activeTiles = config.tiles
      .map((tile, index) => ({ tile, index }))
      .filter(({ tile }) => tile.active !== false);
    const renderedColumns = Math.min(config.columns, Math.max(1, activeTiles.length));
    const densityClass = renderedColumns >= 9 ? 'dense' : renderedColumns >= 6 ? 'compact' : '';

    return html`
      <ha-card class="monitor-card">
        <div class="content">
          ${title ? html`<h2>${title}</h2>` : nothing}
          ${this._configurationError
            ? html`<div class="configuration-error" role="alert">${this._configurationError}</div>`
            : activeTiles.length === 0
              ? html`<div class="empty-state">Add at least one current sensor in the card editor.</div>`
              : html`
                <div
                  class="tiles ${densityClass}"
                  style=${`--cmc-columns:${renderedColumns}`}
                  role="list"
                  aria-label=${title || 'Current readings'}
                >
                  ${repeat(
                    activeTiles,
                    ({ tile, index }) => `${tile.entity || 'empty'}-${index}`,
                    ({ tile, index }) => this._renderTile(tile, index, config),
                  )}
                </div>
              `}
        </div>
        ${this._noteModal ? this._renderNoteModal() : nothing}
        ${this._aggregatorPhase ? this._renderAggregatorModal() : nothing}
      </ha-card>
    `;
  }

  private _renderTile(
    tile: CurrentMonitorTileConfig,
    index: number,
    config: NormalizedCurrentMonitorCardConfig,
    inModal = false,
  ): TemplateResult {
    const entityId = tile.entity?.trim() || '';
    const entity = entityId ? this.hass?.states?.[entityId] : undefined;
    const friendlyName = textAttribute(entity, 'friendly_name');
    const name = tile.name?.trim() || friendlyName || fallbackEntityName(entityId) || `Tile ${index + 1}`;
    const displayName = tile.name?.trim() || '';
    const phase = tile.phase?.trim() || '';
    const phaseClass = /^l[123]$/i.test(phase) ? ` phase-${phase.toLowerCase()}` : '';
    const isAggregator = tile.aggregator === true && !inModal && phase !== '';
    const currentTransformer = tile.current_transformer?.trim() || '';
    const note = tile.note?.trim() || '';
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
    const ariaMeta = [phase, currentTransformer, note].filter(Boolean).join(' · ');
    const ariaLabel = ariaMeta ? `${name} (${ariaMeta}): ${ariaValue}` : `${name}: ${ariaValue}`;

    return html`
      <div class="tile-wrap" role="listitem">
        <span class="glow-under ${reading.alert ? 'alert' : ''}" aria-hidden="true"></span>
        <button
          class="tile level-${level} ${reading.alert ? 'alert' : ''} ${reading.available ? '' : 'unavailable'} ${isAggregator ? 'is-aggregator' : ''}"
          type="button"
          data-index=${index}
          data-entity=${entityId}
          data-meter-level=${reading.level}
          aria-label=${isAggregator ? `${ariaLabel} (aggregator)` : ariaLabel}
          aria-disabled=${entityId || isAggregator ? 'false' : 'true'}
          title=${isAggregator
            ? `Show all ${phase} circuits`
            : entityId
              ? `${ariaLabel}`
              : `${name} \u00b7 choose a sensor in the editor`}
          @pointerdown=${() => this._startHold(isAggregator ? '' : entityId)}
          @pointerup=${this._finishHold}
          @pointercancel=${this._abortHold}
          @pointerleave=${this._abortHold}
          @click=${() => this._handleTileClick(entityId, tile, inModal)}
        >
          ${isAggregator
            ? html`<span class="agg-indicator" aria-hidden="true">\u2922</span>`
            : nothing}
          <span class="meter" aria-hidden="true">
            ${SEGMENTS.map((segment) => html`
              <span
                class="segment ${segment.className} ${segment.index < reading.level ? 'active' : ''} ${reading.alert && segment.index === 3 ? 'segment-alert' : ''}"
                title=${segment.label}
              ></span>
            `)}
          </span>
          <span class="reading-center" aria-hidden="true">
            <span class="reading-anchor">
              <span class="reading">${display}</span>
              <span class="unit">${unit}</span>
            </span>
          </span>
          <span class="tile-meta" aria-hidden="true">
            ${phase || currentTransformer || displayName
              ? html`
                <span class="meta-header">
                  ${phase || currentTransformer
                    ? html`
                      <span class="meta-badges">
                        ${phase ? html`<span class="meta-badge meta-phase${phaseClass}">${phase}</span>` : nothing}
                        ${currentTransformer
                          ? html`<span class="meta-badge meta-ct">${currentTransformer}</span>`
                          : nothing}
                      </span>
                    `
                    : nothing}
                  ${displayName ? html`<span class="meta-name">${displayName}</span>` : nothing}
                </span>
              `
              : nothing}
            ${note
              ? html`<span
                  class="meta-note"
                  title="Show full note"
                  @pointerdown=${(event: Event) => {
                    event.stopPropagation();
                    this._pendingNote = {
                      title: displayName || name,
                      phase,
                      ct: currentTransformer,
                      note,
                    };
                  }}
                >${note}</span>`
              : nothing}
          </span>
        </button>
      </div>
    `;
  }

  private _openMoreInfo(entityId: string): void {
    if (!entityId) return;
    fireEvent(this, 'hass-more-info', { entityId });
  }

  private _openNote(title: string, phase: string, ct: string, note: string): void {
    this._noteModal = { title, phase, ct, note };
    window.addEventListener('keydown', this._onNoteKeydown);
  }

  private _closeNote = (): void => {
    if (!this._noteModal) return;
    this._noteModal = undefined;
    window.removeEventListener('keydown', this._onNoteKeydown);
  };

  private _onNoteKeydown = (event: KeyboardEvent): void => {
    if (event.key === 'Escape') this._closeNote();
  };

  private _openAggregator(phase: string): void {
    this._aggregatorPhase = phase;
    window.addEventListener('keydown', this._onAggKeydown);
  }

  private _closeAggregator = (): void => {
    if (this._aggregatorPhase === undefined) return;
    this._aggregatorPhase = undefined;
    window.removeEventListener('keydown', this._onAggKeydown);
  };

  private _onAggKeydown = (event: KeyboardEvent): void => {
    if (event.key === 'Escape') this._closeAggregator();
  };

  private _renderAggregatorModal(): TemplateResult {
    const phase = this._aggregatorPhase;
    if (!phase || !this._config) return html``;
    const config = this._config;
    const phaseTiles = config.tiles
      .map((tile, index) => ({ tile, index }))
      .filter(({ tile }) => (tile.phase?.trim() || '').toLowerCase() === phase.toLowerCase());
    const columns = Math.min(config.columns, Math.max(1, phaseTiles.length));
    const phaseClass = /^l[123]$/i.test(phase) ? ` phase-${phase.toLowerCase()}` : '';
    return html`
      <div class="note-backdrop" @click=${this._closeAggregator}>
        <div
          class="agg-panel"
          role="dialog"
          aria-modal="true"
          aria-label=${`Phase ${phase}`}
          @click=${(event: Event) => event.stopPropagation()}
        >
          <div class="note-head">
            <div class="note-copy">
              <div class="note-badges">
                <span class="note-badge${phaseClass}">${phase}</span>
              </div>
              <div class="note-title">${phaseTiles.length} ${phaseTiles.length === 1 ? 'circuit' : 'circuits'}</div>
            </div>
            <button class="note-close" type="button" @click=${this._closeAggregator}>Close</button>
          </div>
          <div class="tiles" style=${`--cmc-columns:${columns}`} role="list">
            ${repeat(
              phaseTiles,
              ({ index }) => `agg-${index}`,
              ({ tile, index }) => this._renderTile(tile, index, config, true),
            )}
          </div>
        </div>
      </div>
    `;
  }

  private _renderNoteModal(): TemplateResult {
    const modal = this._noteModal;
    if (!modal) return html``;
    const phaseClass = /^l[123]$/i.test(modal.phase) ? ` phase-${modal.phase.toLowerCase()}` : '';
    return html`
      <div class="note-backdrop" @click=${this._closeNote}>
        <div
          class="note-panel"
          role="dialog"
          aria-modal="true"
          aria-label="Circuit note"
          @click=${(event: Event) => event.stopPropagation()}
        >
          <div class="note-head">
            <div class="note-copy">
              ${modal.phase || modal.ct
                ? html`
                  <div class="note-badges">
                    ${modal.phase ? html`<span class="note-badge${phaseClass}">${modal.phase}</span>` : nothing}
                    ${modal.ct ? html`<span class="note-badge">CT ${modal.ct}</span>` : nothing}
                  </div>
                `
                : nothing}
              ${modal.title ? html`<div class="note-title">${modal.title}</div>` : nothing}
            </div>
            <button class="note-close" type="button" @click=${this._closeNote}>Close</button>
          </div>
          <div class="note-body">${modal.note}</div>
        </div>
      </div>
    `;
  }

  private _startHold(entityId: string): void {
    this._cancelHold();
    this._clearHoldReset();
    this._holdTriggered = false;
    this._pendingNote = undefined;
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

  private _handleTileClick(entityId: string, tile?: CurrentMonitorTileConfig, inModal = false): void {
    if (this._holdTriggered) {
      this._clearHoldReset();
      this._holdTriggered = false;
      this._pendingNote = undefined;
      return;
    }
    if (this._pendingNote) {
      const pending = this._pendingNote;
      this._pendingNote = undefined;
      this._openNote(pending.title, pending.phase, pending.ct, pending.note);
      return;
    }
    if (!inModal && tile?.aggregator === true) {
      const phase = tile.phase?.trim() || '';
      if (phase) {
        this._openAggregator(phase);
        return;
      }
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
      font-weight: 800;
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

    .meta-note {
      position: absolute;
      bottom: var(--tile-padding);
      left: var(--tile-padding);
      right: var(--tile-padding);
      display: -webkit-box;
      overflow: hidden;
      color: var(--secondary-text-color);
      font-size: clamp(8px, 7.5cqw, 11px);
      font-weight: 600;
      line-height: 1.15;
      text-align: center;
      -webkit-box-orient: vertical;
      -webkit-line-clamp: 2;
      pointer-events: auto;
      cursor: pointer;
      touch-action: manipulation;
    }

    .meta-note:hover {
      color: var(--primary-text-color);
      text-decoration: underline;
      text-decoration-style: dotted;
    }

    .note-backdrop {
      position: fixed;
      inset: 0;
      z-index: 2147483647;
      display: grid;
      place-items: center;
      padding: 16px;
      background: rgba(0, 0, 0, 0.48);
    }

    .note-panel {
      width: min(92vw, 420px);
      max-height: min(82vh, 560px);
      overflow: auto;
      padding: 16px;
      border-radius: var(--tile-border-radius);
      background: var(--ha-card-background, var(--card-background-color));
      box-shadow: 0 22px 52px rgba(0, 0, 0, 0.36);
      color: var(--primary-text-color);
    }

    .note-head {
      display: grid;
      grid-template-columns: minmax(0, 1fr) auto;
      gap: 10px;
      align-items: flex-start;
      margin-bottom: 12px;
    }

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
      font-weight: 800;
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

    .note-title {
      color: var(--primary-text-color);
      font-size: 20px;
      font-weight: 800;
      line-height: 1.15;
    }

    .note-body {
      color: var(--primary-text-color);
      font-size: 15px;
      font-weight: 500;
      line-height: 1.45;
      white-space: pre-wrap;
      overflow-wrap: anywhere;
    }

    .note-close {
      flex: 0 0 auto;
      padding: 6px 12px;
      border: 0;
      border-radius: var(--chip-border-radius, 8px);
      background: var(--secondary-background-color, rgba(128, 128, 128, 0.16));
      color: var(--primary-text-color);
      font: inherit;
      font-weight: 700;
      cursor: pointer;
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

    .agg-panel {
      width: min(96vw, 760px);
      max-height: min(86vh, 720px);
      overflow: auto;
      padding: 16px;
      border-radius: var(--tile-border-radius);
      background: var(--ha-card-background, var(--card-background-color));
      box-shadow: 0 22px 52px rgba(0, 0, 0, 0.36);
      color: var(--primary-text-color);
    }

    .agg-panel .tiles {
      isolation: isolate;
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

      .meta-note {
        bottom: var(--small-gap);
        left: var(--small-gap);
        right: var(--small-gap);
        font-size: clamp(6px, 11cqw, 10px);
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

      .unit {
        font-size: 0.4em;
      }
    }

    @container (max-width: 34px) {
      .meter {
        gap: 0;
      }

      .meta-name {
        font-size: clamp(6px, 16cqw, 9px);
      }

      .meta-note {
        -webkit-line-clamp: 1;
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
    description: `Configurable multi-sensor current meter with up to ${MAX_TILES} ordered tiles.`,
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
