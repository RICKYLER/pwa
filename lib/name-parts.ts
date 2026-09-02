// Mirrors public.split_full_name / public.join_name_parts in Supabase so the
// forms and the database agree on how names are split and rejoined.

export interface NameParts {
  first: string;
  middle: string;
  last: string;
}

const NAME_SUFFIX_PATTERN = /^(jr\.?|sr\.?|ii|iii|iv|v)$/i;

export function joinNameParts(first: string, middle: string, last: string): string {
  return [first, middle, last]
    .map((part) => part.trim())
    .filter((part) => part.length > 0)
    .join(' ');
}

export function splitFullName(fullName: string): NameParts {
  const tokens = fullName.trim().split(/\s+/).filter((token) => token.length > 0);
  let suffix = '';

  // Keep common name suffixes with the surname.
  if (tokens.length > 1 && NAME_SUFFIX_PATTERN.test(tokens[tokens.length - 1])) {
    suffix = tokens.pop() as string;
  }

  if (tokens.length === 0) {
    return { first: '', middle: '', last: suffix };
  }

  if (tokens.length === 1) {
    return { first: tokens[0], middle: '', last: suffix };
  }

  if (tokens.length === 2) {
    return { first: tokens[0], middle: '', last: [tokens[1], suffix].filter(Boolean).join(' ') };
  }

  return {
    first: tokens[0],
    middle: tokens.slice(1, -1).join(' '),
    last: [tokens[tokens.length - 1], suffix].filter(Boolean).join(' '),
  };
}
