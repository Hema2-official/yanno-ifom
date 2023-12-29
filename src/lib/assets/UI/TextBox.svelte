<script lang="ts">
	export let value;
    export let disabled = false;
</script>

<div class="textbox-wrapper">
    <input type="text" placeholder=" " bind:value={value} class="" disabled={disabled} />
	<label class="tb-label"><span class="label-text"><slot /></span></label>
</div>

<style>
    input[type='text'] {
        border: none;
        outline: none;
        background-color: unset;
        font-size: 1rem;
        font-weight: 400;
        border-bottom: 2px solid var(--gray-accent);
		transition: border-color .1s ease-in-out;
        padding: 1px;
        margin: 0;
        width: 100%;
    }
	.textbox-wrapper {
		display: flex;
		flex-direction: column;
		align-items: start;
        position: relative;
        margin: 1rem .3rem;
	}
	.tb-label {
		display: flex;
		-webkit-user-select: none;
		-moz-user-select: none;
		user-select: none;
		cursor: text;
        position: absolute;
        left: 1px;
        transform-origin: 0 0;
        color: var(--gray-accent);
        transition: transform .1s ease-in-out, color .1s ease-in-out;
	}
    
    input[type='text']:focus {
        border-color: var(--focus-color);
    }
    input[type='text']:focus + .tb-label {
        color: var(--focus-color);
    }
    input[type='text']:focus + .tb-label, input:not(:placeholder-shown) + .tb-label {
        transform: translateY(-1rem) scale(.8);
    }
    input[type='text']::placeholder {
        color: transparent;
    }

    input[type='text']:disabled {
        opacity: 0.6;
        cursor: default;
    }
    input[type='text']:disabled + .tb-label {
        opacity: 0.6;
        cursor: default;
    }
</style>