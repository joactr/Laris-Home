// Local-date helpers. date-only values must never be derived with
// toISOString(), which shifts the day for non-UTC timezones.
export function toDateString(date: Date): string {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
}

export function parseDateString(value: string): Date {
    const [year, month, day] = value.slice(0, 10).split('-').map(Number);
    return new Date(year, (month || 1) - 1, day || 1);
}

export function startOfDay(date: Date): Date {
    const next = new Date(date);
    next.setHours(0, 0, 0, 0);
    return next;
}

export function addDays(date: Date, days: number): Date {
    const next = startOfDay(date);
    next.setDate(next.getDate() + days);
    return next;
}

export function startOfWeek(date: Date): Date {
    const next = startOfDay(date);
    next.setDate(next.getDate() - next.getDay());
    return next;
}
