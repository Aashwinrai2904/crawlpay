import { buildApp } from "./app";

const PORT = Number(process.env.PORT ?? 4100);

buildApp().listen(PORT, () => {
  console.log(`mock-facilitator listening on :${PORT}`);
});
