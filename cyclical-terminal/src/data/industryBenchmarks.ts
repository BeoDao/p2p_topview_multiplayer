import type { Country, IndustryBenchmark } from '../types';

// Through-cycle industry assumptions used by normalized-earnings Method B (margin), Method C fallback
// (ROIC) and Method D fallback (scenario margins when a company has < 3 years of PIT history).
// These are analyst assumptions (model parameters), not reported data, and are shown as such in the UI.
export const INDUSTRY_BENCHMARKS: Record<string, IndustryBenchmark> = {
  iron_ore: { label: 'Iron ore / diversified miners', throughCycleMargin: 0.35, normalizedRoic: 0.15, scenario: { bear: 0.18, base: 0.35, bull: 0.5 } },
  uranium: { label: 'Uranium', throughCycleMargin: 0.15, normalizedRoic: 0.07, scenario: { bear: 0.0, base: 0.15, bull: 0.3 } },
  oil_gas: { label: 'Oil & gas (integrated / E&P)', throughCycleMargin: 0.12, normalizedRoic: 0.1, scenario: { bear: -0.02, base: 0.12, bull: 0.22 } },
  aluminum: { label: 'Aluminium', throughCycleMargin: 0.07, normalizedRoic: 0.06, scenario: { bear: -0.05, base: 0.07, bull: 0.18 } },
  steel: { label: 'Steel', throughCycleMargin: 0.08, normalizedRoic: 0.09, scenario: { bear: 0.0, base: 0.08, bull: 0.18 } },
  fertilizer: { label: 'Fertilizer', throughCycleMargin: 0.12, normalizedRoic: 0.08, scenario: { bear: 0.02, base: 0.12, bull: 0.28 } },
  copper: { label: 'Copper', throughCycleMargin: 0.25, normalizedRoic: 0.1, scenario: { bear: 0.08, base: 0.25, bull: 0.4 } },
  machinery: { label: 'Machinery', throughCycleMargin: 0.14, normalizedRoic: 0.18, scenario: { bear: 0.08, base: 0.14, bull: 0.2 } },
  memory: { label: 'Memory semiconductors', throughCycleMargin: 0.18, normalizedRoic: 0.12, scenario: { bear: -0.2, base: 0.18, bull: 0.45 } },
  logic_semis: { label: 'Logic / GPU semiconductors', throughCycleMargin: 0.2, normalizedRoic: 0.18, scenario: { bear: 0.05, base: 0.2, bull: 0.45 } },
  semi_equipment: { label: 'Semiconductor equipment', throughCycleMargin: 0.22, normalizedRoic: 0.2, scenario: { bear: 0.1, base: 0.22, bull: 0.32 } },
  autos: { label: 'Automobiles', throughCycleMargin: 0.07, normalizedRoic: 0.09, scenario: { bear: 0.01, base: 0.07, bull: 0.12 } },
  container_shipping: { label: 'Container shipping', throughCycleMargin: 0.08, normalizedRoic: 0.06, scenario: { bear: -0.1, base: 0.08, bull: 0.45 } },
  shipbuilding: { label: 'Shipbuilding', throughCycleMargin: 0.04, normalizedRoic: 0.05, scenario: { bear: -0.15, base: 0.04, bull: 0.1 } },
  petrochemicals: { label: 'Petrochemicals (NCC)', throughCycleMargin: 0.06, normalizedRoic: 0.06, scenario: { bear: -0.04, base: 0.06, bull: 0.14 } },
  trading_house: { label: 'Sogo shosha (PBT margin on IFRS revenue)', throughCycleMargin: 0.05, normalizedRoic: 0.07, scenario: { bear: 0.025, base: 0.05, bull: 0.08 } },
  heavy_industry: { label: 'Heavy industry / defense', throughCycleMargin: 0.06, normalizedRoic: 0.06, scenario: { bear: 0.02, base: 0.06, bull: 0.1 } },
};

/** Statutory corporate tax rate applied to normalized operating profit. */
export const NORMALIZED_TAX_RATE: Record<Country | 'CA', number> = { US: 0.21, KR: 0.24, JP: 0.306, CA: 0.265 };
