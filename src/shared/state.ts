/**
 * Shared entity-state helpers for the bitosome Home Assistant card family.
 *
 * Single source of truth for state interpretation so every card classifies
 * entity states (active / unavailable / lock / climate mode) identically.
 */

/** Canonical climate mode buckets used for coloring and glow. */
export type AcModeClass = 'off' | 'cool' | 'heat' | 'dry' | 'fan' | 'auto' | 'default';

const UNAVAILABLE_STATES = new Set(['', 'unavailable', 'unknown', 'none']);

/** True when a state string represents an unavailable/unknown entity. */
export function isStateUnavailable(state: string | null | undefined): boolean {
  return UNAVAILABLE_STATES.has(String(state ?? '').toLowerCase());
}

/** True when an entity/type represents a lock. */
export function isLockType(type?: string, entity?: string): boolean {
  return type === 'lock' || (entity?.startsWith('lock.') ?? false);
}

/** True when an entity is in an "active" state, honoring lock semantics. */
export function isEntityActive(entity: string | undefined, state: string, type?: string): boolean {
  if (!state) return false;
  if (isLockType(type, entity)) {
    return state === 'locked';
  }
  return state === 'on' || state === 'open' || state === 'opening';
}

/** Normalize a raw HVAC mode string into a canonical mode bucket. */
export function normalizeAcMode(modeRaw: string | undefined): AcModeClass {
  const mode = (modeRaw || '').toLowerCase();
  if (!mode || mode === 'off') return 'off';
  if (mode.includes('cool')) return 'cool';
  if (mode.includes('heat')) return 'heat';
  if (mode.includes('dry')) return 'dry';
  if (mode.includes('fan')) return 'fan';
  if (mode.includes('auto')) return 'auto';
  return 'default';
}

