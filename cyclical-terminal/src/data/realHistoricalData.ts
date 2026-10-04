import type { CompanyDataset } from '../types';
import { US_ENERGY_MATERIALS } from './us/usEnergyMaterials';
import { US_INDUSTRIAL_TECH } from './us/usIndustrialTech';

// 🇺🇸 US / Global universe (18 issuers): SEC 10-K / 20-F / 40-F annual filings + NYSE/NASDAQ quarter-end closes.
export const US_GLOBAL_COMPANIES: CompanyDataset[] = [...US_ENERGY_MATERIALS, ...US_INDUSTRIAL_TECH];
