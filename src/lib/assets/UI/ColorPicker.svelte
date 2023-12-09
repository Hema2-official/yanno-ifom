<script lang="ts">
	export let value;
</script>

<div class="labeled-input-wrapper">
	<label>
		<input type="color" bind:value={value} class="labeled-input" style="background-color: {value};" />
		<span class="label-text"><slot /></span>
	</label>
</div>

<style>
    input[type='color'] {
        transition: transform .1s ease-in-out, border-color .1s ease-in-out, box-shadow .1s ease-in-out;
        box-shadow: none;
    }

    input[type='color']:hover, input[type='color']:focus-visible {
        outline: none;
        transform: rotate(10deg);
        box-shadow: 3px 3px 1px 0 var(--accent-color);
    }
    
</style>