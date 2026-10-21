import { createApp, reactive } from "vue";
import { alignSides } from "../userscript/align.ts";
import ReviewApp from "../userscript/review/ReviewApp.vue";
import "../userscript/review/review.css";
import { fixtureState } from "./fixture.ts";

const state = reactive(fixtureState());
state.rows = alignSides(state.latestText, state.proposal);

createApp(ReviewApp, {
  state,
  actions: {
    apply: async () => {
      state.statusText = "Applied.";
      state.done = true;
    },
    reject: async () => {
      state.statusText = "Skipped.";
      state.done = true;
    },
    undo: async () => {
      state.statusText = "Undone.";
      state.done = true;
    },
  },
}).mount("#app");
