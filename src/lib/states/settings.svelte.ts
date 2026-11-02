class SettingsState {
	/** The settings dialog, opened from the top bar or its shortcut. */
	open = $state(false);
	/** The id of the page it shows, by default the first. */
	page: string | null = $state(null);

	show(page: string) {
		this.page = page;
		this.open = true;
	}
}

export const settingsState = new SettingsState();
