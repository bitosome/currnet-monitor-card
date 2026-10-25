import { LitElement, TemplateResult, html, nothing } from 'lit';
import { currentMonitorStyles } from './styles/card';
import { repeat } from 'lit/directives/repeat.js';
import { designTokens } from './shared/design-tokens';
import { familyStyles, dialogStyles, dialogClose, showFamilyDialog, closeFamilyDialog, disposeFamilyDialog } from './shared/card-primitives';
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

  private _aggregatorPhase?: string;

  private _dialogOpener?: HTMLElement;

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
    this.renderRoot.querySelectorAll<HTMLDialogElement>('dialog').forEach(disposeFamilyDialog);
    super.disconnectedCallback();
  }

  protected updated(): void {
    const dialog = this.renderRoot.querySelector<HTMLDialogElement>('dialog');
    if (dialog && !dialog.open) {
      showFamilyDialog(dialog, {
        opener: this._dialogOpener,
        initialFocus: dialog.querySelector<HTMLElement>('[tabindex="-1"]'),
        onBackdrop: this._closeDialog,
      });
    }
  }

  private _captureDialogOpener(): void {
    const active = (this.renderRoot as ShadowRoot).activeElement;
    if (active instanceof HTMLElement && !active.closest('dialog')) this._dialogOpener = active;
  }

  private async _restoreFallbackFocus(): Promise<void> {
    await this.updateComplete;
    if (!this._noteModal && !this._aggregatorPhase && !this._dialogOpener?.isConnected) {
      this.renderRoot.querySelector<HTMLElement>('.tile')?.focus({ preventScroll: true });
    }
  }

  private _closeDialog = (): void => {
    if (this._noteModal) this._closeNote();
    else this._closeAggregator();
  };

  private _cancelDialog = (event: Event): void => {
    event.preventDefault();
    this._closeDialog();
  };

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
        ${this._aggregatorPhase && !this._noteModal ? this._renderAggregatorModal() : nothing}
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
          </span>
        </button>
        ${note ? html`<button class="note-trigger" type="button" aria-label=${`Show note for ${displayName || name}`}
          @click=${() => this._openNote(displayName || name, phase, currentTransformer, note)}><span>${note}</span></button>` : nothing}
      </div>
    `;
  }

  private _openMoreInfo(entityId: string): void {
    if (!entityId) return;
    this.renderRoot.querySelectorAll<HTMLDialogElement>('dialog').forEach(closeFamilyDialog);
    this._noteModal = undefined;
    this._aggregatorPhase = undefined;
    fireEvent(this, 'hass-more-info', { entityId });
  }

  private _openNote(title: string, phase: string, ct: string, note: string): void {
    this._captureDialogOpener();
    this.renderRoot.querySelectorAll<HTMLDialogElement>('dialog').forEach(disposeFamilyDialog);
    this._noteModal = { title, phase, ct, note };
  }

  private _closeNote = (): void => {
    if (!this._noteModal) return;
    const dialog = this.renderRoot.querySelector<HTMLDialogElement>('dialog');
    // Return to the phase view if the note was opened from it. Only the final
    // dismissal returns focus to the dashboard; no competing top-layer traps.
    if (this._aggregatorPhase) disposeFamilyDialog(dialog);
    else closeFamilyDialog(dialog);
    this._noteModal = undefined;
    void this._restoreFallbackFocus();
  };

  private _openAggregator(phase: string): void {
    this._captureDialogOpener();
    this._aggregatorPhase = phase;
  }

  private _closeAggregator = (): void => {
    if (this._aggregatorPhase === undefined) return;
    closeFamilyDialog(this.renderRoot.querySelector<HTMLDialogElement>('dialog'));
    this._aggregatorPhase = undefined;
    void this._restoreFallbackFocus();
  };

  private _renderAggregatorModal(): TemplateResult {
    const phase = this._aggregatorPhase;
    if (!phase || !this._config) return html``;
    const config = this._config;
    const phaseTiles = config.tiles
      .map((tile, index) => ({ tile, index }))
      .filter(
        ({ tile }) =>
          (tile.phase?.trim() || '').toLowerCase() === phase.toLowerCase() && tile.aggregator !== true,
      );
    const columns = Math.min(config.columns, Math.max(1, phaseTiles.length));
    const phaseClass = /^l[123]$/i.test(phase) ? ` phase-${phase.toLowerCase()}` : '';
    return html`
      <dialog class="family-dialog agg-panel" aria-labelledby="phase-title" @cancel=${this._cancelDialog}>
          <div class="family-dialog-header">
            <div class="note-copy">
              <div class="note-badges">
                <span class="note-badge${phaseClass}">${phase}</span>
              </div>
              <h2 id="phase-title" tabindex="-1">${phaseTiles.length} ${phaseTiles.length === 1 ? 'circuit' : 'circuits'}</h2>
            </div>
            ${dialogClose(`Close phase ${phase} circuits`, this._closeAggregator)}
          </div>
          <div class="family-dialog-body"><div class="tiles" style=${`--cmc-columns:${columns}`} role="list">
            ${repeat(
              phaseTiles,
              ({ index }) => `agg-${index}`,
              ({ tile, index }) => this._renderTile(tile, index, config, true),
            )}
          </div></div>
      </dialog>
    `;
  }

  private _renderNoteModal(): TemplateResult {
    const modal = this._noteModal;
    if (!modal) return html``;
    const phaseClass = /^l[123]$/i.test(modal.phase) ? ` phase-${modal.phase.toLowerCase()}` : '';
    return html`
      <dialog class="family-dialog note-panel" aria-labelledby="note-title" @cancel=${this._cancelDialog}>
          <div class="family-dialog-header">
            <div class="note-copy">
              ${modal.phase || modal.ct
                ? html`
                  <div class="note-badges">
                    ${modal.phase ? html`<span class="note-badge${phaseClass}">${modal.phase}</span>` : nothing}
                    ${modal.ct ? html`<span class="note-badge">CT ${modal.ct}</span>` : nothing}
                  </div>
                `
                : nothing}
              <h2 id="note-title" tabindex="-1">${modal.title || 'Circuit note'}</h2>
            </div>
            ${dialogClose('Close circuit note', this._closeNote)}
          </div>
          <div class="family-dialog-body note-body">${modal.note}</div>
      </dialog>
    `;
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

  static styles = [designTokens, familyStyles, dialogStyles, currentMonitorStyles];
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
