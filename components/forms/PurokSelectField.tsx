'use client';

import { useEffect, useMemo, useState } from 'react';
import { getAllPuroks } from '@/lib/db/households';
import { getLocationMasterList } from '@/lib/db/location-master';
import { buildPurokFieldOptions, normalizePurokSitio } from '@/lib/geocoding';

interface PurokSelectFieldProps {
  /** Used as the select/datalist element id (hosts keep their own <label htmlFor>). */
  id: string;
  /** Selected barangay — drives which official purok list is loaded. */
  barangayId: string;
  value: string;
  onChange: (value: string) => void;
  /** Allow the empty option (e.g. alert rules that cover the whole barangay). */
  allowEmpty?: boolean;
  /** Label for the empty option (defaults to "Select purok"). */
  emptyLabel?: string;
  /** Control styling — pass the host form's input classes. */
  className?: string;
  /** Helper text styling — defaults to the wizard's helper classes. */
  helperClassName?: string;
  /** Placeholder for the free-text fallback input. */
  placeholder?: string;
  disabled?: boolean;
}

/**
 * Barangay-dependent purok picker. When the barangay has an official location
 * master list, renders a strict dropdown limited to that list (elderly-friendly:
 * pick instead of type). Otherwise falls back to the free-text input with
 * suggestions. A saved value that is not in the official list (legacy records)
 * stays visible as an extra option so editors are never forced to change it.
 */
export function PurokSelectField({
  id,
  barangayId,
  value,
  onChange,
  allowEmpty = false,
  emptyLabel,
  className,
  helperClassName,
  placeholder,
  disabled = false,
}: PurokSelectFieldProps) {
  const [masterListPuroks, setMasterListPuroks] = useState<string[]>([]);
  const [householdPuroks, setHouseholdPuroks] = useState<string[]>([]);

  useEffect(() => {
    let cancelled = false;

    async function loadPurokOptions() {
      if (!barangayId) {
        if (!cancelled) {
          setMasterListPuroks([]);
          setHouseholdPuroks([]);
        }
        return;
      }

      try {
        const [puroks, masterList] = await Promise.all([
          getAllPuroks(barangayId),
          getLocationMasterList(barangayId),
        ]);

        if (cancelled) {
          return;
        }

        setMasterListPuroks(masterList?.puroks ?? []);
        setHouseholdPuroks(puroks);
      } catch {
        if (!cancelled) {
          setMasterListPuroks([]);
          setHouseholdPuroks([]);
        }
      }
    }

    void loadPurokOptions();

    return () => {
      cancelled = true;
    };
  }, [barangayId]);

  const fieldOptions = useMemo(
    () => buildPurokFieldOptions({
      masterListPuroks,
      householdPuroks,
      currentValue: value,
    }),
    [masterListPuroks, householdPuroks, value],
  );

  if (fieldOptions.strict) {
    return (
      <div>
        <select
          id={id}
          value={value}
          onChange={(event) => onChange(event.target.value)}
          className={className}
          disabled={disabled}
        >
          <option value="" disabled={!allowEmpty}>
            {emptyLabel ?? 'Select purok'}
          </option>
          {fieldOptions.officialOptions.map((option) => (
            <option key={option} value={option}>
              {fieldOptions.includesLegacyValue && option === value
                ? `${option} (not in official list)`
                : option}
            </option>
          ))}
        </select>
        <p className={helperClassName ?? 'mt-2 text-xs text-slate-500'}>
          Choose your purok from the official list for this barangay.
        </p>
      </div>
    );
  }

  return (
    <div>
      <input
        id={id}
        type="text"
        list={`${id}-options`}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        onBlur={(event) => onChange(normalizePurokSitio(event.target.value))}
        className={className}
        placeholder={placeholder ?? 'Type the purok or sitio'}
        disabled={disabled}
      />
      <datalist id={`${id}-options`}>
        {fieldOptions.suggestions.map((option) => (
          <option key={option} value={option} />
        ))}
      </datalist>
      <p className={helperClassName ?? 'mt-2 text-xs text-slate-500'}>
        Type a new purok if it is not listed. Saved puroks will appear in suggestions.
      </p>
    </div>
  );
}
