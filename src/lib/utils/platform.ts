// userAgentData is Chromium-only and missing from TypeScript's DOM types
type UADataNavigator = Navigator & { userAgentData?: { platform: string } };

function detectPlatform(): string {
	if (typeof navigator === 'undefined') return '';
	return (navigator as UADataNavigator).userAgentData?.platform || navigator.platform;
}

const platform = detectPlatform();

/** Whether this is a Mac, iPhone or iPad, where ⌘ takes Ctrl's role in shortcuts. */
export const isApple = /mac|iphone|ipad|ipod/i.test(platform);
export const isLinux = /linux/i.test(platform);
export const isWindows = /^win/i.test(platform);

/** The major version of a Chromium browser, which Chrome, Edge and Brave all are. */
export const chromiumVersion =
	typeof navigator === 'undefined' ? undefined : navigator.userAgent.match(/Chrome\/(\d+)/)?.[1];
