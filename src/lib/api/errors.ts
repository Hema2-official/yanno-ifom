import { toast } from 'svelte-sonner';

export function extractError(error: unknown): string {
	if (error instanceof Error) return error.message;
	return String(typeof error === 'object' ? JSON.stringify(error) : error); // NOSONAR
}

/** Toasts an error and logs it: no toast-only errors. */
export function toastError(message: string, error?: unknown) {
	if (error === undefined) {
		console.error(message);
		toast.error(message);
	} else {
		console.error(message, error);
		toast.error(message, { description: extractError(error) });
	}
}
