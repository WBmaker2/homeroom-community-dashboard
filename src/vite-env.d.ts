/// <reference types="vite/client" />

declare module "*.rules?raw" {
  const content: string;
  export default content;
}
