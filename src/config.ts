import type {
  CurrentMonitorCardConfig,
  CurrentMonitorLimits,
  CurrentMonitorTileConfig,
  MeterReading,
  NormalizedCurrentMonitorCardConfig,
} from './types';
import { isStateUnavailable } from './shared/state';

export const CARD_VERSION = '0.4.0';
export const CARD_TYPE = 'custom:current-monitor-card';
export const MAX_TILES = 48;
export const MAX_DECIMAL_PLACES = 4;

export const DEFAULT_LIMITS: Required<CurrentMonitorLimits> = {
  green: 4,
  yellow: 8,
  orange: 12,
  alert: 16,
};

function finiteNumber(value: unknown, fallback: number): number {
  const parsed = typeof value === 'number' ? value : Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

export function clampInteger(value: unknown, min: number, max: number, fallback: number): number {
  const parsed = finiteNumber(value, fallback);
  return Math.max(min, Math.min(max, Math.round(parsed)));
}

export function normalizeLimits(limits?: CurrentMonitorLimits): Required<CurrentMonitorLimits> {
  return {
    green: finiteNumber(limits?.green, DEFAULT_LIMITS.green),
    yellow: finiteNumber(limits?.yellow, DEFAULT_LIMITS.yellow),
    orange: finiteNumber(limits?.orange, DEFAULT_LIMITS.orange),
    alert: finiteNumber(limits?.alert, DEFAULT_LIMITS.alert),
  };
}

export function limitsValidationError(limits: Required<CurrentMonitorLimits>): string | undefined {
  if (limits.green < 0) return 'Green limit must be zero or greater.';
  if (!(limits.green < limits.yellow && limits.yellow < limits.orange && limits.orange < limits.alert)) {
    return 'Limits must increase in this order: green < yellow < orange < alert.';
  }
  return undefined;
}

function normalizeTile(tile: unknown): CurrentMonitorTileConfig {
  if (!tile || typeof tile !== 'object' || Array.isArray(tile)) return {};
  const candidate = tile as CurrentMonitorTileConfig;
  return {
    ...(typeof candidate.entity === 'string' ? { entity: candidate.entity.trim() } : {}),
    ...(typeof candidate.name === 'string' ? { name: candidate.name } : {}),
    ...(typeof candidate.unit === 'string' ? { unit: candidate.unit } : {}),
    ...(typeof candidate.phase === 'string' ? { phase: candidate.phase } : {}),
    ...(typeof candidate.current_transformer === 'string'
      ? { current_transformer: candidate.current_transformer }
      : {}),
    ...(typeof candidate.note === 'string' ? { note: candidate.note } : {}),
  };
}

export function normalizeConfig(config: CurrentMonitorCardConfig): NormalizedCurrentMonitorCardConfig {
  const tiles = Array.isArray(config.tiles) ? config.tiles.slice(0, MAX_TILES).map(normalizeTile) : [];
  return {
    type: CARD_TYPE,
    name: typeof config.name === 'string' ? config.name : '',
    columns: clampInteger(config.columns, 1, MAX_TILES, 3),
    decimal_places: clampInteger(config.decimal_places, 0, MAX_DECIMAL_PLACES, 1),
    unit: typeof config.unit === 'string' ? config.unit : '',
    limits: normalizeLimits(config.limits),
    tiles,
  };
}

export function cloneConfig(config: CurrentMonitorCardConfig): CurrentMonitorCardConfig {
  return {
    ...config,
    ...(config.limits ? { limits: { ...config.limits } } : {}),
    ...(Array.isArray(config.tiles) ? { tiles: config.tiles.map((tile) => ({ ...tile })) } : {}),
  };
}

export function createStubConfig(): CurrentMonitorCardConfig {
  return {
    type: CARD_TYPE,
    columns: 3,
    decimal_places: 1,
    limits: { ...DEFAULT_LIMITS },
    tiles: [
      { name: 'L1' },
      { name: 'L2' },
      { name: 'L3' },
    ],
  };
}

export function currentUnitMultiplier(unit: string | undefined): number | undefined {
  const normalized = String(unit || '').trim().toLowerCase().replace('μ', 'µ');
  if (['a', 'amp', 'amps', 'ampere', 'amperes'].includes(normalized)) return 1;
  if (normalized === 'ma') return 0.001;
  if (['µa', 'ua'].includes(normalized)) return 0.000001;
  if (normalized === 'ka') return 1000;
  return undefined;
}

export function convertCurrentUnit(value: number, sourceUnit: string, targetUnit: string): number {
  const sourceMultiplier = currentUnitMultiplier(sourceUnit);
  const targetMultiplier = currentUnitMultiplier(targetUnit);
  if (sourceMultiplier === undefined || targetMultiplier === undefined) return value;
  return (value * sourceMultiplier) / targetMultiplier;
}

export function meterReading(
  state: string | undefined,
  limits: Required<CurrentMonitorLimits>,
  sourceUnit = 'A',
): MeterReading {
  if (isStateUnavailable(state)) {
    return { available: false, level: 0, alert: false };
  }

  const value = Number(state);
  if (!Number.isFinite(value)) return { available: false, level: 0, alert: false };

  // Limits are always expressed in amperes, even when an entity reports mA,
  // µA, or kA. Unknown/custom units retain the historical raw-as-A behavior.
  const amperes = value * (currentUnitMultiplier(sourceUnit) ?? 1);

  let level: MeterReading['level'] = 0;
  if (amperes >= 0 && amperes <= limits.green) level = 1;
  else if (amperes > limits.green && amperes <= limits.yellow) level = 2;
  else if (amperes > limits.yellow && amperes <= limits.orange) level = 3;
  else if (amperes > limits.orange) level = 4;

  return {
    available: true,
    value,
    amperes,
    level,
    // Match the physical ESPHome monitor: the alert begins above the threshold.
    alert: amperes > limits.alert,
  };
}
