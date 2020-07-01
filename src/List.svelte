<script>
  import ListItem from "./ListItem.svelte";
  import { fade } from "svelte/transition";
  import { flip } from "svelte/animate";

  export let todos = [];
</script>

<style>
  ul {
    list-style-type: none;
  }
</style>

<ul>
  {#each todos as todo (todo.id)}
    <li transition:fade animate:flip>
      <ListItem {todo} on:deleteTodo />
    </li>
  {/each}
</ul>
