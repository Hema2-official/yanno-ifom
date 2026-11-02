// userAgentData is Chromium-only and missing from TypeScript's DOM types
type UADataNavigator = Navigator & { userAgentData?: { platform: string } };

function detectApple(): boolean {
	if (typeof navigator === 'undefined') return false;
	const platform = (navigator as UADataNavigator).userAgentData?.platform || navigator.platform;
	return /mac|iphone|ipad|ipod/i.test(platform);
}

/** Whether this is a Mac, iPhone or iPad, where ⌘ takes Ctrl's role in shortcuts. */
export const isApple = detectApple();

/** The major version of a Chromium browser, which Chrome, Edge and Brave all are. */
export const chromiumVersion =
	typeof navigator === 'undefined' ? undefined : navigator.userAgent.match(/Chrome\/(\d+)/)?.[1];
