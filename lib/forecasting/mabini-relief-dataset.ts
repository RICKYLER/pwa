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
}

/**
 * Realistic disaster records across the 11 Mabini barangays simulating past events
 * (e.g. 2023 Davao de Oro earthquake series, shear line floods, typhoon storm surges).
 */
export const MABINI_SYNTHETIC_DISASTER_HISTORY: HistoricalDisasterEvent[] = [
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
];
