/*
 * One way to write money, months and times everywhere. Money uses uk-UA
 * grouping and a non-breaking space before the sign: "1 240,00 ₴".
 */

const MONEY = new Intl.NumberFormat('uk-UA', {minimumFractionDigits: 2, maximumFractionDigits: 2});
const KYIV = 'Europe/Kyiv';

export const formatMoney = (value: number | string | null | undefined) =>
    `${MONEY.format(Number(value ?? 0))}\u00a0₴`;

/** The number only, for inputs and copy buttons: "513,61". */
export const formatAmount = (value: number | string | null | undefined) => MONEY.format(Number(value ?? 0));

// Spelled out rather than taken from Intl: en-GB writes "Sept" in newer ICU.
const MONTHS_SHORT = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const MONTHS_LONG = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September',
    'October', 'November', 'December'];

const splitYearMonth = (yearMonth: string) => {
    const [year, month] = yearMonth.split('-').map(Number);
    return {year, month: (month || 1) - 1};
};

/** "2026-09" → "Sep". */
export const formatMonthName = (yearMonth: string) => MONTHS_SHORT[splitYearMonth(yearMonth).month];

/** "2026-09" → "Sep 2026". */
export const formatMonth = (yearMonth: string | null | undefined) => {
    if (!yearMonth) return '—';
    const {year, month} = splitYearMonth(yearMonth);
    return `${MONTHS_SHORT[month]} ${year}`;
};

/** "2026-09" → "September 2026". */
export const formatMonthLong = (yearMonth: string | null | undefined) => {
    if (!yearMonth) return '—';
    const {year, month} = splitYearMonth(yearMonth);
    return `${MONTHS_LONG[month]} ${year}`;
};

/** "Sep 2026", or "Jul – Aug 2026" for a range. */
export const formatPeriod = (fromMonth: string, toMonth: string) => {
    if (fromMonth === toMonth) return formatMonth(fromMonth);
    const [fromYear] = fromMonth.split('-');
    const [toYear] = toMonth.split('-');
    const from = fromYear === toYear ? MONTHS_SHORT[splitYearMonth(fromMonth).month] : formatMonth(fromMonth);
    return `${from} – ${formatMonth(toMonth)}`;
};

/** A LocalDate "2026-09-02" → "2 Sep 2026". */
export const formatDate = (isoDate: string | null | undefined) => {
    if (!isoDate) return '—';
    const [year, month, day] = isoDate.slice(0, 10).split('-').map(Number);
    return `${day} ${MONTHS_SHORT[month - 1]} ${year}`;
};

const kyivDay = (date: Date) => new Intl.DateTimeFormat('en-CA', {timeZone: KYIV}).format(date);

/** Day and short month of an instant in Kyiv: "16 Oct". */
export const kyivDayMonth = (date: Date) => {
    const [, month, day] = kyivDay(date).split('-').map(Number);
    return `${day} ${MONTHS_SHORT[month - 1]}`;
};

/** An instant → "14:02". */
export const formatTime = (instant: string | null | undefined) =>
    instant
        ? new Intl.DateTimeFormat('en-GB', {hour: '2-digit', minute: '2-digit', timeZone: KYIV}).format(new Date(instant))
        : '—';

/** An instant → "Today 14:02", "Yesterday 21:17" or "15 Oct 18:02". */
export const formatWhen = (instant: string | null | undefined) => {
    if (!instant) return '—';
    const date = new Date(instant);
    const now = new Date();
    const yesterday = new Date(now.getTime() - 24 * 60 * 60 * 1000);
    const time = formatTime(instant);
    if (kyivDay(date) === kyivDay(now)) return `Today ${time}`;
    if (kyivDay(date) === kyivDay(yesterday)) return `Yesterday ${time}`;
    return `${kyivDayMonth(date)} ${time}`;
};

/** An instant → "16 Oct 2026". */
export const formatInstantDate = (instant: string | null | undefined) =>
    instant ? `${kyivDayMonth(new Date(instant))} ${kyivDay(new Date(instant)).slice(0, 4)}` : '—';

/** Whole days from a LocalDate or instant until now. */
export const daysSince = (date: string | null | undefined) => {
    if (!date) return 0;
    const then = new Date(date.length === 10 ? `${date}T00:00:00Z` : date).getTime();
    return Math.max(0, Math.floor((Date.now() - then) / (24 * 60 * 60 * 1000)));
};

/** "Friday, 16 October 2026" in Kyiv. */
export const formatToday = () => {
    const now = new Date();
    const weekday = new Intl.DateTimeFormat('en-GB', {weekday: 'long', timeZone: KYIV}).format(now);
    const [year, month, day] = kyivDay(now).split('-').map(Number);
    return `${weekday}, ${day} ${MONTHS_LONG[month - 1]} ${year}`;
};

/** The current month in Kyiv as "2026-10". */
export const currentMonth = () => kyivDay(new Date()).slice(0, 7);

export const plural = (count: number, one: string, many = `${one}s`) => `${count} ${count === 1 ? one : many}`;
