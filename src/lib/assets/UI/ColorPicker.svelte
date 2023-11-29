<script lang="ts">
	export let value = '#ffffff';

	// export function prop
	export let cp: (event: any) => void;
</script>

<div class="labeled-input-wrapper">
	<label>
		<input type="color" {value} on:change={cp} class="labeled-input" style="background-color: {value};" />
		<span class="label-text"><slot /></span>
	</label>
</div>

<style>
    input[type='color'] {
        transition: transform .1s ease-in-out, border-color .1s ease-in-out;
        border: 1px solid transparent;
    }

    input[type='color']:hover {
        transform: rotate(10deg);
        border-color: var(--gray-accent);
    }
    
</style>