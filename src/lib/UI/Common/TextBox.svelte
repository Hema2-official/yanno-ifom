<script lang="ts">
	export let value: string;
	export let disabled = false;
	export let title: string = '';
	export let type: 'text' | 'email' | 'password' = 'text';
</script>

<div class="textbox-wrapper" {title}>
	{#if type === 'email'}
		<input type="email" placeholder=" " bind:value class="tb-input" {disabled} />
	{:else if type === 'password'}
		<input type="password" placeholder=" " bind:value class="tb-input" {disabled} />
	{:else}
		<input type="text" placeholder=" " bind:value class="tb-input" {disabled} />
	{/if}
	<label class="tb-label"><span class="label-text"><slot /></span></label>
</div>

<style lang="scss">
	.textbox-wrapper {
		position: relative;
		display: flex;
		flex-direction: column;
		align-items: start;
		padding: 22px 4px 8px 4px;
		width: 100%;
	}

	.tb-input {
		width: 100%;
		padding: 1px;
		margin: 0;
		border: none;
		outline: none;
		background-color: unset;
		font-size: 16px;
		font-weight: 400;
		border-bottom: 2px solid var(--gray-accent);
		transition: border-color 0.1s ease-in-out;

		&:focus {
			border-color: var(--focus-color);

			& + .tb-label {
				color: var(--focus-color);
			}
		}

		&:focus + .tb-label,
		&:not(:placeholder-shown) + .tb-label {
			transform: translateY(-16px) scale(0.8);
		}

		&::placeholder {
			color: transparent;
		}

		&:disabled {
			opacity: 0.6;
			cursor: default;

			& + .tb-label {
				opacity: 0.6;
				cursor: default;
			}
		}

		&:-webkit-autofill {
			-webkit-background-clip: text;
		}
	}

	.tb-label {
		position: absolute;
		left: 5px; // 4px padding + 1px
		display: flex;
		color: var(--gray-accent);
		transform-origin: 0 0;
		transition:
			transform 0.1s ease-in-out,
			color 0.1s ease-in-out;
		cursor: default;
		-webkit-user-select: none;
		-moz-user-select: none;
		user-select: none;
	}
</style>
