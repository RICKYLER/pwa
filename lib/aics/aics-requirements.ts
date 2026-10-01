import type {
  AicsAssistanceType,
  AicsClientCategory,
  AicsSector,
} from '@/lib/db/schema';

export interface AicsRequirementTemplate {
  key: string;
  label: string;
  description: string;
  mandatory: boolean;
  group: 'general' | 'assistance' | 'sector';
  recommendedFor?: string;
}

export interface AicsRequirementDocument {
  id: string;
  requirement_key: string;
  name: string;
  file_url: string;
  file_size?: number;
  original_size?: number;
  uploaded_at: string;
  saved_percentage?: number;
}

export interface AicsRequirementItemState {
  template: AicsRequirementTemplate;
  submitted: boolean; // marked as hard-copy submitted or verified
  document?: AicsRequirementDocument; // attached digital scan / photo
}

/**
 * Returns dynamic list of required documents for AICS intake
 * tailored to the selected assistance type, client category, and sectors.
 */
export function getAicsRequirementTemplates(
  assistanceType: AicsAssistanceType,
  clientCategory?: AicsClientCategory,
  sectors: AicsSector[] = []
): AicsRequirementTemplate[] {
  const list: AicsRequirementTemplate[] = [
    // 1. General Universal Requirements
    {
      key: 'barangay_indigency',
      label: 'Barangay Certificate of Indigency',
      description: 'Issued by the Punong Barangay certifying applicant / claimant is indigent.',
      mandatory: true,
      group: 'general',
    },
    {
      key: 'valid_id',
      label: 'Valid Government-Issued ID / Barangay ID',
      description: 'Valid ID of the applicant or authorized claimant with clear photo.',
      mandatory: true,
      group: 'general',
    },
    {
      key: 'authorization_letter',
      label: 'Authorization Letter & Representative ID',
      description: 'Required only if the claimant is a family representative on behalf of patient/client.',
      mandatory: false,
      group: 'general',
    },
  ];

  // 2. Assistance-specific Requirements
  switch (assistanceType) {
    case 'medical':
      list.push(
        {
          key: 'medical_certificate',
          label: 'Medical Certificate / Clinical Abstract',
          description: 'Issued within last 3 months by attending doctor with license number.',
          mandatory: true,
          group: 'assistance',
        },
        {
          key: 'medical_bill_prescription',
          label: 'Prescription / Hospital Statement of Account (SOA)',
          description: 'Official doctor prescription with pharmacy quotation, hospital bill, or dialysis/lab request.',
          mandatory: true,
          group: 'assistance',
        }
      );
      break;

    case 'burial':
      list.push(
        {
          key: 'death_certificate',
          label: 'Registered Death Certificate',
          description: 'Certified copy of Death Certificate from Local Civil Registrar or hospital.',
          mandatory: true,
          group: 'assistance',
        },
        {
          key: 'funeral_contract',
          label: 'Funeral Contract / Official Receipt / Statement',
          description: 'Contract with licensed funeral parlor or statement of funeral expenses.',
          mandatory: true,
          group: 'assistance',
        }
      );
      break;

    case 'educational':
      list.push(
        {
          key: 'enrollment_certificate',
          label: 'Certificate of Enrollment / Registration (COR)',
          description: 'Validated certificate of enrollment or assessment of school fees for current term.',
          mandatory: true,
          group: 'assistance',
        },
        {
          key: 'school_id',
          label: 'Valid School ID of Student Beneficiary',
          description: 'Official school identification card.',
          mandatory: true,
          group: 'assistance',
        }
      );
      break;

    case 'food_transportation':
      list.push(
        {
          key: 'stranded_justification',
          label: 'Social Worker Case Note / Stranded Certification',
          description: 'Justification of stranded/destitute traveler needing return fare or emergency food.',
          mandatory: true,
          group: 'assistance',
        },
        {
          key: 'police_blotter',
          label: 'Police Blotter / Certificate of Loss (if applicable)',
          description: 'Required if stranded due to theft, robbery, or lost purse/wallet.',
          mandatory: false,
          group: 'assistance',
        }
      );
      break;

    case 'disaster_distress':
      list.push(
        {
          key: 'disaster_incident_report',
          label: 'BDRRMC / BFP Disaster Incident Report',
          description: 'Incident report certifying residential fire, flood, landslide, or natural disaster.',
          mandatory: true,
          group: 'assistance',
        },
        {
          key: 'damage_photos',
          label: 'Photos of Damaged House / Property',
          description: 'Proof of dwelling damage or total destruction for crisis validation.',
          mandatory: true,
          group: 'assistance',
        }
      );
      break;

    case 'other':
    default:
      list.push({
        key: 'other_justification',
        label: 'Justification / Referral Letter',
        description: 'Case justification explaining the extraordinary emergency crisis situation.',
        mandatory: true,
        group: 'assistance',
      });
      break;
  }

  // 3. Sector-specific Requirements
  if (clientCategory === 'senior_citizen' || sectors.includes('senior_citizen')) {
    list.push({
      key: 'osca_id',
      label: 'OSCA Senior Citizen ID Card',
      description: 'Valid ID issued by Office for Senior Citizens Affairs.',
      mandatory: false,
      group: 'sector',
    });
  }

  if (clientCategory === 'pwd' || sectors.includes('pwd')) {
    list.push({
      key: 'pwd_id',
      label: 'PDAO Person with Disability (PWD) ID',
      description: 'Official PWD Identification card from PDAO / MSWDO.',
      mandatory: false,
      group: 'sector',
    });
  }

  if (sectors.includes('solo_parent')) {
    list.push({
      key: 'solo_parent_id',
      label: 'Solo Parent Identification Card (SPIC)',
      description: 'Valid Solo Parent ID issued under RA 11861.',
      mandatory: false,
      group: 'sector',
    });
  }

  return list;
}
