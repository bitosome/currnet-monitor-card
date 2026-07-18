import { LitElement, TemplateResult, css, html } from 'lit';
import { designTokens } from './shared/design-tokens';
import {
  CARD_TYPE,
  DEFAULT_LIMITS,
  MAX_DECIMAL_PLACES,
  MAX_TILES,
  clampInteger,
  cloneConfig,
  createStubConfig,
  limitsValidationError,
  normalizeLimits,
} from './config';
import type {
  CurrentMonitorCardConfig,
  CurrentMonitorLimits,
  CurrentMonitorTileConfig,
  HomeAssistant,
} from './types';

interface HaFormValueChangedEvent extends CustomEvent {
  detail: {
    value?: {
      entity?: string;
    };
  };
}

interface SortableItemMovedEvent extends CustomEvent {
  detail: {
    oldIndex: number;
    newIndex: number;
  };
}

interface CardHelpersWindow extends Window {
  loadCardHelpers?: () => Promise<{
    createCardElement?: (config: Record<string, unknown>) => Promise<unknown> | unknown;
  }>;
}

export class CurrentMonitorCardEditor extends LitElement {
  public hass?: HomeAssistant;

  private _config: CurrentMonitorCardConfig = createStubConfig();

  private _haElementsRequested = false;

  static properties = {
    hass: { attribute: false },
    _config: { state: true },
  };

  public setConfig(config: CurrentMonitorCardConfig): void {
    const next = cloneConfig(config || {});
    next.type = CARD_TYPE;
    if (!Array.isArray(next.tiles)) next.tiles = [];
    this._config = next;
  }

  public connectedCallback(): void {
    super.connectedCallback();
    void this._loadHaElements();
  }

  private async _loadHaElements(): Promise<void> {
    if (this._haElementsRequested) return;
    this._haElementsRequested = true;

    try {
      const helpers = await (window as CardHelpersWindow).loadCardHelpers?.();
      await helpers?.createCardElement?.({ type: 'entities', entities: [] });
    } catch {
      // HA form elements are lazy-loaded. The editor can still render while they load.
    }

    const definitions = ['ha-form', 'ha-icon', 'ha-sortable'];
    await Promise.all(definitions.map((tag) => Promise.race([
      customElements.whenDefined(tag),
      new Promise<void>((resolve) => window.setTimeout(resolve, 1500)),
    ])));
    this.requestUpdate();
  }

  protected render(): TemplateResult {
    const tiles = this._config.tiles || [];
    const limits = normalizeLimits(this._config.limits);
    const validationError = limitsValidationError(limits);
    const columns = clampInteger(this._config.columns, 1, MAX_TILES, 3);
    const decimalPlaces = clampInteger(this._config.decimal_places, 0, MAX_DECIMAL_PLACES, 1);

    return html`
      <div class="editor">
        <section class="panel" aria-labelledby="layout-heading">
          <h3 id="layout-heading">Layout</h3>
          <div class="form-grid">
            ${this._textField(
              'Card title (optional)',
              this._config.name || '',
              (value) => this._setRootValue('name', value || undefined),
            )}
            ${this._numberField(
              'Tiles per row',
              columns,
              1,
              MAX_TILES,
              (value) => this._setRootValue('columns', clampInteger(value, 1, MAX_TILES, 3)),
            )}
            ${this._numberField(
              'Decimal places',
              decimalPlaces,
              0,
              MAX_DECIMAL_PLACES,
              (value) => this._setRootValue(
                'decimal_places',
                clampInteger(value, 0, MAX_DECIMAL_PLACES, 1),
              ),
            )}
            ${this._textField(
              'Default unit (optional)',
              this._config.unit || '',
              (value) => this._setRootValue('unit', value || undefined),
              'Uses each entity unit, then A',
            )}
          </div>
        </section>

        <section class="panel" aria-labelledby="limits-heading">
          <h3 id="limits-heading">Meter limits (A)</h3>
          <p class="hint">Segments are cumulative. Alert blinking begins above the alert limit.</p>
          <div class="limits-grid">
            ${this._limitField('Green', 'green', limits.green)}
            ${this._limitField('Yellow', 'yellow', limits.yellow)}
            ${this._limitField('Orange', 'orange', limits.orange)}
            ${this._limitField('Alert', 'alert', limits.alert)}
          </div>
          ${validationError ? html`<div class="validation-error" role="alert">${validationError}</div>` : ''}
        </section>

        <section class="panel" aria-labelledby="tiles-heading">
          <div class="section-heading">
            <div>
              <h3 id="tiles-heading">Tiles <span>${tiles.length}/${MAX_TILES}</span></h3>
              <p class="hint">Add, remove, drag, or use the arrow buttons to set display order.</p>
            </div>
            <button
              class="action-button primary"
              type="button"
              data-action="add-tile"
              ?disabled=${tiles.length >= MAX_TILES}
              @click=${this._addTile}
            >
              <ha-icon icon="mdi:plus"></ha-icon>
              Add tile
            </button>
          </div>

          ${tiles.length === 0
            ? html`<div class="empty-state">Add a tile, then choose a current sensor.</div>`
            : html`
              <ha-sortable
                handle-selector=".drag-handle"
                @item-moved=${this._itemMoved}
              >
                <div class="tile-list">
                  ${tiles.map((tile, index) => this._renderTile(tile, index, tiles.length))}
                </div>
              </ha-sortable>
            `}
        </section>
      </div>
    `;
  }

  private _renderTile(tile: CurrentMonitorTileConfig, index: number, tileCount: number): TemplateResult {
    const friendlyName = tile.entity
      ? String(this.hass?.states?.[tile.entity]?.attributes?.friendly_name || '')
      : '';
    const heading = tile.name?.trim() || friendlyName || `Tile ${index + 1}`;

    return html`
      <article class="tile-editor" data-tile-index=${index}>
        <div class="tile-heading">
          <span
            class="drag-handle"
            role="img"
            aria-label="Drag ${heading} to reorder"
            title="Drag to reorder"
          >
            <ha-icon icon="mdi:drag"></ha-icon>
          </span>
          <div class="tile-summary">
            <strong>${heading}</strong>
            <span>${tile.entity || 'No sensor selected'}</span>
          </div>
          <div class="tile-actions">
            ${this._iconButton('mdi:arrow-up', `Move ${heading} up`, 'move-up', index, index === 0)}
            ${this._iconButton(
              'mdi:arrow-down',
              `Move ${heading} down`,
              'move-down',
              index,
              index === tileCount - 1,
            )}
            ${this._iconButton('mdi:delete', `Remove ${heading}`, 'remove', index, false, true)}
          </div>
        </div>

        <ha-form
          .hass=${this.hass}
          .data=${{ entity: tile.entity || '' }}
          .schema=${[{
            name: 'entity',
            selector: {
              entity: {
                filter: [{ domain: 'sensor' }],
              },
            },
          }]}
          .computeLabel=${() => 'Current sensor'}
          @value-changed=${(event: HaFormValueChangedEvent) => {
            event.stopPropagation();
            this._updateTile(index, { entity: event.detail.value?.entity || undefined });
          }}
        ></ha-form>

        <div class="form-grid tile-fields">
          ${this._textField(
            'Name (optional)',
            tile.name || '',
            (value) => this._updateTile(index, { name: value || undefined }),
            friendlyName || `Tile ${index + 1}`,
          )}
          ${this._textField(
            'Phase (optional)',
            tile.phase || '',
            (value) => this._updateTile(index, { phase: value || undefined }),
            'e.g. L1',
          )}
          ${this._textField(
            'Current transformer (optional)',
            tile.current_transformer || '',
            (value) => this._updateTile(index, { current_transformer: value || undefined }),
            'e.g. CT1',
          )}
          ${this._textField(
            'Display unit override (optional)',
            tile.unit || '',
            (value) => this._updateTile(index, { unit: value || undefined }),
            this._config.unit || 'Entity unit or A',
          )}
          ${this._textField(
            'Note (optional)',
            tile.note || '',
            (value) => this._updateTile(index, { note: value || undefined }),
            'Devices on this circuit breaker',
          )}
        </div>
      </article>
    `;
  }

  private _iconButton(
    icon: string,
    label: string,
    action: 'move-up' | 'move-down' | 'remove',
    index: number,
    disabled: boolean,
    danger = false,
  ): TemplateResult {
    return html`
      <button
        class="icon-button ${danger ? 'danger' : ''}"
        type="button"
        data-action=${action}
        data-index=${index}
        aria-label=${label}
        title=${label}
        ?disabled=${disabled}
        @click=${() => {
          if (action === 'remove') this._removeTile(index);
          else this._moveTile(index, action === 'move-up' ? -1 : 1, action);
        }}
      >
        <ha-icon icon=${icon}></ha-icon>
      </button>
    `;
  }

  private _textField(
    label: string,
    value: string,
    onInput: (value: string) => void,
    placeholder = '',
  ): TemplateResult {
    return html`
      <label class="field">
        <span>${label}</span>
        <input
          type="text"
          .value=${value}
          placeholder=${placeholder}
          @input=${(event: Event) => onInput((event.currentTarget as HTMLInputElement).value)}
        />
      </label>
    `;
  }

  private _numberField(
    label: string,
    value: number,
    min: number,
    max: number,
    onChange: (value: number) => void,
  ): TemplateResult {
    return html`
      <label class="field">
        <span>${label}</span>
        <input
          type="number"
          .value=${String(value)}
          min=${min}
          max=${max}
          step="1"
          @input=${(event: Event) => {
            const raw = (event.currentTarget as HTMLInputElement).value;
            if (raw !== '') onChange(Number(raw));
          }}
        />
      </label>
    `;
  }

  private _limitField(label: string, key: keyof CurrentMonitorLimits, value: number): TemplateResult {
    return html`
      <label class="field limit-field ${key}">
        <span><i aria-hidden="true"></i>${label}</span>
        <input
          type="number"
          .value=${String(value)}
          min="0"
          step="0.1"
          @input=${(event: Event) => {
            const input = event.currentTarget as HTMLInputElement;
            if (input.value !== '') this._setLimit(key, Number(input.value));
          }}
        />
      </label>
    `;
  }

  private _setRootValue(key: keyof CurrentMonitorCardConfig, value: unknown): void {
    const next = cloneConfig(this._config);
    const writable = next as unknown as Record<string, unknown>;
    if (value === undefined || value === '') delete writable[key];
    else writable[key] = value;
    this._commit(next);
  }

  private _setLimit(key: keyof CurrentMonitorLimits, value: number): void {
    if (!Number.isFinite(value)) return;
    const next = cloneConfig(this._config);
    next.limits = { ...(next.limits || DEFAULT_LIMITS), [key]: value };
    this._commit(next);
  }

  private _updateTile(index: number, patch: Partial<CurrentMonitorTileConfig>): void {
    const next = cloneConfig(this._config);
    const tiles = [...(next.tiles || [])];
    if (!tiles[index]) return;
    const updated = { ...tiles[index], ...patch };
    for (const [key, value] of Object.entries(updated)) {
      if (value === undefined || value === '') delete (updated as Record<string, unknown>)[key];
    }
    tiles[index] = updated;
    next.tiles = tiles;
    this._commit(next);
  }

  private _addTile = (): void => {
    const next = cloneConfig(this._config);
    const tiles = [...(next.tiles || [])];
    if (tiles.length >= MAX_TILES) return;
    tiles.push({});
    next.tiles = tiles;
    this._commit(next);
  };

  private _removeTile(index: number): void {
    const next = cloneConfig(this._config);
    const tiles = [...(next.tiles || [])];
    if (index < 0 || index >= tiles.length) return;
    tiles.splice(index, 1);
    next.tiles = tiles;
    this._commit(next);
  }

  private _moveTile(index: number, delta: -1 | 1, action: 'move-up' | 'move-down'): void {
    const nextIndex = index + delta;
    if (!this._moveTileTo(index, nextIndex)) return;
    void this.updateComplete.then(() => {
      const selector = `[data-action="${action}"][data-index="${nextIndex}"]`;
      this.shadowRoot?.querySelector<HTMLButtonElement>(selector)?.focus();
    });
  }

  private _moveTileTo(oldIndex: number, newIndex: number): boolean {
    const next = cloneConfig(this._config);
    const tiles = [...(next.tiles || [])];
    if (oldIndex < 0 || oldIndex >= tiles.length || newIndex < 0 || newIndex >= tiles.length) return false;
    const [moved] = tiles.splice(oldIndex, 1);
    tiles.splice(newIndex, 0, moved);
    next.tiles = tiles;
    this._commit(next);
    return true;
  }

  private _itemMoved = (event: SortableItemMovedEvent): void => {
    event.stopPropagation();
    this._moveTileTo(event.detail.oldIndex, event.detail.newIndex);
  };

  private _commit(config: CurrentMonitorCardConfig): void {
    config.type = CARD_TYPE;
    this._config = config;
    this.dispatchEvent(new CustomEvent('config-changed', {
      detail: { config: cloneConfig(config) },
      bubbles: true,
      composed: true,
    }));
  }

  static styles = [designTokens, css`
    :host {
      color: var(--primary-text-color);
      font-family: var(--paper-font-body1_-_font-family, Roboto, sans-serif);
    }

    * {
      box-sizing: border-box;
    }

    .editor {
      display: grid;
      gap: var(--large-gap);
    }

    .panel {
      display: grid;
      gap: var(--medium-gap);
      padding: var(--tile-padding-large);
      border: 1px solid var(--divider-color, rgba(128, 128, 128, 0.24));
      border-radius: var(--tile-border-radius);
      background: var(--ha-card-background, var(--card-background-color));
      box-shadow: var(--tile-shadow-default);
    }

    h3,
    p {
      margin: 0;
    }

    h3 {
      font-size: 16px;
      font-weight: 800;
      line-height: 1.2;
    }

    h3 span {
      color: var(--secondary-text-color);
      font-size: 12px;
      font-weight: 700;
    }

    .hint,
    .empty-state {
      color: var(--secondary-text-color);
      font-size: 12px;
      line-height: 1.4;
    }

    .empty-state {
      padding: var(--tile-padding-large);
      border: 1px dashed var(--divider-color, rgba(128, 128, 128, 0.32));
      border-radius: var(--tile-border-radius);
      text-align: center;
    }

    .form-grid,
    .limits-grid {
      display: grid;
      grid-template-columns: repeat(2, minmax(0, 1fr));
      gap: var(--large-gap);
    }

    .limits-grid {
      grid-template-columns: repeat(4, minmax(0, 1fr));
    }

    .field {
      display: grid;
      gap: var(--small-gap);
      min-width: 0;
      color: var(--secondary-text-color);
      font-size: 12px;
      font-weight: 700;
    }

    .field > span {
      display: flex;
      align-items: center;
      gap: var(--medium-gap);
      min-height: 18px;
    }

    input {
      width: 100%;
      min-width: 0;
      min-height: 42px;
      padding: 9px 10px;
      border: 1px solid var(--divider-color, rgba(128, 128, 128, 0.28));
      border-radius: var(--tile-border-radius);
      outline: none;
      background: var(--secondary-background-color, rgba(128, 128, 128, 0.08));
      color: var(--primary-text-color);
      font: inherit;
      font-size: 14px;
      font-weight: 500;
    }

    input:focus-visible {
      border-color: var(--primary-color);
      box-shadow: 0 0 0 1px var(--primary-color);
    }

    .limit-field i {
      width: 8px;
      height: 8px;
      border-radius: var(--chip-border-radius);
      background: var(--limit-color);
    }

    .limit-field.green { --limit-color: var(--status-success-color); }
    .limit-field.yellow { --limit-color: var(--status-dry-color); }
    .limit-field.orange { --limit-color: var(--status-warn-color); }
    .limit-field.alert { --limit-color: var(--status-alert-color); }

    .validation-error {
      padding: var(--tile-padding);
      border-radius: var(--tile-border-radius);
      background: var(--secondary-background-color, rgba(128, 128, 128, 0.12));
      background: color-mix(in srgb, var(--status-alert-color) 12%, transparent);
      color: var(--status-alert-color);
      font-size: 12px;
      font-weight: 700;
    }

    .section-heading,
    .tile-heading {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: var(--large-gap);
    }

    .section-heading > div:first-child {
      display: grid;
      gap: var(--small-gap);
    }

    .action-button,
    .icon-button {
      display: inline-flex;
      align-items: center;
      justify-content: center;
      gap: var(--medium-gap);
      border: 1px solid var(--divider-color, rgba(128, 128, 128, 0.28));
      border-radius: var(--tile-border-radius);
      background: transparent;
      color: var(--primary-color);
      font: inherit;
      cursor: pointer;
    }

    .action-button {
      min-height: 38px;
      padding: 7px 12px;
      font-size: 13px;
      font-weight: 700;
      white-space: nowrap;
    }

    .action-button:hover,
    .icon-button:hover {
      background: var(--secondary-background-color, rgba(128, 128, 128, 0.08));
    }

    button:focus-visible {
      outline: 2px solid var(--primary-color);
      outline-offset: 2px;
    }

    button:disabled {
      opacity: 0.38;
      cursor: not-allowed;
    }

    .tile-list {
      display: grid;
      gap: var(--large-gap);
    }

    .tile-editor {
      display: grid;
      gap: var(--large-gap);
      padding: var(--tile-padding-large);
      border: 1px solid var(--divider-color, rgba(128, 128, 128, 0.24));
      border-radius: var(--tile-border-radius);
      background: var(--secondary-background-color, rgba(128, 128, 128, 0.06));
    }

    .drag-handle {
      display: inline-flex;
      flex: 0 0 auto;
      align-items: center;
      justify-content: center;
      color: var(--secondary-text-color);
      cursor: grab;
      touch-action: none;
    }

    .drag-handle:active {
      cursor: grabbing;
    }

    .tile-summary {
      display: grid;
      flex: 1 1 auto;
      gap: var(--small-gap);
      min-width: 0;
    }

    .tile-summary strong,
    .tile-summary span {
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }

    .tile-summary strong {
      font-size: 14px;
    }

    .tile-summary span {
      color: var(--secondary-text-color);
      font-size: 11px;
    }

    .tile-actions {
      display: flex;
      flex: 0 0 auto;
      gap: var(--small-gap);
    }

    .icon-button {
      width: 34px;
      height: 34px;
      padding: 0;
    }

    .icon-button.danger {
      color: var(--status-alert-color);
    }

    ha-form,
    ha-sortable {
      display: block;
      width: 100%;
    }

    @media (max-width: 560px) {
      .form-grid,
      .limits-grid,
      .tile-fields {
        grid-template-columns: 1fr;
      }

      .section-heading {
        align-items: flex-start;
        flex-direction: column;
      }

      .action-button {
        width: 100%;
      }
    }
  `];
}

if (!customElements.get('current-monitor-card-editor')) {
  customElements.define('current-monitor-card-editor', CurrentMonitorCardEditor);
}

declare global {
  interface HTMLElementTagNameMap {
    'current-monitor-card-editor': CurrentMonitorCardEditor;
  }
}
