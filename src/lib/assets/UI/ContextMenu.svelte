<script lang="ts">
    import { cmOpacity } from "../../stores";

    export let shown = false;
    export let position = { x: 0, y: 0 };

    $: styles = {
        'cm-display': shown ? 'flex' : 'none',
		'cm-top': position.y,
        'cm-left': position.x,
        'cm-opacity': $cmOpacity,
	};
    const stylesUnits = {
        'cm-display': '',
		'cm-top': 'px',
        'cm-left': 'px',
        'cm-opacity': '%',
    };

    $: cssVarStyles = Object.entries(styles)
		.map(([key, value]) => `--${key}:${value}${stylesUnits[key]}`)
		.join(';');

</script>

<div class="context-menu" style="{cssVarStyles}">
    <slot />
    <p>HII:3</p>
</div>

<style>
    .context-menu {
        position: absolute;
        top: calc(var(--cm-top) - var(--top-bar-height));
        left: var(--cm-left);
        width: 100px;
        height: fit-content;
        background-color: var(--background-color);
        border-radius: 1em;
        border: 3px solid var(--accent-color);
        padding: 1em;
        z-index: 100;
        display: var(--cm-display);
        flex-direction: column;
        align-items: start;
        opacity: var(--cm-opacity);
    }
</style>