import { InfoIcon, OctagonAlertIcon, TriangleAlertIcon, type LucideIcon } from '@lucide/svelte';
import type { CheckLevel } from '$lib/utils/reports';

/** How the checks' levels are marked, in the sidebar and over each check. */
export const levelIcons: Record<CheckLevel, { Icon: LucideIcon; color: string }> = {
	error: { Icon: OctagonAlertIcon, color: 'text-destructive' },
	warning: { Icon: TriangleAlertIcon, color: 'text-amber-500' },
	note: { Icon: InfoIcon, color: 'text-muted-foreground' }
};
