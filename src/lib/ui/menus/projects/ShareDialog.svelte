<script lang="ts">
	import { goto } from '$app/navigation';
	import { resolve } from '$app/paths';
	import { resource } from 'runed';
	import { toast } from 'svelte-sonner';
	import { LoaderCircleIcon, LogOutIcon, SearchIcon, UserPlusIcon, XIcon } from '@lucide/svelte';
	import * as Dialog from '$lib/components/ui/dialog';
	import * as Item from '$lib/components/ui/item';
	import * as Select from '$lib/components/ui/select';
	import { Button } from '$lib/components/ui/button';
	import ConfirmDialog from '$lib/ui/common/ConfirmDialog.svelte';
	import { addMember, getMembers, removeMember, updateMember } from '$lib/api/projects';
	import { searchUsers } from '$lib/api/users';
	import { extractError, toastError } from '$lib/api/errors';
	import { accountState } from '$lib/states/AccountState.svelte';
	import type { MemberRole, Project, ProjectMember, UserSummary } from '$lib/types/api.type';
	import * as InputGroup from '$lib/components/ui/input-group';

	type Props = { open: boolean; project: Project };
	let { open = $bindable(false), project }: Props = $props();

	const memberRoles: MemberRole[] = ['viewer', 'editor'];

	const isOwner = $derived(project.role === 'owner');

	// Fetched again whenever the dialog opens
	const members = resource(
		() => (open ? project.id : null),
		async (projectId, _, { signal }): Promise<ProjectMember[]> =>
			projectId ? getMembers(projectId, { signal }) : [],
		{ initialValue: [] }
	);

	let search = $state('');
	const query = $derived(open && isOwner ? search.trim() : '');

	const results = resource(
		() => query,
		async (text, _, { signal }): Promise<UserSummary[]> =>
			text ? searchUsers(text, { signal }) : [],
		{ initialValue: [], debounce: 600 }
	);

	// The found users who don't have access yet
	const candidates = $derived(
		results.current.filter(
			(user) =>
				user.id !== project.owner.id &&
				!members.current.some((m) => m.account.id === user.id)
		)
	);

	async function add(user: UserSummary) {
		try {
			// Add with a default 'viewer' role to prevent accidental editing grants
			const member = await addMember(project.id, { account_id: user.id, role: 'viewer' });
			members.mutate([...members.current, member]);
			search = '';
		} catch (error) {
			toastError(`Failed to share with ${user.name}`, error);
		}
	}

	async function changeRole(member: ProjectMember, role: MemberRole) {
		if (role === member.role) return;
		try {
			const updated = await updateMember(project.id, member.account.id, role);
			const memberIdx = members.current.findIndex((m) => m.account.id === member.account.id);
			if (memberIdx !== -1) members.mutate(members.current.with(memberIdx, updated));
		} catch (error) {
			toastError('Failed to change the role', error);
		}
	}

	let showLeaveDialog = $state(false);

	async function leave() {
		const accountId = accountState.currentAccount?.id;
		if (accountId === undefined) return;
		try {
			await removeMember(project.id, accountId);
			open = false;
			toast.success(`You left "${project.name}"`);
			goto(resolve('/projects'));
		} catch (error) {
			toastError('Failed to leave the project', error);
		}
	}

	async function remove(member: ProjectMember) {
		try {
			await removeMember(project.id, member.account.id);
			members.mutate(members.current.filter((m) => m.account.id !== member.account.id));
		} catch (error) {
			toastError(`Failed to remove ${member.account.name}`, error);
		}
	}
</script>

{#snippet person(user: UserSummary)}
	<Item.Content class="min-w-0">
		<Item.Title class="truncate">{user.name}</Item.Title>
		<Item.Description class="truncate">{user.email}</Item.Description>
	</Item.Content>
{/snippet}

{#snippet roleSelect(role: MemberRole, onChange: (role: MemberRole) => void)}
	<Select.Root type="single" bind:value={() => role, onChange}>
		<Select.Trigger class="w-24 capitalize">{role}</Select.Trigger>
		<Select.Content>
			{#each memberRoles as r (r)}<Select.Item value={r} class="capitalize" />{/each}
		</Select.Content>
	</Select.Root>
{/snippet}

{#snippet error(res: typeof members | typeof results)}
	<p class="text-destructive px-3 text-[0.8rem]">
		{extractError(res.error)}
		<Button variant="link" size="sm" onclick={() => res.refetch()} class="text-destructive h-4!"
			>Try again</Button
		>
	</p>
{/snippet}

<Dialog.Root bind:open>
	<Dialog.Content class="sm:max-w-lg">
		<Dialog.Header>
			<Dialog.Title>{isOwner ? 'Share' : 'People in'} "{project.name}"</Dialog.Title>
			{#if !isOwner}<Dialog.Description>
					Only the owner can change who has access.
				</Dialog.Description>{/if}
		</Dialog.Header>

		{#if isOwner}
			<div class="flex gap-2">
				<InputGroup.Root>
					<InputGroup.Input
						bind:value={search}
						placeholder="Search by name or email..."
					/>
					<InputGroup.Addon><SearchIcon /></InputGroup.Addon>
					{#if results.loading}<InputGroup.Addon align="inline-end">
							<LoaderCircleIcon class="animate-spin" />
						</InputGroup.Addon>{/if}
				</InputGroup.Root>
			</div>

			{#if query}
				<div class="flex flex-col">
					{#if results.error}
						{@render error(results)}
					{:else if candidates.length === 0}
						<p class="text-muted-foreground px-3 text-sm">No one else found.</p>
					{:else}
						{#each candidates as user (user.id)}
							<Item.Root size="sm" class="flex-nowrap">
								{@render person(user)}
								<Item.Actions>
									<Button size="sm" variant="secondary" onclick={() => add(user)}>
										<UserPlusIcon data-icon="inline-start" /> Add
									</Button>
								</Item.Actions>
							</Item.Root>
						{/each}
					{/if}
				</div>
			{/if}
		{/if}

		<div class="flex flex-col border-t pt-2">
			<Item.Root size="sm" class="flex-nowrap">
				{@render person(project.owner)}
				<Item.Actions class="text-muted-foreground text-sm">Owner</Item.Actions>
			</Item.Root>

			{#if members.error}
				{@render error(members)}
			{:else}
				{#each members.current as member (member.account.id)}
					<Item.Root size="sm" class="flex-nowrap">
						{@render person(member.account)}
						<Item.Actions>
							{#if isOwner}
								{@render roleSelect(member.role, (r) => changeRole(member, r))}

								<Button
									variant="ghost"
									size="icon"
									class="hover:bg-destructive/40!"
									aria-label="Remove {member.account.name}"
									onclick={() => remove(member)}
								>
									<XIcon />
								</Button>
							{:else}
								<span class="text-muted-foreground text-sm capitalize">
									{member.role}
								</span>
							{/if}
						</Item.Actions>
					</Item.Root>
				{/each}
			{/if}
		</div>

		{#if !isOwner}
			<Dialog.Footer>
				<Button variant="secondary" onclick={() => (showLeaveDialog = true)}>
					<LogOutIcon data-icon="inline-start" /> Leave project
				</Button>
			</Dialog.Footer>
		{/if}
	</Dialog.Content>
</Dialog.Root>

<ConfirmDialog
	bind:open={showLeaveDialog}
	title="Leave project?"
	description={`You will lose access to "${project.name}" until ${project.owner.name} shares it with you again.`}
	confirmLabel="Leave"
	onConfirm={leave}
/>
