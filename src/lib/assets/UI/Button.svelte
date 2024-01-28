<script lang="ts">
    export let click: (event: Event) => void;
    export let disabled = false;
    export let title: string = "";
</script>

<div class="button-wrapper">
    <button on:click={click} class="button" disabled={disabled} title="{title}"><slot /></button>
</div>

<style>
    .button-wrapper {
        display: flex;
        flex-direction: column;
        align-items: start;
        width: 100%;
        margin: 0.7rem 0.25rem;
    }

    .button {
        display: inline-block;
        max-width: 100%;
        overflow: hidden;
        padding: 0.3rem;
        border-radius: 0.36rem;
        border: 0.2rem solid var(--gray-accent);
        background-color: transparent;
        transition: border-color 0.1s, background-color 0.05s;
        appearance: none;
        font-size: 1rem;
        font-weight: 500;
        line-height: 1.25rem;
        cursor: pointer;
    }

    .button:not(:disabled):hover, .button:not(:disabled):focus-visible {
        outline: none;
        border-color: var(--accent-color);
    }

    .button:not(:disabled):active:hover, .button:not(:disabled):active:focus-visible {
        outline: none;
        background-color: var(--accent-color);
    }

    .button:disabled {
        opacity: 0.6;
        cursor: default;
    }

</style>