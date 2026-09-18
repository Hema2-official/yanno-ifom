import { getMe } from '$lib/api/users';
import type { MeResponse } from '$lib/types/api.type';

class AccountState {
	// undefined: awaiting status
	// null: guest
	// MeResponse: logged in
	currentAccount: MeResponse | null | undefined = $state(undefined);

	async refresh() {
		this.currentAccount = await getMe().catch(() => null);
	}
}

export const accountState = new AccountState();
