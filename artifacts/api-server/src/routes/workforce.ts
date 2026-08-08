import { Router, type IRouter } from "express";
import {
  GetConversationParams,
  ListMessagesParams,
  UpdateMemoryParams,
  DeleteMemoryParams,
  UpdateTaskParams,
} from "@workspace/api-zod";
import {
  createConversation,
  createMemory,
  createTask,
  deleteMemory,
  ensureWorkforceSeed,
  getConversation,
  getSummary,
  listActivity,
  listAgents,
  listConversations,
  listMemories,
  listMessages,
  listTasks,
  respondWithCompanion,
  updateMemory,
  updateTask,
} from "../lib/workforce";

const router: IRouter = Router();
router.use(async (_req, _res, next) => {
  await ensureWorkforceSeed();
  next();
});

router.post("/companion/respond", async (req, res): Promise<void> => {
  try {
    res.json(await respondWithCompanion(req.body));
  } catch (error) {
    req.log.error({ err: error }, "Companion request failed");
    res.status(400).json({ error: error instanceof Error ? error.message : "Companion request failed" });
  }
});

router.get("/conversations", async (_req, res) => res.json(await listConversations()));
router.post("/conversations", async (req, res): Promise<void> => {
  try {
    res.status(201).json(await createConversation(req.body));
  } catch (error) {
    res.status(400).json({ error: error instanceof Error ? error.message : "Invalid conversation" });
  }
});
router.get("/conversations/:id", async (req, res): Promise<void> => {
  const params = GetConversationParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }
  const conversation = await getConversation(params.data.id);
  if (!conversation) {
    res.status(404).json({ error: "Conversation not found" });
    return;
  }
  res.json(conversation);
});
router.get("/conversations/:id/messages", async (req, res): Promise<void> => {
  const params = ListMessagesParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }
  res.json(await listMessages(params.data.id));
});

router.get("/memory", async (_req, res) => res.json(await listMemories()));
router.post("/memory", async (req, res): Promise<void> => {
  try {
    res.status(201).json(await createMemory(req.body));
  } catch (error) {
    res.status(400).json({ error: error instanceof Error ? error.message : "Invalid memory" });
  }
});
router.patch("/memory/:id", async (req, res): Promise<void> => {
  const params = UpdateMemoryParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }
  try {
    const memory = await updateMemory(params.data.id, req.body);
    if (!memory) {
      res.status(404).json({ error: "Memory not found" });
      return;
    }
    res.json(memory);
  } catch (error) {
    res.status(400).json({ error: error instanceof Error ? error.message : "Invalid memory" });
  }
});
router.delete("/memory/:id", async (req, res): Promise<void> => {
  const params = DeleteMemoryParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }
  await deleteMemory(params.data.id);
  res.sendStatus(204);
});

router.get("/agents", async (_req, res) => res.json(await listAgents()));
router.get("/tasks", async (_req, res) => res.json(await listTasks()));
router.post("/tasks", async (req, res): Promise<void> => {
  try {
    res.status(201).json(await createTask(req.body));
  } catch (error) {
    res.status(400).json({ error: error instanceof Error ? error.message : "Invalid task" });
  }
});
router.patch("/tasks/:id", async (req, res): Promise<void> => {
  const params = UpdateTaskParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }
  try {
    const task = await updateTask(params.data.id, req.body);
    if (!task) {
      res.status(404).json({ error: "Task not found" });
      return;
    }
    res.json(task);
  } catch (error) {
    res.status(400).json({ error: error instanceof Error ? error.message : "Invalid task" });
  }
});
router.get("/activity", async (_req, res) => res.json(await listActivity()));
router.get("/summary", async (_req, res) => res.json(await getSummary()));

export default router;