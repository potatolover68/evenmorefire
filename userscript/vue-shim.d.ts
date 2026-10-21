declare module "*.vue" {
  import type { DefineComponent } from "vue";
  const component: DefineComponent;
  export default component;
}

declare module "*.css" {}

declare module "*.css?inline" {
  const css: string;
  export default css;
}
