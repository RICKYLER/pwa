/**
 * Convert numeric monetary amount into standard capitalized words
 * for Philippine Government petty cash vouchers, checks, and receipts.
 * Example: 3000 -> "THREE THOUSAND PESOS ONLY"
 */
export function amountToWords(amount: number | string): string {
  const num = typeof amount === 'string' ? parseFloat(amount) : amount;
  if (isNaN(num) || num <= 0) return 'ZERO PESOS ONLY';

  const ones = [
    '',
    'ONE',
    'TWO',
    'THREE',
    'FOUR',
    'FIVE',
    'SIX',
    'SEVEN',
    'EIGHT',
    'NINE',
    'TEN',
    'ELEVEN',
    'TWELVE',
    'THIRTEEN',
    'FOURTEEN',
    'FIFTEEN',
    'SIXTEEN',
    'SEVENTEEN',
    'EIGHTEEN',
    'NINETEEN',
  ];

  const tens = [
    '',
    '',
    'TWENTY',
    'THIRTY',
    'FORTY',
    'FIFTY',
    'SIXTY',
    'SEVENTY',
    'EIGHTY',
    'NINETY',
  ];

  function convertChunk(chunk: number): string {
    let str = '';
    let val = chunk;
    if (val >= 100) {
      str += ones[Math.floor(val / 100)] + ' HUNDRED ';
      val %= 100;
    }
    if (val >= 20) {
      str += tens[Math.floor(val / 10)] + ' ';
      val %= 10;
    }
    if (val > 0) {
      str += ones[val] + ' ';
    }
    return str.trim();
  }

  const integerPart = Math.floor(num);
  const decimalPart = Math.round((num - integerPart) * 100);

  if (integerPart === 0 && decimalPart === 0) return 'ZERO PESOS ONLY';

  let result = '';
  const millions = Math.floor(integerPart / 1000000);
  const thousands = Math.floor((integerPart % 1000000) / 1000);
  const remainder = integerPart % 1000;

  if (millions > 0) {
    result += convertChunk(millions) + ' MILLION ';
  }
  if (thousands > 0) {
    result += convertChunk(thousands) + ' THOUSAND ';
  }
  if (remainder > 0) {
    result += convertChunk(remainder) + ' ';
  }

  result = result.trim() + ' PESOS';

  if (decimalPart > 0) {
    result += ` & ${decimalPart}/100 ONLY`;
  } else {
    result += ' ONLY';
  }

  return result.toUpperCase();
}
