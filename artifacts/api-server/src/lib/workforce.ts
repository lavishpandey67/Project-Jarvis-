import { and, desc, eq, ne, sql } from "drizzle-orm";
import { db } from "@workspace/db";
import {
  activitiesTable,
  agentsTable,
  conversationsTable,
  memoriesTable,
  messagesTable,
  tasksTable,
} from "@workspace/db";
import {
  RespondWithCompanionBody,
  RespondWithCompanionResponse,
  CreateConversationBody,
  CreateMemoryBody,
  CreateTaskBody,
  ListActivityResponse,
  ListAgentsResponse,
  ListConversationsResponse,
  ListMemoriesResponse,
  ListMessagesResponse,
  ListTasksResponse,
  GetWorkforceSummaryResponse,
  UpdateMemoryBody,
  UpdateTaskBody,
} from "@workspace/api-zod";

import { processWithJarvisBrain } from "./jarvis";

const agentSeeds = [
  {
    name: "Research Agent",
    role: "research",
    description:
      "Finds, compares, and synthesizes structured information into concise, source-aware briefs.",
    status: "active",
  },
  {
    name: "Strategy Agent",
    role: "strategy",
    description:
      "Provides strategic reasoning, task prioritization, decision frameworks, resource allocation, and trade-off analyses.",
    status: "active",
  },
  {
    name: "Builder Agent",
    role: "builder",
    description:
      "Turns clear objectives into executable code, practical implementation plans, and technical artifacts.",
    status: "active",
  },
  {
    name: "Critic Agent",
    role: "critic",
    description:
      "Stress-tests proposals, identifies gaps, detects contradictions, and evaluates outputs before delivery.",
    status: "active",
  },
  {
    name: "Executor Agent",
    role: "executor",
    description:
      "Executes approved operational tasks, manages system state, and interacts with workspace tools within permissions.",
    status: "active",
  },
];

let seeded = false;

export async function ensureWorkforceSeed(): Promise<void> {
  if (seeded) return;
  await db.insert(agentsTable).values(agentSeeds).onConflictDoNothing();

  const [{ value: conversationCount }] = await db
    .select({ value: sql<number>`count(*)` })
    .from(conversationsTable);
  if (Number(conversationCount) === 0) {
    await db.insert(conversationsTable).values({ title: "Companion workspace" });
  }

  const [{ value: memoryCount }] = await db
    .select({ value: sql<number>`count(*)` })
    .from(memoriesTable);
  if (Number(memoryCount) === 0) {
    await db.insert(memoriesTable).values({
      title: "V0 operating principle",
      content:
        "The Companion should delegate only when it creates leverage, give agents only the context they need, and review every delegated result before returning it.",
      kind: "decision",
      importance: 5,
    });
  }

  seeded = true;
}

type LlmMessage = { role: "system" | "user" | "assistant"; content: string };

type CompanionPlan = {
  objective: string;
  delegate: boolean;
  agentName: string | null;
  taskTitle: string | null;
  agentBrief: string | null;
  directAnswer: string | null;
};

function selectFallbackAgent(message: string) {
  const value = message.toLowerCase();
  if (/(research|find|compare|source|investigate|learn|market|information)/.test(value)) {
    return "Research Agent";
  }
  if (/(build|create|make|implement|write|plan|design|ship|code)/.test(value)) {
    return "Builder Agent";
  }
  if (/(review|critic|critique|check|improve|audit|risk|feedback)/.test(value)) {
    return "Critic Agent";
  }
  return null;
}

function fallbackPlan(message: string): CompanionPlan {
  const agentName = selectFallbackAgent(message);
  const objective = message.trim();
  if (!agentName) {
    return {
      objective,
      delegate: false,
      agentName: null,
      taskTitle: null,
      agentBrief: null,
      directAnswer:
        "I understand the request. I’m keeping it in Companion mode for now. Clarify the outcome you want, and I’ll either answer directly or route it to the right specialist.",
    };
  }

  const taskTitle = `${agentName.replace(" Agent", "")} pass`;
  return {
    objective,
    delegate: true,
    agentName,
    taskTitle,
    agentBrief: `Work on this objective: ${objective}. Return a concise first pass with assumptions and one recommended next step.`,
    directAnswer: null,
  };
}

function fallbackAgentResult(agentName: string, objective: string) {
  const label = agentName.replace(" Agent", "");
  return `${label} Agent completed a local first pass on “${objective}”. The provider is currently unavailable, so this result is a structured placeholder rather than external research or execution. Recommended next step: reconnect a funded model provider, then rerun this task for a substantive result.`;
}

function fallbackReview(agentName: string, objective: string, result: string) {
  return `Companion review: ${agentName} addressed the objective “${objective}”. ${result} I have not taken any external action.`;
}

async function callModel(messages: LlmMessage[], jsonMode = false): Promise<string> {
  const geminiKey = process.env.GEMINI_API_KEY;
  if (geminiKey) {
    const contents = messages
      .filter((m) => m.role !== "system")
      .map((m) => ({
        role: m.role === "assistant" ? "model" : "user",
        parts: [{ text: m.content }],
      }));
    const systemInstruction = messages.find((m) => m.role === "system")?.content;

    const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${geminiKey}`;
    const response = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        contents,
        systemInstruction: systemInstruction
          ? { parts: [{ text: systemInstruction }] }
          : undefined,
        generationConfig: {
          temperature: 0.2,
          maxOutputTokens: 1000,
          responseMimeType: jsonMode ? "application/json" : "text/plain",
        },
      }),
    });

    if (!response.ok) {
      const detail = await response.text();
      throw new Error(`Gemini request failed (${response.status}): ${detail.slice(0, 240)}`);
    }

    const payload = (await response.json()) as {
      candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }>;
    };
    const content = payload.candidates?.[0]?.content?.parts?.[0]?.text?.trim();
    if (!content) throw new Error("Gemini returned an empty response.");
    return content;
  }

  const openAiKey = process.env.OPENAI_API_KEY;
  if (openAiKey) {
    const response = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${openAiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "gpt-4o-mini",
        temperature: 0.2,
        max_tokens: 1000,
        ...(jsonMode ? { response_format: { type: "json_object" } } : {}),
        messages,
      }),
    });

    if (!response.ok) {
      const detail = await response.text();
      throw new Error(`OpenAI request failed (${response.status}): ${detail.slice(0, 240)}`);
    }

    const payload = (await response.json()) as {
      choices?: Array<{ message?: { content?: string | null } }>;
    };
    const content = payload.choices?.[0]?.message?.content?.trim();
    if (!content) throw new Error("OpenAI returned an empty response.");
    return content;
  }

  throw new Error("Neither GEMINI_API_KEY nor OPENAI_API_KEY is configured.");
}

function getJson<T>(content: string): T {
  const fenced = content.match(/```(?:json)?\s*([\s\S]*?)\s*```/i)?.[1] ?? content;
  return JSON.parse(fenced);
}

async function recordActivity(
  type: string,
  summary: string,
  agentId?: number | null,
  taskId?: number | null,
) {
  const [activity] = await db
    .insert(activitiesTable)
    .values({ type, summary, agentId: agentId ?? null, taskId: taskId ?? null })
    .returning();
  return activity;
}

export async function listConversations() {
  return ListConversationsResponse.parse(
    await db.select().from(conversationsTable).orderBy(desc(conversationsTable.updatedAt)),
  );
}

export async function createConversation(body: unknown) {
  const parsed = CreateConversationBody.parse(body);
  const [conversation] = await db.insert(conversationsTable).values(parsed).returning();
  return conversation;
}

export async function getConversation(id: number) {
  const [conversation] = await db
    .select()
    .from(conversationsTable)
    .where(eq(conversationsTable.id, id));
  return conversation;
}

export async function listMessages(conversationId: number) {
  return ListMessagesResponse.parse(
    await db
      .select()
      .from(messagesTable)
      .where(eq(messagesTable.conversationId, conversationId))
      .orderBy(messagesTable.createdAt),
  );
}

export async function listMemories() {
  return ListMemoriesResponse.parse(
    await db.select().from(memoriesTable).orderBy(desc(memoriesTable.updatedAt)),
  );
}

export async function createMemory(body: unknown) {
  const parsed = CreateMemoryBody.parse(body);
  const [memory] = await db.insert(memoriesTable).values(parsed).returning();
  await recordActivity("memory_stored", `Stored memory: ${memory.title}`);
  return memory;
}

export async function updateMemory(id: number, body: unknown) {
  const params = { id };
  UpdateMemoryBody.parse(body);
  const [memory] = await db
    .update(memoriesTable)
    .set(body as Record<string, unknown>)
    .where(eq(memoriesTable.id, params.id))
    .returning();
  return memory;
}

export async function deleteMemory(id: number) {
  await db.delete(memoriesTable).where(eq(memoriesTable.id, id));
}

export async function listAgents() {
  return ListAgentsResponse.parse(await db.select().from(agentsTable).orderBy(agentsTable.id));
}

export async function listTasks() {
  return ListTasksResponse.parse(
    await db.select().from(tasksTable).orderBy(desc(tasksTable.updatedAt)),
  );
}

export async function createTask(body: unknown) {
  const parsed = CreateTaskBody.parse(body);
  const [task] = await db.insert(tasksTable).values(parsed).returning();
  await recordActivity("task_created", `Created task: ${task.title}`, task.agentId, task.id);
  return task;
}

export async function updateTask(id: number, body: unknown) {
  UpdateTaskBody.parse(body);
  const [task] = await db
    .update(tasksTable)
    .set(body as Record<string, unknown>)
    .where(eq(tasksTable.id, id))
    .returning();
  if (task) await recordActivity("task_updated", `Updated task: ${task.title}`, task.agentId, task.id);
  return task;
}

export async function listActivity() {
  return ListActivityResponse.parse(
    await db.select().from(activitiesTable).orderBy(desc(activitiesTable.createdAt)).limit(50),
  );
}

export async function getSummary() {
  const [{ value: conversationCount }] = await db
    .select({ value: sql<number>`count(*)` })
    .from(conversationsTable);
  const [{ value: memoryCount }] = await db
    .select({ value: sql<number>`count(*)` })
    .from(memoriesTable);
  const [{ value: openTaskCount }] = await db
    .select({ value: sql<number>`count(*)` })
    .from(tasksTable)
    .where(ne(tasksTable.status, "completed"));
  const [{ value: activityCount }] = await db
    .select({ value: sql<number>`count(*)` })
    .from(activitiesTable);
  return GetWorkforceSummaryResponse.parse({
    conversationCount: Number(conversationCount),
    memoryCount: Number(memoryCount),
    openTaskCount: Number(openTaskCount),
    activityCount: Number(activityCount),
  });
}

export async function respondWithCompanion(body: unknown) {
  const parsed = RespondWithCompanionBody.parse(body);
  const conversation = await getConversation(parsed.conversationId);
  if (!conversation) throw new Error("Conversation not found.");

  const [memoryRows, agentRows, recentMessages, activeTasks] = await Promise.all([
    db.select().from(memoriesTable).orderBy(desc(memoriesTable.importance)).limit(8),
    db.select().from(agentsTable).where(eq(agentsTable.status, "active")),
    db
      .select()
      .from(messagesTable)
      .where(eq(messagesTable.conversationId, parsed.conversationId))
      .orderBy(desc(messagesTable.createdAt))
      .limit(12),
    db.select().from(tasksTable).where(eq(tasksTable.conversationId, parsed.conversationId)),
  ]);

  const [userMessage] = await db
    .insert(messagesTable)
    .values({
      conversationId: parsed.conversationId,
      role: "user",
      content: parsed.message,
    })
    .returning();
  await recordActivity("request_received", "Jarvis Brain received a new request.");

  // Check model provider availability
  const modelCallerFn = process.env.GEMINI_API_KEY || process.env.OPENAI_API_KEY ? callModel : undefined;

  const rawWorkspaceData = {
    conversationId: parsed.conversationId,
    recentMessages: recentMessages.reverse().map((m: any) => ({ role: m.role, content: m.content })),
    memories: memoryRows.map((m: any) => ({ title: m.title, content: m.content, importance: m.importance })),
    tasks: activeTasks.map((t: any) => ({ id: t.id, title: t.title, status: t.status })),
  };

  // Run Jarvis Brain Orchestration
  const jarvisResult = await processWithJarvisBrain(parsed.message, rawWorkspaceData, modelCallerFn);

  await recordActivity(
    "intent_analyzed",
    `Jarvis intent: domain=${jarvisResult.intent.domain}, complexity=${jarvisResult.intent.complexity}, delegationRequired=${jarvisResult.intent.delegationRequired}`,
  );

  let agentRecord;
  let taskRecord;

  if (jarvisResult.taskGraph && jarvisResult.taskGraph.nodes.length > 0) {
    for (const node of jarvisResult.taskGraph.nodes) {
      const matchedAgent = agentRows.find(
        (a: any) => a.role === node.assignedAgentRole || a.name === node.assignedAgentName,
      ) ?? agentRows[0];

      if (matchedAgent) {
        const dbStatus =
          node.status === "SUCCESS"
            ? "completed"
            : node.status === "RUNNING"
            ? "running"
            : node.status === "BLOCKED"
            ? "needs_approval"
            : node.status === "FAILED" || node.status === "TIMEOUT"
            ? "needs_approval"
            : "queued";

        const [createdTask] = await db
          .insert(tasksTable)
          .values({
            title: `${matchedAgent.name}: ${node.description.slice(0, 50)}`,
            objective: node.description,
            status: dbStatus,
            agentId: matchedAgent.id,
            conversationId: parsed.conversationId,
          })
          .returning();

        if (!agentRecord) agentRecord = matchedAgent;
        if (!taskRecord) taskRecord = createdTask;

        await recordActivity(
          "delegated",
          `DAG Task '${node.taskId}' assigned to ${matchedAgent.name} (Status: ${node.status}).`,
          matchedAgent.id,
          createdTask.id,
        );

        if (node.result) {
          await db
            .insert(messagesTable)
            .values({
              conversationId: parsed.conversationId,
              role: "agent",
              content: node.result,
              agentId: matchedAgent.id,
            })
            .returning();
          await recordActivity(
            "agent_result",
            `${matchedAgent.name} finished DAG step '${node.taskId}'.`,
            matchedAgent.id,
            createdTask.id,
          );
        }
      }
    }
  } else if (jarvisResult.plan.tasks.length > 0) {
    const primaryTask = jarvisResult.plan.tasks[0];
    agentRecord = agentRows.find(
      (a: any) => a.role === primaryTask.assignedAgentRole || a.name === primaryTask.assignedAgentName,
    ) ?? agentRows[0];

    if (agentRecord) {
      [taskRecord] = await db
        .insert(tasksTable)
        .values({
          title: `${agentRecord.name} task`,
          objective: primaryTask.objective,
          status: "running",
          agentId: agentRecord.id,
          conversationId: parsed.conversationId,
        })
        .returning();
      await recordActivity("delegated", `Delegated to ${agentRecord.name} via capability match.`, agentRecord.id, taskRecord.id);

      const agentResponse = jarvisResult.agentResponses[0];
      if (agentResponse) {
        await db
          .insert(messagesTable)
          .values({
            conversationId: parsed.conversationId,
            role: "agent",
            content: agentResponse.result,
            agentId: agentRecord.id,
          })
          .returning();
        await recordActivity("agent_result", `${agentRecord.name} returned a structured response.`, agentRecord.id, taskRecord.id);
      }

      await db
        .update(tasksTable)
        .set({ status: "completed" })
        .where(eq(tasksTable.id, taskRecord.id));
      await recordActivity("reviewed", `Jarvis Brain synthesized ${agentRecord.name}'s result.`, agentRecord.id, taskRecord.id);
    }
  }

  const finalAnswer = jarvisResult.synthesis.finalAnswer;

  const [companionMessage] = await db
    .insert(messagesTable)
    .values({
      conversationId: parsed.conversationId,
      role: "companion",
      content: finalAnswer,
      agentId: agentRecord?.id ?? null,
    })
    .returning();

  await db
    .update(conversationsTable)
    .set({ updatedAt: new Date() })
    .where(eq(conversationsTable.id, parsed.conversationId));

  await recordActivity("response_ready", "Jarvis Brain response ready.");

  return RespondWithCompanionResponse.parse({
    conversationId: parsed.conversationId,
    userMessage,
    companionMessage,
    delegated: Boolean(agentRecord),
    agent: agentRecord ?? undefined,
    task: taskRecord ? { ...taskRecord, status: "completed" } : undefined,
    reviewed: Boolean(agentRecord),
  });
}