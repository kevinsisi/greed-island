# Project Rules

This repository is a GitHub template. When a new project is generated from it, these rules activate immediately so any AI coding assistant follows the same workflow conventions from the first commit.

Edit this file freely to add stack-, domain-, or team-specific rules for your project. Keep the Skill Activation section so the bundled `skills/` and `.github/skills/` stay wired in.

## Local Dev / Docker — Read Before Restarting The Stack

This workstation needs a few non-obvious flags when rebuilding the local
docker stack. **Read [`deploy/README.md` → "Local Dev Workflow"](./deploy/README.md#local-dev-workflow-this-workstation)
before invoking `docker compose`.** TL;DR:

- Always prefix compose commands with `DOCKER_BUILDKIT=0` on this machine.
- `deploy/.env` must keep `JWT_SECRET=local-development-secret-0-15-24`
  (matches the existing container's env, so browser JWT cookies survive
  a rebuild).
- `docker compose down` keeps `deploy/data/` (the SQLite EventLog).
  `down -v` destroys it — use only when you actually want a fresh world.

Standard rebuild flow:

```bash
DOCKER_BUILDKIT=0 docker compose -f deploy/docker-compose.yml down
DOCKER_BUILDKIT=0 docker compose -f deploy/docker-compose.yml up -d --build
curl -s http://127.0.0.1:8100/healthz   # confirm new version is up
```

## Greed Island — Project Architecture Source of Truth

This codebase is **Greed Island**, an AI-driven living-world game. The following documents are mandatory reading before non-trivial changes, in this order:

- [`DEVELOPMENT_CONSTITUTION.md`](./DEVELOPMENT_CONSTITUTION.md) — first handoff document for every AI/human developer. Defines the project prime directive, required reading order, civilization evolution constitution, NPC humanity rule, and handoff requirements.
- [`ARCHITECTURE.md`](./ARCHITECTURE.md) — kernel-level Command/Event/Rule Engine separation, deterministic replay, AI-as-renderer principle. Every state-changing PR must conform.
- [`COMBAT_ARCHITECTURE.md`](./COMBAT_ARCHITECTURE.md) — real-time combat sub-runtime準則。**Phase B (v0.15.0) 已 ship**（單擊判決 + Command/Event 管線）；Phase C/D 仍未實作。所有戰鬥相關 PR (commands / events / 紋卡優先級) 必須遵守此文。
- [`ROADMAP.md`](./ROADMAP.md) — release-by-release 工作項追蹤。OpenSpec change ids 都對得上 `openspec/changes/<id>/`。
- [`PROGRESS.md`](./PROGRESS.md) — latest handoff status, local verification, CI/CD state, and active blockers. Update this before ending a coding session.
- [`docs/WORLD_CAPABILITIES.md`](./docs/WORLD_CAPABILITIES.md) — single source of truth for the world program: Part I runtime constitution + civilization vision (user-authored, non-negotiable), Part II current verified baseline (v0.15.47), Part III principles→capabilities crosswalk, Part IV six-phase plan (≈16–25 releases, 6–12 months), Part V success criteria. Every new OpenSpec change must reference which Part I principle it serves and which Part IV phase it ships in.

**所有狀態改變必須走 Command → Rule Engine → Event → 投影**。違反這條的 PR（不論是世界模擬、戰鬥、玩家動作）必須被拒絕，並在 PR 描述中註明違反 ARCHITECTURE.md 的哪一條。AI 在系統裡只能做 read-only 旁白與意圖分類；AI 不可下 Command、不可改 hp、不可影響 priority / damage 計算。

## AI Narration 反幻覺鐵則（v0.15.3+）

AI 旁白（ambient + worldEvent + dialog）只能引用 user prompt 中明確列出的名字 — 不可以虛構任何具名 NPC、建築、結構名。Prompt 必須帶：(a) 此區可命名的 NPC 清單（缺值時明示「無 NPC 在場 → 不可提及任何具名人物」）、(b) 此區可命名建築清單（缺值時明示「不要使用任何具體建築名」）。設計新 AI prompt 時 **必須** 加這個約束區塊；違反者 review 時擋下。

## NPC 跨區與人性規則（v0.15.11+）

NPC 是人，不是固定地圖裝飾。商人、工匠、守衛、祭司、公務 NPC 都可以跨區；職責只能是 movement policy 的強權重，不能是永久 hard lock，除非未來有明確 story immobility rule。NPC 同一時間只能有一個權威 presence tuple：`tileId`、`buildingId | null`、`subCol/subRow/subZ`、`activity`、`travelRoute | null`、未來 `intent`。Area / Building / Hub 必須從同一份 server-authoritative presence 派生，禁止用不同 projection 讓同一 NPC 在室內與室外分身。`activity = move` 的 NPC 只能由 Hub 依 `travelRoute` 表示在路上，不可同時被 Area 當成本地戶外 NPC 渲染。

## NPC 死亡狀態必須全鏈路傳遞（v0.87.3+）

死亡是一等狀態變更，不是顯示層 flag。任何新的 NPC consumer 必須**顯式選擇**呼叫 `runtime.getNpcs()`（活著的世界）或 `runtime.getNpcsIncludingDeceased()`（含死人，僅 admin / lineage / chronicle / 歷史敘事用）。不可以假設「getNpcs 預設含全部」— 預設就是只回傳活著的。

死亡狀態必須在以下四個 surface 全部同步生效：

1. **Sim tick gate**：`NpcEngine.tick()` 透過 `NpcTickContext.deceasedNpcIds` 跳過死亡 NPC 的所有決策 phase；死人 state 凍結在死亡前最後快照。
2. **API 預設**：公開 `/api/npcs` 必過濾死人；admin 端 API 顯式用 `getNpcsIncludingDeceased`。
3. **互動 endpoint**：`/api/npc/:id/{interact,dialog-hold,greet}` + `/api/npc/intervene`（雙方檢查）對死人一律 `HTTP 410 Gone { error: 'NPC_DECEASED' }`。`/history` 唯讀路徑為**例外**，保留可查死人歷史對話以兌現 §43.1「後代會記得他」。
4. **前端**：`ServerNpc.deceased` / `NpcSummary.deceased` 必帶；`AreaScene` / `AreaPage` / `NpcDialog` 對 `deceased === true` 不開 dialog 並顯示「這位 NPC 已經不在了。」。

新增 projection 時，務必同時把 `rebuildFromEvents` 加進 `runtime.ts` 的**小 log 與大 log 兩條 boot 分支**（v0.25.3 ecosystem-boot-bug 與 v0.87.3 mortality-boot-bug 都是「只接上其中一條」造成的）。

## Global Working Rules

- Read the current code, files, and runtime context before deciding on a change.
- Prefer the smallest correct fix over broad refactors.
- Fix root causes, not only visible symptoms or display-layer effects.
- When the best next step is already clear, execute it instead of asking redundant confirmation.
- Do not send the user through intermediate debugging steps you can perform directly.
- Do not use regex to parse structured formats when explicit parsing or a proper parser is more reliable.
- For new projects, major features, rewrites, or redesigns with unresolved decisions, present a reviewable plan before writing product code.
- Parallelize independent work when it meaningfully reduces turnaround; keep the main thread focused on coordination and synthesis.
- Frame each task clearly with the actual problem, constraints, and expected end state.
- Do not replace user intent with hardcoded fallback values after a failure.
- Retry transient external or AI failures with backoff; when retries are exhausted, surface the real failure.
- Add per-item timeouts to batched external calls so one slow request does not block the whole batch.
- Keep user keywords and search intent unchanged unless the user explicitly asked for transformation.
- Verify behavior in a real runnable environment whenever feasible.
- Do not claim CI, CD, deployment, or runtime success from guesswork; use trustworthy evidence.
- When a code change is complete, treat follow-through as part of the work, not an optional extra.
- Every code change must update memory, update spec, commit, and push unless the user explicitly says not to.
- Prefer commit-first, push-later batching for larger work groups when repeated pushes would only retrigger CI/CD without adding review value.
- If a requirement should govern future implementation, write it into the formal rule sources instead of leaving it only in chat context.
- Avoid magic numbers in implementation; prefer existing enums, or introduce named constants when no enum exists.
- Before commit, confirm AI-generated methods, classes, and files are actually used; remove unused junk instead of committing it.
- Build checks before commit must use the repo's concrete command(s), not vague "validation" language.
- For any non-trivial feature request or requirement, first confirm requirements with the user and define OpenSpec before implementation.
- For major changes, use a brainstorming step before proposal or implementation.

## Skill Activation Rules

Treat the following skill files as active workflow rules for this workspace, even if the host AI environment does not expose them through a built-in skill registry. Apply them automatically by task type:

- Treat `skills/execution-style/SKILL.md` as the default execution behavior for normal implementation work
- Treat `skills/plan-before-build/SKILL.md` as mandatory for new projects, major features, and large redesigns before implementation begins
- Treat `skills/project-stack-standard/SKILL.md` as mandatory when choosing or reviewing app/service stack, backend setup, database choice, or monorepo structure
- Treat `skills/root-cause-debugging/SKILL.md` as mandatory for bug investigation and regressions
- Treat `skills/integration-robustness/SKILL.md` as mandatory for retry, timeout, and partial-failure handling in AI calls, external APIs, and batched integrations
- Treat `skills/ai-provider-routing/SKILL.md` as mandatory when choosing or reviewing which AI provider/model a request routes to (OpenCode vs Gemini, multi-endpoint settings UI, image-generation routing)
- Treat `skills/verification-and-evidence/SKILL.md` as mandatory when reporting runtime, CI, CD, or deployment status
- Treat `skills/agent-design/SKILL.md` as mandatory for multi-agent or tool-enabled agent architecture work
- Treat `skills/completion-checklist/SKILL.md` as mandatory for any code change before reporting completion
- Treat `skills/deployment/SKILL.md` as mandatory for deployment, Docker, reverse-proxy, CI/CD, and release work
- Treat `skills/frontend-design/SKILL.md` as mandatory for frontend creation or redesign work
- Treat `skills/key-pool-standard/SKILL.md` as mandatory for any AI key-pool, quota, or multi-key retry implementation
- Treat `skills/skill-creator/SKILL.md` as the active workflow when creating, improving, or evaluating a skill
- Treat `.github/skills/openspec-explore/SKILL.md` as the active workflow when the user wants exploration without implementation
- Treat `.github/skills/openspec-propose/SKILL.md` as the active workflow when creating a new OpenSpec change
- Treat `.github/skills/openspec-apply-change/SKILL.md` as the active workflow when implementing an OpenSpec change
- Treat `.github/skills/openspec-archive-change/SKILL.md` as the active workflow when archiving a completed OpenSpec change

Mirror locations (`.claude/skills/`, `.gemini/skills/`, `.opencode/skills/`, `.github/skills/`) hold the same OpenSpec workflow skills so Claude Code, Gemini CLI, opencode, and GitHub Copilot all see them. The canonical source for general workflow skills lives in `skills/`.

## Persistent Standards

- Every code change must update memory (if applicable), update OpenSpec (if applicable), commit, and push; larger work batches may commit in checkpoints and push once the batch is ready. Rule home: `skills/completion-checklist/SKILL.md`.
- Complex tasks must carry workflow checkpoints in the task list, and major task boundaries must trigger a fresh rule check. Rule home: `skills/execution-style/SKILL.md` and `skills/completion-checklist/SKILL.md`.
- Any requirement that should govern future implementation must be written into the formal rule sources (this file or a skill), not left only in chat context. Rule home: `skills/execution-style/SKILL.md`.
- Any non-trivial feature request should first go through an exploration/confirmation step and be captured in OpenSpec before implementation.
- Every AI handoff must update `PROGRESS.md` with current version, completed work, verification evidence, remaining blockers, and CI/CD/deploy state.

## When To Remove Or Replace Skills

- Remove `skills/frontend-design/` if the project has no frontend.
- Remove `skills/key-pool-standard/` if the project does not use AI API keys.
- Remove `skills/agent-design/` if the project is not building AI agents.
- Keep `skills/execution-style/`, `skills/completion-checklist/`, `skills/plan-before-build/`, `skills/root-cause-debugging/`, `skills/verification-and-evidence/`, `skills/integration-robustness/`, and `skills/ai-provider-routing/` for any project.
- If you delete a skill, also delete its line in the Skill Activation Rules above.
