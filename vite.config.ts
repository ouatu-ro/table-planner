import { defineConfig } from "vite";
import solid from "vite-plugin-solid";

export default defineConfig({
  base: "/table-planner/",
  plugins: [solid()],
  build: {
    target: "esnext",
  },
});
