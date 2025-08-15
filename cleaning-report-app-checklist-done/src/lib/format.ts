export const formatCurrency = (amount: number, currency = 'GBP', locale = 'en-GB') =>
  new Intl.NumberFormat(locale, { style: 'currency', currency }).format(Number(amount)||0);

export const formatDate = (iso: string, locale = 'en-GB') => {
  if (!iso) return '';
  const d = new Date(iso);
  if (isNaN(d.getTime())) return iso;
  return d.toLocaleDateString(locale, { year: 'numeric', month: 'short', day: '2-digit' });
};
