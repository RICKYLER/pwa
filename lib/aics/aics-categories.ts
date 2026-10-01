/**
 * Official A.I.C.S. (Assistance to Individuals in Crisis Situations)
 * Client Categories & Sub-Categories based on MSWDO Mabini standard operating procedures.
 */

export interface AicsCategoryDef {
  id: string;
  name: string;
  shortLabel: string;
  description: string;
  subCategories: string[];
}

export const AICS_INTAKE_MODES = [
  { id: 'walk_in', label: 'Walk-In' },
  { id: 'referred', label: 'Referred' },
  { id: 'rescued', label: 'Rescued' },
] as const;

export const AICS_SECTORS = [
  { id: '4ps', label: '4Ps Beneficiary' },
  { id: 'children', label: 'Children' },
  { id: 'youth', label: 'Youth' },
  { id: 'women', label: 'Women' },
  { id: 'senior_citizen', label: 'Senior Citizen' },
  { id: 'pwd', label: 'PWD' },
  { id: 'solo_parent', label: 'Solo Parent' },
] as const;

export const AICS_ASSISTANCE_TYPES = [
  { id: 'medical', label: 'Medical Assistance (Dialysis, Chemotherapy, Hospitalization, Medicine)', icon: 'Stethoscope' },
  { id: 'burial', label: 'Burial / Funeral Assistance (Casket, Transport of Remains)', icon: 'Cross' },
  { id: 'educational', label: 'Educational Assistance', icon: 'GraduationCap' },
  { id: 'food_transportation', label: 'Food & Transportation Crisis (Stranded, Balik Probinsya)', icon: 'Bus' },
  { id: 'disaster_distress', label: 'Disaster & Calamity Distress (Fire, Flood, Landslide)', icon: 'Flame' },
  { id: 'other', label: 'Other Crisis Assistance', icon: 'HelpCircle' },
] as const;

/**
 * 4 Official Client Categories and exact Sub-Categories from MSWDO Standard Matrix (Photos 3 & 4)
 */
export const AICS_CLIENT_CATEGORIES: Record<string, AicsCategoryDef> = {
  fhona: {
    id: 'fhona',
    name: 'Family Head and Other Needy Adult (FHONA)',
    shortLabel: 'FHONA',
    description: 'Needy family heads, breadwinners, and adults facing immediate socioeconomic distress',
    subCategories: [
      '4Ps Beneficiaries',
      'Dialysis Patients',
      'Former Rebels',
      'Indigenous People',
      'Individuals with Cancer',
      'Internally Displaced Family',
      'Killed in Action (KIA)',
      'Person of Concerns - Asylum Seeker',
      'Person of Concerns - Refugees',
      'Person of Concerns - Stateless Persons',
      'Repatriated OFW',
      'Solo Parent',
      'Surrendered drug users',
      'Tuberculosis Patients',
      'Victims of Disaster',
      'Victims of Illegal Recruitment',
      'Wounded in Action (WIA)',
      'NONE OF THE ABOVE',
    ],
  },
  senior_citizen: {
    id: 'senior_citizen',
    name: 'Senior Citizen (SC)',
    shortLabel: 'Senior Citizen',
    description: 'Elderly citizens aged 60 and above requiring immediate medical, maintenance, or crisis aid',
    subCategories: [
      'Frail / Sickly / Bedridden',
      'Indigent Senior (Non-Pensioner)',
      'Social Pensioner in Crisis',
      'Medical Maintenance & Prescription Drugs',
      'Dialysis / Chemotherapy Support',
      'General Senior Crisis Assistance',
    ],
  },
  pwd: {
    id: 'pwd',
    name: 'Persons With Disability (PWD)',
    shortLabel: 'PWD',
    description: 'Differently-abled individuals facing medical crises, device needs, or financial distress',
    subCategories: [
      'Deaf/Hard of Hearing Disability',
      'Individuals with Cancer',
      'Intellectual Disability',
      'Learning Disability',
      'Mental Disability',
      'Multiple Disabilities',
      'Non-apparent cancer',
      'Non-apparent rare disease',
      'Non-apparent Speech and Language Impairment',
      'Non-apparent Visual Disability',
      'Physical Disability (Orthopedic)',
      'Psychosocial Disability',
      'Visually impaired',
    ],
  },
  ynsp: {
    id: 'ynsp',
    name: 'Youth in Need of Special Protection (YNSP)',
    shortLabel: 'YNSP',
    description: 'Vulnerable youth facing legal, exploitation, or substance rehabilitation challenges',
    subCategories: [
      'Children in Conflict with the Law (9 to < 18 yrs. old)',
      'Pre-delinquent Youth',
      'Surrendered drug users',
      'Victims of Illegal Recruitment',
    ],
  },
};

export function getAicsCategoryLabel(categoryId?: string): string {
  if (!categoryId) return 'General AICS';
  return AICS_CLIENT_CATEGORIES[categoryId]?.shortLabel || categoryId.toUpperCase();
}

export function getAicsSubCategories(categoryId?: string): string[] {
  if (!categoryId || !AICS_CLIENT_CATEGORIES[categoryId]) return [];
  return AICS_CLIENT_CATEGORIES[categoryId].subCategories;
}
