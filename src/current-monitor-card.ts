import { LitElement, TemplateResult, html, nothing } from 'lit';
import { currentMonitorStyles } from './styles/card';
import { repeat } from 'lit/directives/repeat.js';
import { designTokens } from './shared/design-tokens';
import { familyStyles, dialogStyles, componentStyles, FamilyFlowController, renderFamilyDialog, stateChip, showEntityMoreInfo, buildGlow, tileGlow, glowStyles } from '@bitosome/ha-card-ui';
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

  private _aggregatorPhase?: string;

  private _flow = new FamilyFlowController<'phase' | 'note'>(this, {
    onChange: (route) => { if (route === 'phase') this._noteModal = undefined; },
    onClose: () => { this._noteModal = undefined; this._aggregatorPhase = undefined; },
  });

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
        ${this._renderDialog()}
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
        ${tileGlow(buildGlow({ weak: 'color-mix(in srgb,var(--status-alert-color) 16%,transparent)', strong: 'color-mix(in srgb,var(--status-alert-color) 30%,transparent)' }, 'static', reading.alert))}
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
          </span>
        </button>
        ${note ? html`<button class="note-trigger" type="button" aria-label=${`Show note for ${displayName || name}`}
          @click=${() => this._openNote(displayName || name, phase, currentTransformer, note)}><span>${note}</span></button>` : nothing}
      </div>
    `;
  }

  private _openMoreInfo(entityId: string): void {
    if (entityId) this._flow.handoff(() => showEntityMoreInfo(this, entityId));
  }

  private _openNote(title: string, phase: string, ct: string, note: string): void {
    this._noteModal = { title, phase, ct, note };
    if (this._flow.active) this._flow.push('note');
    else this._flow.open('note');
  }

  private _openAggregator(phase: string): void {
    this._aggregatorPhase = phase;
    this._flow.open('phase');
  }

  private _renderDialog() {
    if (this._flow.current === 'note' && this._noteModal) {
      const modal = this._noteModal;
      return renderFamilyDialog(this._flow, {
        title: modal.title || 'Circuit note', className: 'note-panel',
        content: html`<div class="note-badges">${modal.phase ? stateChip({label: modal.phase}) : nothing}${modal.ct ? stateChip({label: `CT ${modal.ct}`}) : nothing}</div><div class="note-body">${modal.note}</div>`,
      });
    }
    const phase = this._aggregatorPhase;
    if (!phase || !this._config) return nothing;
    const config = this._config;
    const phaseTiles = config.tiles.map((tile, index) => ({tile,index})).filter(({tile}) => (tile.phase?.trim() || '').toLowerCase() === phase.toLowerCase() && tile.aggregator !== true);
    const columns = Math.min(config.columns, Math.max(1, phaseTiles.length));
    return renderFamilyDialog(this._flow, {
      title: `Phase ${phase} · ${phaseTiles.length} ${phaseTiles.length === 1 ? 'circuit' : 'circuits'}`,
      className: 'agg-panel', wide: true,
      content: html`<div class="tiles" style=${`--cmc-columns:${columns}`} role="list">${repeat(phaseTiles, ({index}) => `agg-${index}`, ({tile,index}) => this._renderTile(tile,index,config,true))}</div>`,
    });
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

  private _handleTileClick(entityId: string, tile?: CurrentMonitorTileConfig, inModal = false): void {
    if (this._holdTriggered) {
      this._clearHoldReset();
      this._holdTriggered = false;
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

  static styles = [designTokens, familyStyles, dialogStyles, componentStyles, glowStyles, currentMonitorStyles];
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
