export interface HassEntity {
  state: string;
  attributes?: Record<string, unknown>;
}

export interface HomeAssistant {
  states: Record<string, HassEntity | undefined>;
  locale?: {
    language?: string;
  };
}

export interface CurrentMonitorTileConfig {
  entity?: string;
  name?: string;
  unit?: string;
  phase?: string;
  current_transformer?: string;
  note?: string;
  aggregator?: boolean;
  active?: boolean;
}

export interface CurrentMonitorLimits {
  green?: number;
  yellow?: number;
  orange?: number;
  alert?: number;
}

export interface CurrentMonitorCardConfig {
  type?: string;
  name?: string;
  columns?: number;
  decimal_places?: number;
  unit?: string;
  limits?: CurrentMonitorLimits;
  tiles?: CurrentMonitorTileConfig[];
}

export interface NormalizedCurrentMonitorCardConfig {
  type: string;
  name: string;
  columns: number;
  decimal_places: number;
  unit: string;
  limits: Required<CurrentMonitorLimits>;
  tiles: CurrentMonitorTileConfig[];
}

export type MeterLevel = 0 | 1 | 2 | 3 | 4;

export interface MeterReading {
  available: boolean;
  value?: number;
  amperes?: number;
  level: MeterLevel;
  alert: boolean;
}
