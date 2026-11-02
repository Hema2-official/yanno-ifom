export const clamp = (value: number, min: number, max: number) =>
	Math.min(max, Math.max(min, value));

export const wholeNumber = (value: number | null | undefined, min: number) =>
	typeof value === 'number' && Number.isInteger(value) && value >= min ? value : null;
