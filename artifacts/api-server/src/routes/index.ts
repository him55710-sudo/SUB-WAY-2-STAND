import { Router, type IRouter } from "express";
import healthRouter from "./health";
import subwayRouter from "./subway";

const router: IRouter = Router();

router.use(healthRouter);
router.use(subwayRouter);

export default router;
