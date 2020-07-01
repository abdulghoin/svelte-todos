<script>
  import { scale } from "svelte/transition";

  export let type = 'add'
</script>

<style>
  button {
    position: fixed;
    right: 8px;
    bottom: 8px;
    width: 54px;
    height: 54px;
    border-radius: 50%;
    display: flex;
    align-items: center;
    justify-content: center;
    border: none;
    background: #283;
    padding: 0;
    outline: none;
    cursor: pointer;
    z-index: 2;
  }

  img {
    width: 28px;
  }
</style>

<button on:click transition:scale>
  <img src="icons/{type}.svg" alt="{type}-icon" />
</button>
