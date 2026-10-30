class SettingsState {
	/** The settings dialog, opened from the top bar or its shortcut. */
	open = $state(false);
}

export const settingsState = new SettingsState();
