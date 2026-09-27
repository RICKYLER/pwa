'use client';

import type { ReactNode } from 'react';
import { createContext, useContext, useEffect, useState } from 'react';

export type ResidentLanguage = 'ceb' | 'en';

export const RESIDENT_LANG_STORAGE_KEY = 'mswdo_resident_lang';

export const RESIDENT_TRANSLATIONS = {
  // Navigation Items
  home: {
    ceb: 'Balay',
    en: 'Home',
  },
  homePortal: {
    ceb: 'Balay / Portal',
    en: 'Home / Portal',
  },
  notifications: {
    ceb: 'Pahibalo',
    en: 'Notifications',
  },
  household: {
    ceb: 'Akong Pamilya',
    en: 'My Household',
  },
  householdShort: {
    ceb: 'Pamilya',
    en: 'Household',
  },
  newRegistration: {
    ceb: 'Bag-ong Rehistro',
    en: 'New Registration',
  },
  registerShort: {
    ceb: 'Rehistro',
    en: 'Register',
  },
  digitalId: {
    ceb: 'Digital ID',
    en: 'Digital ID',
  },
  digitalIdPass: {
    ceb: 'Digital ID Pass',
    en: 'Digital ID Pass',
  },
  downloadApp: {
    ceb: 'I-download ang App',
    en: 'Download App',
  },
  installed: {
    ceb: 'Na-install Na',
    en: 'Installed',
  },
  signOut: {
    ceb: 'Gawas',
    en: 'Sign out',
  },
  signOutFull: {
    ceb: 'Gawas / Sign out',
    en: 'Sign out',
  },

  // Header & Profile Chip
  municipalityLabel: {
    ceb: 'Munisipyo sa Mabini',
    en: 'Municipality of Mabini',
  },
  municipalitySub: {
    ceb: 'Munisipyo sa Mabini · MSWDO',
    en: 'Municipality of Mabini · MSWDO',
  },
  residentPortalLabel: {
    ceb: 'Portal sa Residente',
    en: 'Resident Portal',
  },
  profileChipTooltip: {
    ceb: 'Pislita aron ablihan ang Imong Profile & Digital ID Pass',
    en: 'Click to open your Profile & Digital ID Pass',
  },
  residentActiveBadge: {
    ceb: 'Aktibo ang Resident Access',
    en: 'Resident access active',
  },

  // Form Field Labels
  firstName: {
    ceb: 'Unang Pangalan',
    en: 'First Name',
  },
  firstNamePlaceholder: {
    ceb: 'Ibutang ang unang pangalan',
    en: 'Enter first name',
  },
  middleName: {
    ceb: 'Taliwala nga Pangalan',
    en: 'Middle Name',
  },
  middleNamePlaceholder: {
    ceb: 'Ibutang ang taliwala nga pangalan',
    en: 'Enter middle name',
  },
  lastName: {
    ceb: 'Apelyido',
    en: 'Last Name',
  },
  lastNamePlaceholder: {
    ceb: 'Ibutang ang apelyido',
    en: 'Enter last name',
  },
  birthdate: {
    ceb: 'Petsa sa Pagkatawo',
    en: 'Birthdate',
  },
  gender: {
    ceb: 'Kasarian',
    en: 'Gender',
  },
  male: {
    ceb: 'Lalaki',
    en: 'Male',
  },
  female: {
    ceb: 'Babaye',
    en: 'Female',
  },
  civilStatus: {
    ceb: 'Kahimtang Sibil',
    en: 'Civil Status',
  },
  contactNumber: {
    ceb: 'Numero sa Telepono',
    en: 'Contact Number',
  },
  relationshipToHead: {
    ceb: 'Relasyon sa Pangulo sa Panimalay',
    en: 'Relationship to Head of Household',
  },
  relationshipPlaceholder: {
    ceb: 'Pananglitan: Asawa, Anak, Ginikanan, Apo',
    en: 'e.g. Spouse, Son, Daughter, Parent, Grandchild',
  },
  occupation: {
    ceb: 'Trabaho / Panginabuhian',
    en: 'Occupation',
  },
  occupationPlaceholder: {
    ceb: 'Trabaho o tahas sa panimalay',
    en: 'Occupation or role in the household',
  },
  incomeLevel: {
    ceb: 'Kita Matag Bulan',
    en: 'Monthly Income Level',
  },
  educationLevel: {
    ceb: 'Naabot nga Edukasyon',
    en: 'Education Level',
  },

  // Health and Priority Tags
  healthPriorityTags: {
    ceb: 'Panglawas ug Priority Tags',
    en: 'Health and Priority Tags',
  },
  healthPriorityDesc: {
    ceb: 'Timaan kon PWD, mabdos, o may espesyal nga panginahanglan aron maapil sa ayuda ug vulnerability reports.',
    en: 'Mark PWD or pregnancy so this member appears correctly in vulnerability and distribution lists.',
  },
  pregnantMember: {
    ceb: 'Mabdos nga miyembro',
    en: 'Pregnant member',
  },
  pregnantMemberDesc: {
    ceb: 'I-apil kining sakop sa maternal health ug prayoridad nga tabang sa responder.',
    en: 'Include this member in maternal health and responder priority reports.',
  },
  pregnancyMonths: {
    ceb: 'Bulan sa Pagmabdos',
    en: 'Pregnancy Month',
  },
  expectedDeliveryDate: {
    ceb: 'Gilauman nga Petsa sa Pagpanganak (EDD)',
    en: 'Expected Date of Delivery (EDD)',
  },
  pwdMember: {
    ceb: 'Miyembro nga may Diperensya (PWD)',
    en: 'Person with Disability (PWD)',
  },
  pwdMemberDesc: {
    ceb: 'Ilista ang mga may diperensya sa lawas/pangisip aron maapil sa ayuda ug serbisyo.',
    en: 'Mark persons with disability so they are counted in household vulnerability data.',
  },
  pwdType: {
    ceb: 'Matang sa Diperensya (PWD)',
    en: 'PWD Type',
  },
  pwdIdNumber: {
    ceb: 'Numero sa PWD ID (kon naa)',
    en: 'PWD ID Number (optional)',
  },
  noPriorityTagYet: {
    ceb: 'Wala pay priority tag',
    en: 'No priority tag yet',
  },

  // Form Validation & Error Alerts
  formErrorSummary: {
    ceb: 'Dunay mga blangko o sayop nga impormasyon. Palihug tan-awa ang mga napula nga kahon sa ubos.',
    en: 'Some required fields are missing or invalid. Please check the highlighted red fields below.',
  },
  firstNameRequired: {
    ceb: 'Gikinahanglan ang unang pangalan.',
    en: 'First name is required.',
  },
  lastNameRequired: {
    ceb: 'Gikinahanglan ang apelyido.',
    en: 'Last name is required.',
  },
  birthdateRequired: {
    ceb: 'Gikinahanglan ang petsa sa pagkatawo.',
    en: 'Birthdate is required.',
  },
  relationshipRequired: {
    ceb: 'Gikinahanglan ang relasyon sa pangulo sa panimalay.',
    en: 'Relationship to head of household is required.',
  },
  pregnantFemaleRequired: {
    ceb: 'Ang mabdos nga miyembro kinahanglan babaye.',
    en: 'Pregnant members must have female gender.',
  },
  pregnancyMonthsRequired: {
    ceb: 'Ibutang ang gidugayon sa pagmabdos (1 hangtod 9 ka bulan).',
    en: 'Enter pregnancy duration between 1 and 9 months.',
  },
  eddRequired: {
    ceb: 'Gikinahanglan ang gilauman nga petsa sa pagpanganak (EDD).',
    en: 'Expected date of delivery (EDD) is required.',
  },
  pwdTypeRequired: {
    ceb: 'Pilia ang matang sa PWD aron ma-rekord og sakto.',
    en: 'Please select the PWD type so the record is counted correctly.',
  },

  // Form Buttons & Actions
  addMember: {
    ceb: 'Idugang ang Miyembro',
    en: 'Add Member',
  },
  closeForm: {
    ceb: 'Isira ang Form',
    en: 'Close Form',
  },
  submitMemberReview: {
    ceb: 'Isumite ang Miyembro aron Masusi',
    en: 'Submit Member for Review',
  },
  submittingMember: {
    ceb: 'Gisumite ang miyembro...',
    en: 'Submitting member...',
  },
  saveChanges: {
    ceb: 'I-save ang mga Kausaban',
    en: 'Save Changes',
  },
  cancel: {
    ceb: 'Kanselahon',
    en: 'Cancel',
  },
  nextStep: {
    ceb: 'Sunod nga Lakang',
    en: 'Next Step',
  },
  previousStep: {
    ceb: 'Miaging Lakang',
    en: 'Previous Step',
  },
  submitRegistration: {
    ceb: 'Isumiter ang Rehistrasyon',
    en: 'Submit Registration',
  },
  submittingRegistration: {
    ceb: 'Gisumiter ang rehistrasyon...',
    en: 'Submitting registration...',
  },

  // Household Sections
  householdMembersTitle: {
    ceb: 'Mga Miyembro sa Panimalay',
    en: 'Household members',
  },
  householdMembersDesc: {
    ceb: 'Kini ang mga aktibong rekord sa residente nga nakatala sa imong naaprobahan nga panimalay.',
    en: 'These active resident records are attached to your approved household.',
  },
  householdHeadTitle: {
    ceb: 'Pangulo sa Panimalay',
    en: 'Head of Household',
  },
  pendingApprovalsTitle: {
    ceb: 'Ginasusi pa nga mga Miyembro',
    en: 'Pending Member Approvals',
  },
  pendingApprovalsDesc: {
    ceb: 'Bag-ong mga miyembro nga imong gidugang nga naghulat pa sa pag-aproba sa MSWDO.',
    en: 'New members you submitted that are currently under review by MSWDO.',
  },
  registrationApprovedNotice: {
    ceb: 'Naaprobahan na ang imong panimalay! Dugangi og mga miyembro dinhi kon duna kay dugang sakop sa panimalay.',
    en: 'Your registration is already approved, so this page replaces the new registration flow. Add members here whenever your household list changes.',
  },
  noPendingApprovals: {
    ceb: 'Walay ginasusi nga miyembro karon. Approved na ang tanan.',
    en: 'No pending members at this time.',
  },
  noMembersYet: {
    ceb: 'Wala pay miyembro nga nakatala gawas sa pangulo.',
    en: 'No members recorded yet besides the head.',
  },
  memberAddedSuccess: {
    ceb: 'Nalampos ang pagsumiter sa bag-ong sakop! Ginasusi na kini sa MSWDO.',
    en: 'Member submitted successfully! It is now pending review by MSWDO.',
  },

  // Logout Dialog
  signOutDialogTitle: {
    ceb: 'Gusto ba ka mogawas?',
    en: 'Do you want to sign out?',
  },
  signOutDialogDesc: {
    ceb: 'Mobiya ka sa imong resident portal account sa Munisipyo sa Mabini. Mahimo kang mosulod pag-usab bisan unsang orasa.',
    en: 'You will leave your resident portal account for the Municipality of Mabini. You can sign in again anytime.',
  },
  signOutConfirmBtn: {
    ceb: 'Oo, Mogawas (Sign out)',
    en: 'Yes, Sign out',
  },
  signOutCancelBtn: {
    ceb: 'Dili, Magpabilin',
    en: 'Cancel, Stay signed in',
  },
  signingOutState: {
    ceb: 'Nag-sign out...',
    en: 'Signing out...',
  },

  // Access Issues Dialog
  accountRemovedTitle: {
    ceb: 'Natangtang ang Resident Account',
    en: 'Resident account removed',
  },
  accountDeactivatedTitle: {
    ceb: 'Na-deactivate ang Resident Account',
    en: 'Resident account deactivated',
  },
  accessUpdatedTitle: {
    ceb: 'Giusab ang Resident Access',
    en: 'Resident access changed',
  },
  accountMistakeNotice: {
    ceb: 'Kon sa imong pagtuo nasayop kini, kontaka dayon ang tigdumala sa MSWDO sa dili pa mosulod pag-usab.',
    en: 'If you believe this was a mistake, contact the MSWDO administrator before signing in again.',
  },
  signOutAndContinue: {
    ceb: 'Mogawas ug Magpadayon',
    en: 'Sign out and continue',
  },

  // Wizard Steps
  wizardStep1: {
    ceb: 'Personal nga Impormasyon',
    en: 'Personal Information',
  },
  wizardStep1Hint: {
    ceb: 'Pangalan, adlawng natawhan, kasarian',
    en: 'Name, birthdate, gender',
  },
  wizardStep2: {
    ceb: 'Lokasyon ug Puloy-anan',
    en: 'Location & Structure',
  },
  wizardStep2Hint: {
    ceb: 'Barangay, purok, GPS pin sa mapa',
    en: 'Barangay, purok, GPS map pin',
  },
  wizardStep3: {
    ceb: 'Miyembro sa Pamilya ug Prayoridad',
    en: 'Family Members & Priority',
  },
  wizardStep3Hint: {
    ceb: 'Mga sakop, PWD, mabdos, senior',
    en: 'Co-residents, PWD, pregnancy, senior',
  },
} as const;

export type ResidentTranslationKey = keyof typeof RESIDENT_TRANSLATIONS;

export function getCivilStatusTranslation(status: string | undefined | null, lang: ResidentLanguage): string {
  if (!status) return lang === 'ceb' ? 'Wala gibutang' : 'Not specified';
  const map: Record<string, { ceb: string; en: string }> = {
    single: { ceb: 'Ulay / Dalaga / Ulitawo', en: 'Single' },
    married: { ceb: 'Minyo', en: 'Married' },
    widowed: { ceb: 'Biyudo / Biyuda', en: 'Widowed' },
    separated: { ceb: 'Bulag', en: 'Separated' },
    cohabiting: { ceb: 'Nag-ipon / Live-in', en: 'Cohabiting' },
  };
  return map[status.toLowerCase()]?.[lang] ?? (status.charAt(0).toUpperCase() + status.slice(1));
}

export function getGenderTranslation(gender: string | undefined | null, lang: ResidentLanguage): string {
  if (!gender) return '';
  if (gender === 'M') {
    return lang === 'ceb' ? 'Lalaki' : 'Male';
  }
  if (gender === 'F') {
    return lang === 'ceb' ? 'Babaye' : 'Female';
  }
  return gender;
}

export function getIncomeLevelTranslation(level: string | undefined | null, lang: ResidentLanguage): string {
  if (!level) return lang === 'ceb' ? 'Wala gibutang' : 'Not specified';
  const map: Record<string, { ceb: string; en: string }> = {
    low: { ceb: 'Ubos', en: 'Low' },
    middle: { ceb: 'Taliwala', en: 'Middle' },
    high: { ceb: 'Taas', en: 'High' },
    below_10k: { ceb: 'Ubos sa ₱10,000 matag bulan', en: 'Below ₱10,000 / month' },
    '10k_to_20k': { ceb: '₱10,000 hangtod ₱20,000 matag bulan', en: '₱10,000 – ₱20,000 / month' },
    '20k_to_40k': { ceb: '₱20,000 hangtod ₱40,000 matag bulan', en: '₱20,000 – ₱40,000 / month' },
    above_40k: { ceb: 'Labaw sa ₱40,000 matag bulan', en: 'Above ₱40,000 / month' },
  };
  return map[level.toLowerCase()]?.[lang] ?? (level.charAt(0).toUpperCase() + level.slice(1).replace(/_/g, ' '));
}

export function getPwdTypeTranslation(type: string, lang: ResidentLanguage): string {
  const map: Record<string, { ceb: string; en: string }> = {
    physical: { ceb: 'Pisikal', en: 'Physical' },
    visual: { ceb: 'Panan-aw', en: 'Visual' },
    hearing: { ceb: 'Pangdungog', en: 'Hearing' },
    intellectual: { ceb: 'Panghuna-huna', en: 'Intellectual' },
    psychosocial: { ceb: 'Sikososyal', en: 'Psychosocial' },
  };
  return map[type.toLowerCase()]?.[lang] ?? (type.charAt(0).toUpperCase() + type.slice(1));
}

export function getRelationshipTranslation(rel: string, lang: ResidentLanguage): string {
  const map: Record<string, { ceb: string; en: string }> = {
    Head: { ceb: 'Pangulo sa Panimalay', en: 'Head of Household' },
    Spouse: { ceb: 'Bana / Asawa', en: 'Spouse' },
    Child: { ceb: 'Anak', en: 'Child' },
    Son: { ceb: 'Anak nga Lalaki', en: 'Son' },
    Daughter: { ceb: 'Anak nga Babaye', en: 'Daughter' },
    Parent: { ceb: 'Ginikanan', en: 'Parent' },
    Father: { ceb: 'Amahan', en: 'Father' },
    Mother: { ceb: 'Inahan', en: 'Mother' },
    Sibling: { ceb: 'Igsoon', en: 'Sibling' },
    Brother: { ceb: 'Igsuong Lalaki', en: 'Brother' },
    Sister: { ceb: 'Igsuong Babaye', en: 'Sister' },
    Grandchild: { ceb: 'Apo', en: 'Grandchild' },
    Grandfather: { ceb: 'Apohang Lalaki', en: 'Grandfather' },
    Grandmother: { ceb: 'Apohang Babaye', en: 'Grandmother' },
    Grandparent: { ceb: 'Apohan', en: 'Grandparent' },
    Relative: { ceb: 'Kabanay / Paryente', en: 'Relative' },
    Other: { ceb: 'Uban pa', en: 'Other' },
  };
  return map[rel]?.[lang] ?? rel;
}

interface ResidentLanguageContextValue {
  lang: ResidentLanguage;
  setLang: (lang: ResidentLanguage) => void;
  toggleLang: () => void;
  t: (key: ResidentTranslationKey) => string;
}

const ResidentLanguageContext = createContext<ResidentLanguageContextValue>({
  lang: 'ceb',
  setLang: () => {},
  toggleLang: () => {},
  t: (key) => RESIDENT_TRANSLATIONS[key]?.ceb ?? key,
});

export function ResidentLanguageProvider({ children }: { children: ReactNode }) {
  const [lang, setLangState] = useState<ResidentLanguage>('ceb');

  useEffect(() => {
    try {
      const saved = localStorage.getItem(RESIDENT_LANG_STORAGE_KEY);
      if (saved === 'en' || saved === 'ceb') {
        setLangState(saved);
      }
    } catch {
      // localStorage may fail in private mode
    }
  }, []);

  function setLang(newLang: ResidentLanguage) {
    setLangState(newLang);
    try {
      localStorage.setItem(RESIDENT_LANG_STORAGE_KEY, newLang);
      window.dispatchEvent(
        new CustomEvent('mswdo-resident-lang-changed', { detail: { lang: newLang } })
      );
    } catch {
      // Ignore
    }
  }

  function toggleLang() {
    setLang(lang === 'ceb' ? 'en' : 'ceb');
  }

  function t(key: ResidentTranslationKey): string {
    const entry = RESIDENT_TRANSLATIONS[key];
    if (!entry) return key;
    return entry[lang] ?? entry.ceb;
  }

  return (
    <ResidentLanguageContext.Provider value={{ lang, setLang, toggleLang, t }}>
      {children}
    </ResidentLanguageContext.Provider>
  );
}

export function useResidentLanguage() {
  return useContext(ResidentLanguageContext);
}
