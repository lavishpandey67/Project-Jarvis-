import app from "./app";
import { logger } from "./lib/logger";
import { ensureWorkforceSeed } from "./lib/workforce";

const rawPort = process.env["PORT"] || "3000";

const port = Number(rawPort);

if (Number.isNaN(port) || port <= 0) {
  throw new Error(`Invalid PORT value: "${rawPort}"`);
}

ensureWorkforceSeed()
  .then(() => {
    app.listen(port, "0.0.0.0", (err) => {
      if (err) {
        logger.error({ err }, "Error listening on port");
        process.exit(1);
      }

      logger.info({ port, host: "0.0.0.0" }, "Server listening");
    });
  })
  .catch((err) => {
    logger.error({ err }, "Unable to seed workforce data");
    process.exit(1);
  });
