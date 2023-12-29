<script lang="ts">
	export let value;
    export let disabled = false;
</script>

<div class="labeled-input-wrapper">
	<label>
		<input type="color" bind:value={value} class="labeled-input" style="background-color: {value};" disabled={disabled} />
		<span class="label-text"><slot /></span>
	</label>
</div>

<style>
    input[type='color'] {
        transition: transform .1s ease-in-out, border-color .1s ease-in-out, box-shadow .1s ease-in-out;
        box-shadow: none;
    }

    input[type='color']:not(:disabled):hover, input[type='color']:not(:disabled):focus-visible {
        outline: none;
        transform: rotate(10deg);
        box-shadow: 3px 3px 1px 0 var(--accent-color);
    }

    input[type='color']:disabled {
        opacity: 0.6;
        cursor: default;
    }
    input[type='color']:disabled + .label-text {
        opacity: 0.6;
        cursor: default;
    }
    label:has(input[type='color']:disabled) {
        cursor: default;
    }
    
</style>