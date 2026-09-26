class SettingsState {
	/** The settings dialog, opened from the account menu or its shortcut. */
	open = $state(false);
}

export const settingsState = new SettingsState();
