<script>
  import { slide } from "svelte/transition";
</script>

<style>
  .wrapper {
    position: fixed;
    bottom: 0;
    left: 0;
    width: 100%;
    height: 100%;
    z-index: 1;
    background: #eee;
  }

  .content {
      margin: 10px 15px;
  }
</style>

<section class="wrapper" transition:slide={{ duration: 500 }}>
<div class="content">

  <slot />
</div>
</section>
