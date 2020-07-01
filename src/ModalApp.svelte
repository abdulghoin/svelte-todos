<script>
  import Modal from "./Modal.svelte";
  import FAB from "./FAB.svelte";
  import { createEventDispatcher } from "svelte";
  const dispatch = createEventDispatcher();

  let title = "";
  let desc = "";

  function onAddTodo() {
    dispatch("addTodo", {id: Math.floor(Math.random() * 1000000), title, desc });
  }
</script>

<style>
  .add-wrapper {
    width: 100%;
  }

  input,
  textarea {
    border: 1px solid #eee;
    margin: 10px 0;
    padding: 10px;
    width: calc(100% - 20px);
    border-radius: 4px;
    outline: none;
  }

  textarea {
    height: 150px;
  }
</style>

<Modal>
  <form class="add-wrapper" on:submit|preventDefault={onAddTodo}>
    <input type="text" bind:value={title} placeholder="Judul" autofocus />
    <textarea bind:value={desc} placeholder="Deskripsi" />
  </form>
</Modal>

<FAB on:click={onAddTodo} type="send" />
