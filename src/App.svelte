<script>
  import { addMessages, init } from "svelte-i18n";
  import Display from './lib/assets/UI/Display.svelte';
  import TopBar from './lib/assets/UI/TopBar.svelte';
  import RightBar from './lib/assets/UI/RightBar.svelte';

  import en from "./lang/en.json";
  // import hu from "./lang/hu.json";

  addMessages("en", en);
  // addMessages("hu", hu);

  init({
    fallbackLocale: "en",
    initialLocale: "en",
  });
</script>

<TopBar />
<main>
  <Display />
</main>

<RightBar />
