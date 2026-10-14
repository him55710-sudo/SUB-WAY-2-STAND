import { Router, type IRouter } from "express";
import { GetSubwayTrainsQueryParams, GetSubwayTrainsResponse } from "@workspace/api-zod";
import { createSubwayService } from "../lib/seoulSubway";
import { logger } from "../lib/logger";

const router: IRouter = Router();

// One service instance per process: shared cache + daily quota guard.
const service = createSubwayService({
  getKey: () => process.env["SEOUL_SUBWAY_API_KEY"]?.trim() || undefined,
  fetchImpl: (url, init) => fetch(url, init),
  log: { warn: (obj, msg) => logger.warn(obj, msg) },
});

router.get("/subway/trains", async (req, res) => {
  const parsed = GetSubwayTrainsQueryParams.safeParse(req.query);
  if (!parsed.success) {
    res.status(400).json({ error: "invalid_query" });
    return;
  }
  const body = await service.getTrains(parsed.data);
  res.set("Cache-Control", "no-store");
  res.json(GetSubwayTrainsResponse.parse(body));
});

export default router;
