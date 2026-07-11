import { Window } from 'happy-dom';

const win = new Window({ url: 'http://localhost/' });
for (const key of [
  'window', 'document', 'Document', 'DocumentFragment', 'customElements',
  'HTMLElement', 'HTMLInputElement', 'Element', 'Node', 'ShadowRoot', 'Event',
  'CustomEvent', 'MouseEvent', 'KeyboardEvent', 'CSSStyleSheet', 'getComputedStyle',
]) {
  try {
    globalThis[key] = win[key];
  } catch {
    // Some runtime globals may be read-only.
  }
}
globalThis.requestAnimationFrame = (callback) => setTimeout(() => callback(Date.now()), 0);

const wait = (milliseconds = 40) => new Promise((resolve) => setTimeout(resolve, milliseconds));
const checks = [];
const check = (name, condition) => {
  checks.push([name, Boolean(condition)]);
  console.log(`${condition ? 'PASS' : 'FAIL'}: ${name}`);
};

await import('../dist/current-monitor-card.js');

const Card = customElements.get('current-monitor-card');
const Editor = customElements.get('current-monitor-card-editor');
check('card element registers', Boolean(Card));
check('editor element registers', Boolean(Editor));
check(
  'card picker metadata registers once',
  window.customCards?.filter((entry) => entry.type === 'current-monitor-card').length === 1,
);

const stub = Card.getStubConfig();
check('stub contains three ordered tiles', stub.tiles?.length === 3 && stub.columns === 3);
check('getConfigElement returns the visual editor', (await Card.getConfigElement()).tagName === 'CURRENT-MONITOR-CARD-EDITOR');

const values = [-1, 0, 6000, 2, 6, 10, 14, 16, 17, 'unknown', 'unavailable', 4, 8, 12];
const tiles = Array.from({ length: 33 }, (_, index) => ({
  entity: `sensor.current_${index + 1}`,
  name: `Circuit ${index + 1}`,
}));
const states = Object.fromEntries(tiles.map((tile, index) => [
  tile.entity,
  {
    state: String(values[index % values.length]),
    attributes: {
      friendly_name: `Current ${index + 1}`,
      unit_of_measurement: index === 2 ? 'mA' : 'A',
      device_class: 'current',
    },
  },
]));

const card = document.createElement('current-monitor-card');
card.setConfig({
  type: 'custom:current-monitor-card',
  name: 'Electrical currents',
  columns: 11,
  decimal_places: 1,
  limits: { green: 4, yellow: 8, orange: 12, alert: 16 },
  tiles,
});
card.hass = { states };
document.body.appendChild(card);
await wait(80);

const cardRoot = card.shadowRoot;
const renderedTiles = cardRoot?.querySelectorAll('.tile') || [];
check('all 33 configured tiles render', renderedTiles.length === 33);
check('configured columns reach the CSS grid', cardRoot?.querySelector('.tiles')?.getAttribute('style')?.includes('--cmc-columns:11'));
check('6000 mA is compared as 6 A', cardRoot?.querySelector('[data-index="2"]')?.querySelectorAll('.segment.active').length === 2);
check('2 A activates one segment', cardRoot?.querySelector('[data-index="3"]')?.querySelectorAll('.segment.active').length === 1);
check('14 A activates all four segments', cardRoot?.querySelector('[data-index="6"]')?.querySelectorAll('.segment.active').length === 4);
check('16 A is steady red', !cardRoot?.querySelector('[data-index="7"]')?.classList.contains('alert'));
check('values above 16 A alert', cardRoot?.querySelector('[data-index="8"]')?.classList.contains('alert'));
check('alert state is included in the accessible name', cardRoot?.querySelector('[data-index="8"]')?.getAttribute('aria-label')?.includes('alert'));
check('unknown states use unavailable presentation', cardRoot?.querySelector('[data-index="9"]')?.classList.contains('unavailable'));
check('unavailable states use unavailable presentation', cardRoot?.querySelector('[data-index="10"]')?.classList.contains('unavailable'));
check('entity unit is displayed', cardRoot?.querySelector('[data-index="2"] .unit')?.textContent === 'mA');
check('exact 4 A stays at level one', cardRoot?.querySelector('[data-index="11"]')?.getAttribute('data-meter-level') === '1');
check('exact 8 A stays at level two', cardRoot?.querySelector('[data-index="12"]')?.getAttribute('data-meter-level') === '2');
check('exact 12 A stays at level three', cardRoot?.querySelector('[data-index="13"]')?.getAttribute('data-meter-level') === '3');
check('dense card size accounts for rows', card.getCardSize() === 4);

const singleColumnCard = document.createElement('current-monitor-card');
singleColumnCard.setConfig({ columns: 1, tiles: tiles.slice(0, 2) });
check('single-column card size accounts for square tiles', singleColumnCard.getCardSize() === 16);

const moreInfoEntities = [];
card.addEventListener('hass-more-info', (event) => {
  moreInfoEntities.push(event.detail.entityId);
});
cardRoot?.querySelector('[data-index="3"]')?.dispatchEvent(new win.MouseEvent('click', { bubbles: true, composed: true }));
check('tile tap opens the matching more-info entity', moreInfoEntities.at(-1) === 'sensor.current_4');

const holdTile = cardRoot?.querySelector('[data-index="4"]');
holdTile?.dispatchEvent(new win.Event('pointerdown', { bubbles: true, composed: true }));
await wait(540);
holdTile?.dispatchEvent(new win.Event('pointerup', { bubbles: true, composed: true }));
holdTile?.dispatchEvent(new win.MouseEvent('click', { bubbles: true, composed: true }));
check(
  'tile hold opens more-info once',
  moreInfoEntities.filter((entityId) => entityId === 'sensor.current_5').length === 1,
);

const convertedUnitCard = document.createElement('current-monitor-card');
convertedUnitCard.setConfig({
  decimal_places: 1,
  tiles: [{ entity: 'sensor.current_3', name: 'Converted', unit: 'A' }],
});
convertedUnitCard.hass = { states };
document.body.appendChild(convertedUnitCard);
await wait();
check(
  'recognized unit overrides convert the displayed value',
  convertedUnitCard.shadowRoot?.querySelector('.reading')?.textContent === '6.0'
    && convertedUnitCard.shadowRoot?.querySelector('.unit')?.textContent === 'A'
    && convertedUnitCard.shadowRoot?.querySelector('.tile')?.getAttribute('data-meter-level') === '2',
);

const invalidCard = document.createElement('current-monitor-card');
invalidCard.setConfig({
  tiles: [{ entity: 'sensor.current_1' }],
  limits: { green: 8, yellow: 4, orange: 12, alert: 16 },
});
invalidCard.hass = { states };
document.body.appendChild(invalidCard);
await wait();
check('invalid limit order renders a configuration error', Boolean(invalidCard.shadowRoot?.querySelector('.configuration-error')));

let tooManyRejected = false;
try {
  const oversized = document.createElement('current-monitor-card');
  oversized.setConfig({ tiles: Array.from({ length: 34 }, () => ({})) });
} catch {
  tooManyRejected = true;
}
check('more than 33 tiles is rejected', tooManyRejected);

const sourceConfig = {
  type: 'custom:current-monitor-card',
  columns: 2,
  tiles: [
    { entity: 'sensor.first', name: 'First' },
    { entity: 'sensor.second', name: 'Second' },
    { entity: 'sensor.third', name: 'Third' },
  ],
};
const editor = document.createElement('current-monitor-card-editor');
editor.setConfig(sourceConfig);
editor.hass = {
  states: {
    'sensor.first': { state: '1', attributes: { friendly_name: 'First current' } },
    'sensor.second': { state: '2', attributes: { friendly_name: 'Second current' } },
    'sensor.third': { state: '3', attributes: { friendly_name: 'Third current' } },
  },
};
const emittedConfigs = [];
editor.addEventListener('config-changed', (event) => emittedConfigs.push(event.detail.config));
document.body.appendChild(editor);
await wait(80);

const editorColumnsInput = editor.shadowRoot?.querySelector('input[type="number"]');
if (editorColumnsInput) {
  editorColumnsInput.value = '5';
  editorColumnsInput.dispatchEvent(new win.Event('input', { bubbles: true, composed: true }));
}
await wait();
check('editor layout values update live', emittedConfigs.at(-1)?.columns === 5);

editor.shadowRoot?.querySelector('[data-action="move-down"][data-index="0"]')?.click();
await wait();
check('editor arrow buttons reorder tiles', emittedConfigs.at(-1)?.tiles?.[0]?.name === 'Second');
check(
  'editor preserves focus on the moved tile',
  editor.shadowRoot?.activeElement?.getAttribute('data-action') === 'move-down'
    && editor.shadowRoot?.activeElement?.getAttribute('data-index') === '1',
);
editor.shadowRoot?.activeElement?.click();
await wait();
check('repeated keyboard reorder keeps moving the same tile', emittedConfigs.at(-1)?.tiles?.[2]?.name === 'First');
check('editor changes do not mutate the supplied config', sourceConfig.tiles[0].name === 'First');

editor.shadowRoot?.querySelector('[data-action="add-tile"]')?.click();
await wait();
check('editor can add tiles', emittedConfigs.at(-1)?.tiles?.length === 4);

const firstEntityForm = editor.shadowRoot?.querySelector('ha-form');
firstEntityForm?.dispatchEvent(new win.CustomEvent('value-changed', {
  detail: { value: { entity: 'sensor.replacement' } },
  bubbles: true,
  composed: true,
}));
await wait();
check('entity selector updates the selected tile', emittedConfigs.at(-1)?.tiles?.[0]?.entity === 'sensor.replacement');

editor.shadowRoot?.querySelector('[data-action="remove"][data-index="3"]')?.click();
await wait();
check('editor can remove tiles', emittedConfigs.at(-1)?.tiles?.length === 3);

const maxEditor = document.createElement('current-monitor-card-editor');
maxEditor.setConfig({ tiles: Array.from({ length: 33 }, (_, index) => ({ name: `Tile ${index + 1}` })) });
document.body.appendChild(maxEditor);
await wait(80);
check('add button is disabled at 33 tiles', maxEditor.shadowRoot?.querySelector('[data-action="add-tile"]')?.disabled === true);

const failed = checks.filter(([, passed]) => !passed);
console.log(failed.length ? `\n${failed.length} SMOKE TEST(S) FAILED` : '\nSMOKE TEST OK');
process.exit(failed.length ? 1 : 0);
