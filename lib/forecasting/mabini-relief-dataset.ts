/**
 * Synthetic Historical Disaster & Relief Distribution Dataset for Mabini, Davao de Oro
 * Formulated under MSWDO & MDRRMO operational baselines:
 * - 3 families per physical household (HH)
 * - 1 Family Food Pack (FFP) per family (3 packs per physical HH)
 * - 1 Kitchen / Cooking Set per physical household for damaged/displaced homes
 * - 2,000 FFP buffer in MDRRMO Bodega
 */

export type DisasterHazardType = 'typhoon' | 'flashflood' | 'landslide' | 'earthquake';

export interface HistoricalDisasterEvent {
  id: string;
  eventName: string;
  date: string;
  hazardType: DisasterHazardType;
  severityLevel: 'low' | 'moderate' | 'severe' | 'critical';
  barangayId: string;
  barangayName: string;
  /** Estimated or recorded physical households affected */
  affectedHouseholds: number;
  /** Calculated using MSWDO rule: 3 families per HH */
  affectedFamilies: number;
  /** Days displaced or requiring active food assistance */
  displacementDays: number;
  /** Demographics recorded by MSWDO field assessment */
  vulnerability: {
    seniorsCount: number;
    pwdsCount: number;
    infantsCount: number;
    lactatingMothersCount: number;
  };
  /** Ground truth: actual relief items released and distributed by MSWDO */
  actualDistributed: {
    familyFoodPacks: number;
    kitchenSets: number;
    hygieneKits: number;
    infantCarePacks: number;
    seniorCarePacks: number;
  };
  notes: string;
  /** Detailed housing damage breakdown from field SitReps */
  damagedHousesDetail?: {
    totally: number;
    partially: number;
    puroks?: string[];
  };
  /** Count of inspected damaged public and private infrastructure */
  damagedInfrastructureCount?: number;
  /** Raw columns/fields preserved directly from uploaded Excel/CSV file */
  rawRowData?: Record<string, any>;
}

/**
 * Active default dataset starts completely empty (0 records).
 * No seed or synthetic data is loaded by default.
 * Ready to ingest official MDRRMO SitRep Excel or CSV files.
 */
export const MABINI_SYNTHETIC_DISASTER_HISTORY: HistoricalDisasterEvent[] = [];

/**
 * Historical benchmark test fixture used strictly for offline unit tests & algorithm validation.
 */
export const MABINI_BENCHMARK_FIXTURE_EVENTS: HistoricalDisasterEvent[] = [
  {
    id: 'mab-2023-eq-cadunan',
    eventName: '2023 Magnitude 5.9 Davao de Oro Earthquake Series',
    date: '2023-03-07',
    hazardType: 'earthquake',
    severityLevel: 'severe',
    barangayId: 'cadunan',
    barangayName: 'Cadunan',
    affectedHouseholds: 110,
    affectedFamilies: 330, // 110 * 3
    displacementDays: 4,
    vulnerability: {
      seniorsCount: 42,
      pwdsCount: 14,
      infantsCount: 28,
      lactatingMothersCount: 19,
    },
    actualDistributed: {
      familyFoodPacks: 345, // ~330 plus contingency buffer
      kitchenSets: 95,
      hygieneKits: 110,
      infantCarePacks: 28,
      seniorCarePacks: 42,
    },
    notes: 'Structural damage to residential dwellings; evacuation to Cadunan Central gym.',
  },
  {
    id: 'mab-2023-eq-golden-valley',
    eventName: '2023 Magnitude 5.9 Davao de Oro Earthquake Series',
    date: '2023-03-07',
    hazardType: 'landslide',
    severityLevel: 'critical',
    barangayId: 'golden-valley',
    barangayName: 'Golden Valley',
    affectedHouseholds: 145,
    affectedFamilies: 435, // 145 * 3
    displacementDays: 6,
    vulnerability: {
      seniorsCount: 52,
      pwdsCount: 18,
      infantsCount: 39,
      lactatingMothersCount: 25,
    },
    actualDistributed: {
      familyFoodPacks: 460,
      kitchenSets: 140,
      hygieneKits: 145,
      infantCarePacks: 40,
      seniorCarePacks: 50,
    },
    notes: 'Upland landslide hazard isolated sitios; multi-day evacuation camps setup.',
  },
  {
    id: 'mab-2023-flood-cuambog',
    eventName: '2023 January Shear Line Flash Floods',
    date: '2023-01-18',
    hazardType: 'flashflood',
    severityLevel: 'severe',
    barangayId: 'cuambog',
    barangayName: 'Cuambog (Poblacion)',
    affectedHouseholds: 80,
    affectedFamilies: 240, // 80 * 3
    displacementDays: 3,
    vulnerability: {
      seniorsCount: 31,
      pwdsCount: 9,
      infantsCount: 22,
      lactatingMothersCount: 15,
    },
    actualDistributed: {
      familyFoodPacks: 252,
      kitchenSets: 60,
      hygieneKits: 80,
      infantCarePacks: 22,
      seniorCarePacks: 31,
    },
    notes: 'River overflow along low-lying puroks near poblacion market.',
  },
  {
    id: 'mab-2023-flood-pindasan',
    eventName: '2023 January Shear Line Flash Floods',
    date: '2023-01-18',
    hazardType: 'flashflood',
    severityLevel: 'moderate',
    barangayId: 'pindasan',
    barangayName: 'Pindasan',
    affectedHouseholds: 65,
    affectedFamilies: 195, // 65 * 3
    displacementDays: 2,
    vulnerability: {
      seniorsCount: 25,
      pwdsCount: 7,
      infantsCount: 16,
      lactatingMothersCount: 11,
    },
    actualDistributed: {
      familyFoodPacks: 200,
      kitchenSets: 45,
      hygieneKits: 65,
      infantCarePacks: 16,
      seniorCarePacks: 25,
    },
    notes: 'Coastal drainage blockage caused temporary water logging.',
  },
  {
    id: 'mab-2023-flood-tagnanan',
    eventName: '2023 January Shear Line Flash Floods',
    date: '2023-01-19',
    hazardType: 'flashflood',
    severityLevel: 'severe',
    barangayId: 'tagnanan',
    barangayName: 'Tagnanan',
    affectedHouseholds: 92,
    affectedFamilies: 276, // 92 * 3
    displacementDays: 3,
    vulnerability: {
      seniorsCount: 36,
      pwdsCount: 12,
      infantsCount: 25,
      lactatingMothersCount: 18,
    },
    actualDistributed: {
      familyFoodPacks: 285,
      kitchenSets: 70,
      hygieneKits: 90,
      infantCarePacks: 25,
      seniorCarePacks: 35,
    },
    notes: 'Agricultural and residential inundation along coastal plains.',
  },
  {
    id: 'mab-2024-typhoon-anitapan',
    eventName: '2024 Low Pressure Area & Tropical Depression Response',
    date: '2024-02-02',
    hazardType: 'typhoon',
    severityLevel: 'moderate',
    barangayId: 'anitapan',
    barangayName: 'Anitapan',
    affectedHouseholds: 55,
    affectedFamilies: 165, // 55 * 3
    displacementDays: 2,
    vulnerability: {
      seniorsCount: 21,
      pwdsCount: 6,
      infantsCount: 14,
      lactatingMothersCount: 9,
    },
    actualDistributed: {
      familyFoodPacks: 170,
      kitchenSets: 30,
      hygieneKits: 55,
      infantCarePacks: 14,
      seniorCarePacks: 21,
    },
    notes: 'Pre-emptive evacuation triggered due to landslide warnings.',
  },
  {
    id: 'mab-2024-flood-cabuyuan',
    eventName: '2024 Continuous Rain & River Swell',
    date: '2024-02-03',
    hazardType: 'flashflood',
    severityLevel: 'moderate',
    barangayId: 'cabuyuan',
    barangayName: 'Cabuyuan',
    affectedHouseholds: 48,
    affectedFamilies: 144, // 48 * 3
    displacementDays: 2,
    vulnerability: {
      seniorsCount: 18,
      pwdsCount: 5,
      infantsCount: 12,
      lactatingMothersCount: 8,
    },
    actualDistributed: {
      familyFoodPacks: 150,
      kitchenSets: 25,
      hygieneKits: 48,
      infantCarePacks: 12,
      seniorCarePacks: 18,
    },
    notes: 'Agricultural runoff forced temporary shelter in elementary school.',
  },
  {
    id: 'mab-2024-landslide-del-pilar',
    eventName: '2024 Mountain Slope Debris Flow',
    date: '2024-03-12',
    hazardType: 'landslide',
    severityLevel: 'severe',
    barangayId: 'del-pilar',
    barangayName: 'Del Pilar',
    affectedHouseholds: 70,
    affectedFamilies: 210, // 70 * 3
    displacementDays: 4,
    vulnerability: {
      seniorsCount: 27,
      pwdsCount: 8,
      infantsCount: 17,
      lactatingMothersCount: 13,
    },
    actualDistributed: {
      familyFoodPacks: 220,
      kitchenSets: 65,
      hygieneKits: 70,
      infantCarePacks: 17,
      seniorCarePacks: 26,
    },
    notes: 'Access road obstructed; goods delivered via local MDRRMO response 4x4.',
  },
  {
    id: 'mab-2024-typhoon-libodon',
    eventName: '2024 Habagat Storm Gusts',
    date: '2024-07-24',
    hazardType: 'typhoon',
    severityLevel: 'low',
    barangayId: 'libodon',
    barangayName: 'Libodon',
    affectedHouseholds: 35,
    affectedFamilies: 105, // 35 * 3
    displacementDays: 1,
    vulnerability: {
      seniorsCount: 14,
      pwdsCount: 4,
      infantsCount: 9,
      lactatingMothersCount: 6,
    },
    actualDistributed: {
      familyFoodPacks: 108,
      kitchenSets: 15,
      hygieneKits: 35,
      infantCarePacks: 9,
      seniorCarePacks: 14,
    },
    notes: 'Roof damages; short-term aid released to affected purok.',
  },
  {
    id: 'mab-2024-flood-pangibiran',
    eventName: '2024 Southwest Monsoon Surge',
    date: '2024-08-15',
    hazardType: 'flashflood',
    severityLevel: 'moderate',
    barangayId: 'pangibiran',
    barangayName: 'Pangibiran',
    affectedHouseholds: 50,
    affectedFamilies: 150, // 50 * 3
    displacementDays: 2,
    vulnerability: {
      seniorsCount: 20,
      pwdsCount: 5,
      infantsCount: 13,
      lactatingMothersCount: 10,
    },
    actualDistributed: {
      familyFoodPacks: 155,
      kitchenSets: 30,
      hygieneKits: 50,
      infantCarePacks: 13,
      seniorCarePacks: 20,
    },
    notes: 'Creek swelling affected Purok 2 and 4.',
  },
  {
    id: 'mab-2024-coastal-san-antonio',
    eventName: '2024 High Tide Coastal Surge',
    date: '2024-09-02',
    hazardType: 'flashflood',
    severityLevel: 'low',
    barangayId: 'san-antonio',
    barangayName: 'San Antonio',
    affectedHouseholds: 30,
    affectedFamilies: 90, // 30 * 3
    displacementDays: 1,
    vulnerability: {
      seniorsCount: 12,
      pwdsCount: 3,
      infantsCount: 8,
      lactatingMothersCount: 5,
    },
    actualDistributed: {
      familyFoodPacks: 92,
      kitchenSets: 12,
      hygieneKits: 30,
      infantCarePacks: 8,
      seniorCarePacks: 12,
    },
    notes: 'Fisherfolk community along coast assisted during gale warning.',
  },
  {
    id: 'mab-2025-shearline-cadunan',
    eventName: '2025 Early Monsoon Inundation',
    date: '2025-01-10',
    hazardType: 'flashflood',
    severityLevel: 'moderate',
    barangayId: 'cadunan',
    barangayName: 'Cadunan',
    affectedHouseholds: 75,
    affectedFamilies: 225, // 75 * 3
    displacementDays: 2,
    vulnerability: {
      seniorsCount: 29,
      pwdsCount: 8,
      infantsCount: 19,
      lactatingMothersCount: 14,
    },
    actualDistributed: {
      familyFoodPacks: 232,
      kitchenSets: 40,
      hygieneKits: 75,
      infantCarePacks: 19,
      seniorCarePacks: 29,
    },
    notes: 'Flash flooding across rice paddies; standard 3 packs per HH distributed.',
  },
  {
    id: 'mab-2025-eq-cuambog',
    eventName: '2025 Local Fault Tremor Response',
    date: '2025-02-14',
    hazardType: 'earthquake',
    severityLevel: 'low',
    barangayId: 'cuambog',
    barangayName: 'Cuambog',
    affectedHouseholds: 40,
    affectedFamilies: 120, // 40 * 3
    displacementDays: 1,
    vulnerability: {
      seniorsCount: 16,
      pwdsCount: 4,
      infantsCount: 10,
      lactatingMothersCount: 7,
    },
    actualDistributed: {
      familyFoodPacks: 122,
      kitchenSets: 15,
      hygieneKits: 40,
      infantCarePacks: 10,
      seniorCarePacks: 16,
    },
    notes: 'Minor cracks in barangay hall; precautionary food packs dispatched.',
  },
  {
    id: 'mab-2025-landslide-golden-valley',
    eventName: '2025 Heavy Rain Slope Instability',
    date: '2025-03-01',
    hazardType: 'landslide',
    severityLevel: 'severe',
    barangayId: 'golden-valley',
    barangayName: 'Golden Valley',
    affectedHouseholds: 95,
    affectedFamilies: 285, // 95 * 3
    displacementDays: 4,
    vulnerability: {
      seniorsCount: 35,
      pwdsCount: 11,
      infantsCount: 24,
      lactatingMothersCount: 18,
    },
    actualDistributed: {
      familyFoodPacks: 295,
      kitchenSets: 85,
      hygieneKits: 95,
      infantCarePacks: 24,
      seniorCarePacks: 35,
    },
    notes: 'Sitio Balite evacuation center opened; food packs drawn from MDRRMO bodega.',
  },
  {
    id: 'mab-2025-storm-pindasan',
    eventName: '2025 Tropical Storm Off-Coast Alert',
    date: '2025-04-18',
    hazardType: 'typhoon',
    severityLevel: 'moderate',
    barangayId: 'pindasan',
    barangayName: 'Pindasan',
    affectedHouseholds: 60,
    affectedFamilies: 180, // 60 * 3
    displacementDays: 2,
    vulnerability: {
      seniorsCount: 24,
      pwdsCount: 6,
      infantsCount: 15,
      lactatingMothersCount: 10,
    },
    actualDistributed: {
      familyFoodPacks: 186,
      kitchenSets: 35,
      hygieneKits: 60,
      infantCarePacks: 15,
      seniorCarePacks: 24,
    },
    notes: 'Coastal evacuation at Pindasan National High School.',
  },
  // =========================================================================
  // OFFICIAL OCTOBER 2025 MABINI DAVAO DE ORO EARTHQUAKE SEQUENCE (MDRRMO / MSWDO)
  // Multi-date progressive reports: Oct 10, Oct 11, Oct 13, and Oct 15, 2025
  // =========================================================================
  {
    id: 'mab-2025-10-10-cuambog',
    eventName: 'October 2025 Mabini Earthquake Series',
    date: '2025-10-10',
    hazardType: 'earthquake',
    severityLevel: 'moderate',
    barangayId: 'cuambog',
    barangayName: 'Cuambog (Poblacion)',
    affectedHouseholds: 0,
    affectedFamilies: 0,
    displacementDays: 1,
    vulnerability: { seniorsCount: 0, pwdsCount: 0, infantsCount: 0, lactatingMothersCount: 0 },
    actualDistributed: { familyFoodPacks: 0, kitchenSets: 0, hygieneKits: 0, infantCarePacks: 0, seniorCarePacks: 0 },
    notes: 'Initial damage inspection: Mabini NHS (classroom wall & ceiling cracks, tiles detached), Regional Evac Center gym post, Cor Jesu Institute, Mosque.',
    damagedInfrastructureCount: 4,
  },
  {
    id: 'mab-2025-10-10-anitapan',
    eventName: 'October 2025 Mabini Earthquake Series',
    date: '2025-10-10',
    hazardType: 'earthquake',
    severityLevel: 'severe',
    barangayId: 'anitapan',
    barangayName: 'Anitapan',
    affectedHouseholds: 0,
    affectedFamilies: 0,
    displacementDays: 2,
    vulnerability: { seniorsCount: 0, pwdsCount: 0, infantsCount: 0, lactatingMothersCount: 0 },
    actualDistributed: { familyFoodPacks: 20, kitchenSets: 5, hygieneKits: 10, infantCarePacks: 2, seniorCarePacks: 4 },
    notes: 'Geological incidents: Purok 5 Layo 25th IB base ground rupture (4 locations, troops evacuated to brgy hall), Singapore road landslide passable to motorcycle only, Mascareg terminal ground rupture, Day Care hall cracks.',
    damagedInfrastructureCount: 2,
  },
  {
    id: 'mab-2025-10-11-cabuyuan',
    eventName: 'October 2025 Mabini Earthquake Series',
    date: '2025-10-11',
    hazardType: 'earthquake',
    severityLevel: 'severe',
    barangayId: 'cabuyuan',
    barangayName: 'Cabuyuan',
    affectedHouseholds: 0,
    affectedFamilies: 0,
    displacementDays: 2,
    vulnerability: { seniorsCount: 0, pwdsCount: 0, infantsCount: 0, lactatingMothersCount: 0 },
    actualDistributed: { familyFoodPacks: 0, kitchenSets: 0, hygieneKits: 0, infantCarePacks: 0, seniorCarePacks: 0 },
    notes: 'Lifeline disruption: Purok Lower B Water Reservoir (ELCAC funded) beam, posts, and floor have significant cracks; temporarily stopped, reported to MEO for rehab.',
    damagedInfrastructureCount: 1,
  },
  {
    id: 'mab-2025-10-11-pindasan',
    eventName: 'October 2025 Mabini Earthquake Series',
    date: '2025-10-11',
    hazardType: 'earthquake',
    severityLevel: 'moderate',
    barangayId: 'pindasan',
    barangayName: 'Pindasan',
    affectedHouseholds: 0,
    affectedFamilies: 0,
    displacementDays: 1,
    vulnerability: { seniorsCount: 0, pwdsCount: 0, infantsCount: 0, lactatingMothersCount: 0 },
    actualDistributed: { familyFoodPacks: 0, kitchenSets: 0, hygieneKits: 0, infantCarePacks: 0, seniorCarePacks: 0 },
    notes: 'Lifeline inspection: Baybay Water Reservoir (LGSF funded) minimal cracks, functional, reported to MEO for repair recommendation.',
    damagedInfrastructureCount: 1,
  },
  {
    id: 'mab-2025-10-13-cuambog',
    eventName: 'October 2025 Mabini Earthquake Series',
    date: '2025-10-13',
    hazardType: 'earthquake',
    severityLevel: 'critical',
    barangayId: 'cuambog',
    barangayName: 'Cuambog (Poblacion)',
    affectedHouseholds: 43,
    affectedFamilies: 129, // 43 * 3
    displacementDays: 4,
    vulnerability: { seniorsCount: 22, pwdsCount: 7, infantsCount: 15, lactatingMothersCount: 9 },
    actualDistributed: { familyFoodPacks: 135, kitchenSets: 43, hygieneKits: 43, infantCarePacks: 15, seniorCarePacks: 22 },
    notes: '43 Damaged Houses (1 Totally, 42 Partially; Purok Makiangayon, Matinabangon, Muramurahan, Luyaw). Mabini Central ES 10m x 3m fence collapsed. Brgy Hall 2 outside columns visible cracks.',
    damagedHousesDetail: { totally: 1, partially: 42, puroks: ['Makiangayon', 'Matinabangon', 'Muramurahan', 'Luyaw'] },
    damagedInfrastructureCount: 2,
  },
  {
    id: 'mab-2025-10-13-anitapan',
    eventName: 'October 2025 Mabini Earthquake Series',
    date: '2025-10-13',
    hazardType: 'earthquake',
    severityLevel: 'severe',
    barangayId: 'anitapan',
    barangayName: 'Anitapan',
    affectedHouseholds: 5,
    affectedFamilies: 15, // 5 * 3
    displacementDays: 5,
    vulnerability: { seniorsCount: 4, pwdsCount: 2, infantsCount: 3, lactatingMothersCount: 2 },
    actualDistributed: { familyFoodPacks: 16, kitchenSets: 5, hygieneKits: 5, infantCarePacks: 3, seniorCarePacks: 4 },
    notes: '5 Partially Damaged Houses (Purok 4 Bucana - Edem Pandagay, Kidaraan - Jennifer Onlo, Purok Mangurayan, Purok Layo). 25th IB Patrol Base relocated. Water Reservoir stopped. NHS covered court floor leak. ES retaining wall damaged. Masagana plaza leak.',
    damagedHousesDetail: { totally: 0, partially: 5, puroks: ['Purok 4 Bucana', 'Kidaraan', 'Purok Mangurayan', 'Purok Layo'] },
    damagedInfrastructureCount: 5,
  },
  {
    id: 'mab-2025-10-13-pangibiran',
    eventName: 'October 2025 Mabini Earthquake Series',
    date: '2025-10-13',
    hazardType: 'earthquake',
    severityLevel: 'moderate',
    barangayId: 'pangibiran',
    barangayName: 'Pangibiran',
    affectedHouseholds: 3,
    affectedFamilies: 9, // 3 * 3
    displacementDays: 2,
    vulnerability: { seniorsCount: 2, pwdsCount: 1, infantsCount: 2, lactatingMothersCount: 1 },
    actualDistributed: { familyFoodPacks: 10, kitchenSets: 3, hygieneKits: 3, infantCarePacks: 2, seniorCarePacks: 2 },
    notes: '3 Partially Damaged Houses (Purok 1 - Rosemarie Flores, Jovanie Talisik; Purok 2 - Felissa Manos; Purok 5 - Romulo Carpentero). Brgy Hall inspected.',
    damagedHousesDetail: { totally: 0, partially: 3, puroks: ['Purok 1', 'Purok 2', 'Purok 5'] },
    damagedInfrastructureCount: 1,
  },
  {
    id: 'mab-2025-10-13-golden-valley',
    eventName: 'October 2025 Mabini Earthquake Series',
    date: '2025-10-13',
    hazardType: 'earthquake',
    severityLevel: 'moderate',
    barangayId: 'golden-valley',
    barangayName: 'Golden Valley',
    affectedHouseholds: 3,
    affectedFamilies: 9, // 3 * 3
    displacementDays: 3,
    vulnerability: { seniorsCount: 2, pwdsCount: 1, infantsCount: 1, lactatingMothersCount: 1 },
    actualDistributed: { familyFoodPacks: 10, kitchenSets: 3, hygieneKits: 3, infantCarePacks: 1, seniorCarePacks: 2 },
    notes: '3 Partially Damaged Houses (Dominador L. Plaza, Manuel Brigoly, Purok 19 - Angelita Garalde). NHS minor ceiling joint crack. Panamin ES plaster cracks. Candinuyan ES hairline cracks. Evangel Church minor ceiling/floor damage.',
    damagedHousesDetail: { totally: 0, partially: 3, puroks: ['Purok 19', 'Sitio Plaza'] },
    damagedInfrastructureCount: 4,
  },
  {
    id: 'mab-2025-10-13-cabuyuan',
    eventName: 'October 2025 Mabini Earthquake Series',
    date: '2025-10-13',
    hazardType: 'earthquake',
    severityLevel: 'moderate',
    barangayId: 'cabuyuan',
    barangayName: 'Cabuyuan',
    affectedHouseholds: 2,
    affectedFamilies: 6, // 2 * 3
    displacementDays: 2,
    vulnerability: { seniorsCount: 1, pwdsCount: 1, infantsCount: 1, lactatingMothersCount: 1 },
    actualDistributed: { familyFoodPacks: 7, kitchenSets: 2, hygieneKits: 2, infantCarePacks: 1, seniorCarePacks: 1 },
    notes: '2 Partially Damaged Houses (Purok Lower B - Gina Palabao, Elvie Aberella). Fish Landing Deck collapsed one column joint connecting to deck. Elementary School plaster cracks.',
    damagedHousesDetail: { totally: 0, partially: 2, puroks: ['Purok Lower B'] },
    damagedInfrastructureCount: 2,
  },
  {
    id: 'mab-2025-10-13-del-pilar',
    eventName: 'October 2025 Mabini Earthquake Series',
    date: '2025-10-13',
    hazardType: 'earthquake',
    severityLevel: 'moderate',
    barangayId: 'del-pilar',
    barangayName: 'Del Pilar',
    affectedHouseholds: 2,
    affectedFamilies: 6, // 2 * 3
    displacementDays: 2,
    vulnerability: { seniorsCount: 1, pwdsCount: 0, infantsCount: 1, lactatingMothersCount: 1 },
    actualDistributed: { familyFoodPacks: 7, kitchenSets: 2, hygieneKits: 2, infantCarePacks: 1, seniorCarePacks: 1 },
    notes: '2 Partially Damaged Houses (Purok 1 - Reynante Llever, Anecita Pisay). Elementary School structurally intact. Brgy Hall hairline cracks.',
    damagedHousesDetail: { totally: 0, partially: 2, puroks: ['Purok 1'] },
    damagedInfrastructureCount: 2,
  },
  {
    id: 'mab-2025-10-13-san-antonio',
    eventName: 'October 2025 Mabini Earthquake Series',
    date: '2025-10-13',
    hazardType: 'earthquake',
    severityLevel: 'low',
    barangayId: 'san-antonio',
    barangayName: 'San Antonio',
    affectedHouseholds: 1,
    affectedFamilies: 3, // 1 * 3
    displacementDays: 2,
    vulnerability: { seniorsCount: 1, pwdsCount: 0, infantsCount: 0, lactatingMothersCount: 0 },
    actualDistributed: { familyFoodPacks: 4, kitchenSets: 1, hygieneKits: 1, infantCarePacks: 0, seniorCarePacks: 1 },
    notes: '1 Partially Damaged House (Purok 4). Elementary School minor hairline cracks. National High School pathway entrance cracks. Brgy Hall intact.',
    damagedHousesDetail: { totally: 0, partially: 1, puroks: ['Purok 4'] },
    damagedInfrastructureCount: 3,
  },
  {
    id: 'mab-2025-10-13-other-barangays',
    eventName: 'October 2025 Mabini Earthquake Series',
    date: '2025-10-13',
    hazardType: 'earthquake',
    severityLevel: 'low',
    barangayId: 'tagnanan',
    barangayName: 'Tagnanan',
    affectedHouseholds: 0,
    affectedFamilies: 0,
    displacementDays: 1,
    vulnerability: { seniorsCount: 0, pwdsCount: 0, infantsCount: 0, lactatingMothersCount: 0 },
    actualDistributed: { familyFoodPacks: 0, kitchenSets: 0, hygieneKits: 0, infantCarePacks: 0, seniorCarePacks: 0 },
    notes: 'Elementary School minor cracks (non-structural). Brgy Hall hairline cracks inside and outside.',
    damagedInfrastructureCount: 2,
  },
  {
    id: 'mab-2025-10-15-cuambog',
    eventName: 'October 2025 Mabini Earthquake Series',
    date: '2025-10-15',
    hazardType: 'earthquake',
    severityLevel: 'moderate',
    barangayId: 'cuambog',
    barangayName: 'Cuambog (Poblacion)',
    affectedHouseholds: 0,
    affectedFamilies: 0,
    displacementDays: 1,
    vulnerability: { seniorsCount: 0, pwdsCount: 0, infantsCount: 0, lactatingMothersCount: 0 },
    actualDistributed: { familyFoodPacks: 0, kitchenSets: 0, hygieneKits: 0, infantCarePacks: 0, seniorCarePacks: 0 },
    notes: 'Municipal structures inspection: Mabini Terminal (hairline cracks), Mabini RTC building (floor tiles at main door entrance), Nutrition Office (hairline cracks), Senior Citizen Office (floor tiles detached, hairline cracks inside), Health Office (floor tile crack), Comelec (hairline cracks, hardiflex detached), Moneymall Rural Bank Inc. (lavatory detached, floor tile cracks).',
    damagedInfrastructureCount: 7,
  },
  {
    id: 'mab-2025-10-15-other-sites',
    eventName: 'October 2025 Mabini Earthquake Series',
    date: '2025-10-15',
    hazardType: 'earthquake',
    severityLevel: 'low',
    barangayId: 'libodon',
    barangayName: 'Libodon',
    affectedHouseholds: 0,
    affectedFamilies: 0,
    displacementDays: 1,
    vulnerability: { seniorsCount: 0, pwdsCount: 0, infantsCount: 0, lactatingMothersCount: 0 },
    actualDistributed: { familyFoodPacks: 0, kitchenSets: 0, hygieneKits: 0, infantCarePacks: 0, seniorCarePacks: 0 },
    notes: 'Libudon Elementary (hairline cracks walls), Libudon Health Center (hairline cracks walls). Cadunan Kapoc Elementary (hairline cracks). Pindasan Day Cares & Level III Water System (column cracks). Khaza De Miranda Beach Resort minimal cracks.',
    damagedInfrastructureCount: 5,
  },
];
