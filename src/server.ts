import { createServer } from "node:http";
import { toNodeHandler } from "h3";
import { createIngredientApp } from "./app";
import { getDbConnection } from "./db/connection";

const port = Number(process.env.PORT ?? 3000);
const host = process.env.HOST ?? "0.0.0.0";

const app = createIngredientApp();
getDbConnection();
const server = createServer(toNodeHandler(app));

server.listen(port, host, () => {
  console.log(`ingredient-db server listening on http://${host}:${port}`);
});
