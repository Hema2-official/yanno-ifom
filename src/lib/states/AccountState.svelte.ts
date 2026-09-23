import { getMe, updateMe } from '$lib/api/users';
import type { MeResponse } from '$lib/types/api.type';

class AccountState {
	// undefined: awaiting status
	// null: guest
	// MeResponse: logged in
	currentAccount: MeResponse | null | undefined = $state(undefined);

	async refresh() {
		this.currentAccount = await getMe().catch(() => null);
	}

	async setName(name: string) {
		this.currentAccount = await updateMe({ name });
	}
}

export const accountState = new AccountState();
