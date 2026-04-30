import type { MeResponse } from '$lib/types/api.type';

export class AccountState {
	// undefined: awaiting status
	// null: guest
	// MeResponse: logged in
	currentAccount: MeResponse | null | undefined = $state(undefined);
}

export const accountState = new AccountState();
