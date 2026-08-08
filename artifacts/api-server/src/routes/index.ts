import { Router, type IRouter } from "express";
import healthRouter from "./health";
import workforceRouter from "./workforce";

const router: IRouter = Router();

router.use(healthRouter);
router.use(workforceRouter);

export default router;
