---
name: Explicit provider degradation
description: How the personal workforce should behave when its model provider cannot answer
---

The Companion should fail explicitly at the model boundary but keep the core workflow usable: inspect context, choose a registered agent, create a task, record activity, and review a clearly labeled local placeholder. Never imply that external research or execution happened.

**Why:** The first configured provider key had no remaining credits. A hard failure made the otherwise usable workspace appear broken, while an unlabeled fake answer would violate trust.

**How to apply:** Keep fallback behavior inside the Companion service, record provider-unavailable activity, and make the returned content say that it is a local fallback until a funded provider is available.