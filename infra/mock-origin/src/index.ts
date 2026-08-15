import { buildApp } from "./app";

const PORT = Number(process.env.PORT ?? 4000);

buildApp().listen(PORT, () => {
  console.log(`mock-origin listening on :${PORT}`);
});
