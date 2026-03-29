type ClickOutsideOptions = {
	if?: boolean;
	callback?: () => void;
};

/** Dispatch event on click outside of node */
export function clickOutside(node: HTMLElement | null, options: ClickOutsideOptions = {}) {
	if (options.if !== undefined && options.if === false) return;

	const handleClick = (event: MouseEvent) => {
		if (node && !node.contains(event.target as Node)) {
			options.callback?.();
			node.dispatchEvent(new MouseEvent('click_outside', { relatedTarget: event.target }));
		}
	};

	document.addEventListener('click', handleClick, true);

	return {
		destroy() {
			document.removeEventListener('click', handleClick, true);
		}
	};
}
