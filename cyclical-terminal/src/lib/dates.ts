// Calendar helpers. All dates are ISO strings (YYYY-MM-DD) compared lexicographically.

const QUARTER_ENDS = ['03-31', '06-30', '09-30', '12-31'];

export function quarterEnds(fromYear: number, toYear: number): string[] {
  const out: string[] = [];
  for (let y = fromYear; y <= toYear; y++) for (const q of QUARTER_ENDS) out.push(`${y}-${q}`);
  return out;
}

export function monthEnds(fromYear: number, toYear: number): string[] {
  const out: string[] = [];
  for (let y = fromYear; y <= toYear; y++) {
    for (let m = 1; m <= 12; m++) {
      const last = new Date(Date.UTC(y, m, 0)).getUTCDate();
      out.push(`${y}-${String(m).padStart(2, '0')}-${String(last).padStart(2, '0')}`);
    }
  }
  return out;
}

export function weekEnds(fromYear: number, toYear: number): string[] {
  const out: string[] = [];
  const d = new Date(Date.UTC(fromYear, 0, 1));
  while (d.getUTCDay() !== 5) d.setUTCDate(d.getUTCDate() + 1);
  while (d.getUTCFullYear() <= toYear) {
    out.push(d.toISOString().slice(0, 10));
    d.setUTCDate(d.getUTCDate() + 7);
  }
  return out;
}

export function daysBetween(a: string, b: string): number {
  return (Date.parse(b) - Date.parse(a)) / 86_400_000;
}

export function quarterLabel(date: string): string {
  const [y, m] = date.split('-');
  return `${y} Q${Math.ceil(Number(m) / 3)}`;
}

export function addDays(date: string, days: number): string {
  const d = new Date(Date.parse(date) + days * 86_400_000);
  return d.toISOString().slice(0, 10);
}
