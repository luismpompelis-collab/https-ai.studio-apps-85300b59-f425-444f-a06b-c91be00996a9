declare const __GOOGLE_MAPS_API_KEY__: string;

export const GOOGLE_MAPS_API_KEY: string =
  (import.meta.env.VITE_GOOGLE_MAPS_API_KEY as string | undefined) ||
  (typeof __GOOGLE_MAPS_API_KEY__ !== 'undefined' ? __GOOGLE_MAPS_API_KEY__ : '');

export const GMP_MAP_ID = 'DEMO_MAP_ID';

export const GMP_ATTRIBUTION_IDS: string[] = ['gmp_mcp_codeassist_v1_aistudio'];

export const DR_DEFAULT_CENTER = { lat: 18.7357, lng: -70.1627 };
