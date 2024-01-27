<script lang="ts">
  import { addMessages, init } from "svelte-i18n";
  import Display from '$lib/assets/UI/Display.svelte';
  import TopBar from '$lib/assets/UI/TopBar.svelte';
  import SideBar from '$lib/assets/UI/SideBar.svelte';

  import en from "./lang/en.json";
  import { blob_pngs, data } from "$lib/stores";
  import { textToDataType } from "$lib/utils/data";
  import { getTiffFrames } from "$lib/utils/imaging";
  import { onMount } from "svelte";
  // import hu from "./lang/hu.json";

  addMessages("en", en);
  // addMessages("hu", hu);

  init({
    fallbackLocale: "en",
    initialLocale: "en",
  });

  // display demo data
  const stored_data = localStorage.getItem("demo_data");
  if (stored_data) {
    data.set(JSON.parse(stored_data));
  } else {
    onMount(() => {
      document.querySelector("#dataFileInput").addEventListener("change", (e) => {
        const file = (e.currentTarget as HTMLInputElement).files[0];
        if (!file) return;
        const reader = new FileReader();
        reader.onload = () => {
          const text = reader.result as string;
          textToDataType(text).then((d) => {
            data.set(d);
            localStorage.setItem("demo_data", JSON.stringify(d));
          });
        };
        reader.readAsText(file);
      });
    });
  }

  const stored_pngs = localStorage.getItem("demo_pngs");
  if (stored_pngs) {
    blob_pngs.set(JSON.parse(stored_pngs));
  } else {
    onMount(() => {
      document.querySelector("#tiffFileInput").addEventListener("change", (e) => {
        const file = (e.currentTarget as HTMLInputElement).files[0];
        if (!file) return;
        const reader = new FileReader();
        reader.onload = () => {
          const arrayBuffer = reader.result as ArrayBuffer;
          getTiffFrames(arrayBuffer).then((pngs) => {
            blob_pngs.set(pngs);
            localStorage.setItem("demo_data", JSON.stringify(pngs));
          });
          while ($blob_pngs.length > 0);
        };
        reader.readAsText(file);
      });
    });
  }
  
</script>

{#if !$data}
  <label for="dataFileInput">Load data</label>
  <br>
  <input type="file" id="dataFileInput" accept=".txt">
  <br>
{/if}

{#if $blob_pngs.length === 0}
  <label for="tiffFileInput">Load tiff</label>
  <br>
  <input type="file" id="tiffFileInput" accept=".tif,.tiff">
{/if}

{#if $data && $blob_pngs.length > 0}
  <SideBar right />
  <main>
    <TopBar />
    <Display />
  </main>
{/if}
