<script>
  import { slide } from "svelte/transition";

  import { createEventDispatcher } from "svelte";
  const dispatch = createEventDispatcher();

  export let todo;
  let isDescOpen = false;

  function toggleDescOpen() {
    isDescOpen = !isDescOpen;
  }

  function onDeleteTodo() {
    dispatch("deleteTodo", todo.id);
  }
</script>

<style>
  .wrapper {
    display: block;
    border: 2px solid #eee;
    border-radius: 4px;
    padding: 10px;
    margin: 0 0 10px;
  }

  .top {
    width: 100%;
    display: flex;
    align-items: center;
    justify-content: space-between;
  }

  h4 {
      width: 100%;
  }

  img {
    height: 20px;
  }

  p {
    margin: 15px 0 0;
  }
</style>

<div class="wrapper" on:click|self={toggleDescOpen}>
  <div class="top">
    <h4 on:click={toggleDescOpen}>{todo.title}</h4>
    <img src="icons/delete.svg" on:click={onDeleteTodo} />
  </div>
  {#if isDescOpen}
    <p transition:slide>{todo.desc}</p>
  {/if}
</div>
