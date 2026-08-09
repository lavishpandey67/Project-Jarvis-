import express, { type Express } from "express";
import cors from "cors";
import path from "path";
import fs from "fs";
import pinoHttp from "pino-http";
import router from "./routes";
import { logger } from "./lib/logger";

const app: Express = express();

app.use(
  pinoHttp({
    logger,
    serializers: {
      req(req) {
        return {
          id: req.id,
          method: req.method,
          url: req.url?.split("?")[0],
        };
      },
      res(res) {
        return {
          statusCode: res.statusCode,
        };
      },
    },
  }),
);
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

app.use("/api", router);

const candidateStaticPaths = [
  path.resolve(process.cwd(), "artifacts/personal-ai-workforce/dist/public"),
  path.resolve(process.cwd(), "../personal-ai-workforce/dist/public"),
  path.resolve(process.cwd(), "dist/public"),
];

const staticPath =
  candidateStaticPaths.find((p) => fs.existsSync(path.join(p, "index.html"))) ||
  candidateStaticPaths[0];

app.use(express.static(staticPath));

app.use((req, res, next) => {
  if (req.method === "GET" && !req.path.startsWith("/api")) {
    return res.sendFile(path.join(staticPath, "index.html"), (err) => {
      if (err) {
        res.status(404).send("Application frontend build not found.");
      }
    });
  }
  next();
});

export default app;
