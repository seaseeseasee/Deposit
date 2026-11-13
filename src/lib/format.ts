export const baht = (n: number | string) =>
  Number(n).toLocaleString('th-TH', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

export const dateTime = (d: Date | string) =>
  new Date(d).toLocaleString('th-TH', { dateStyle: 'short', timeStyle: 'short', timeZone: 'Asia/Bangkok' });

export const dateOnly = (d: Date | string) =>
  new Date(d).toLocaleDateString('th-TH', { dateStyle: 'medium', timeZone: 'Asia/Bangkok' });
