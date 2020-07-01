<script>
  import Header from "./Header.svelte";
  import List from "./List.svelte";
  import FAB from "./FAB.svelte";
  import ModalApp from "./ModalApp.svelte";

  let isModalOpen = false;

  let todos = [];

  function toggleModal() {
    isModalOpen = !isModalOpen;
  }

  function onAddTodo(e) {
    todos = [...todos, e.detail];
    isModalOpen = !isModalOpen;
  }

  function onDeleteTodo(e) {
    todos = todos.filter(({ id }) => id != e.detail);
  }
</script>

<style>
  main {
    padding: 10px 15px;
  }
</style>

<Header />
<main>
  <List {todos} on:deleteTodo={onDeleteTodo} />
</main>

<FAB on:click={toggleModal} />

{#if isModalOpen}
  <ModalApp on:addTodo={onAddTodo} />
{/if}
