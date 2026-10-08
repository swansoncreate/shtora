# Shtora — World Engine Test Plan

## 1. Intent tests

### Deterministic

Input → expected:

- "скинь селфи" → continue/new initial selfie
- "теперь боком" → continue / side
- "со спины" → continue / back
- "во весь рост" → continue / full
- "в зеркало" → mirror
- "от первого лица" → POV

### Ordinary chat

- "как дела?" → no image job
- "что делаешь?" → no image job
- "ты где?" → no image job

## 2. Continuity tests

Sequence:

~~~text
selfie
→ side
→ back
→ full
~~~

Assert:

- same character identity;
- same sceneId;
- parent chain is valid;
- camera mode changes as requested.

## 3. New scene tests

Input:

~~~text
current scene: bathroom / black shirt
user: "теперь в кафе и в зелёном платье"
~~~

Assert:

- new sceneId;
- new world values;
- previous scene remains intact.

## 4. POV tests

Current world:

~~~text
place=bathroom
activity=lying down
~~~

"Скинь от первого лица" must produce POV intent with world reference.

## 5. Memory tests

After generating A, B, C:

- query "вторая фотка" resolves to the right memory;
- "как на B" selects B as reference;
- gallery does not generate a new image.

## 6. Dropbox anti-repeat

Given sources A, B, C:

- generate from A;
- next generation must not immediately select A;
- after history window expires A becomes eligible.

## 7. Failure tests

Provider returns error.

Assert:

- generation job = failed;
- no successful VisualMemory;
- no world mutation;
- no relationship mutation;
- chat remains usable;
- retry uses same jobId where appropriate.

## 8. Provider tests

Mock ImageGenerationGateway.

Run product tests without xAI/Grok network calls.

Test:

- successful generate;
- successful edit;
- timeout;
- retryable error;
- permanent error;
- malformed provider response.

## 9. Scene Planner tests

Planner output must be validated.

Reject:

- malformed schema;
- empty required values when a mode requires them;
- impossible camera/reference combinations.

Planner should avoid recent outfit/place repetition when alternatives exist.

## 10. Regression tests

Existing behavior must remain working:

- Instagram feed;
- profile;
- posts;
- stories;
- highlights;
- comments;
- chat;
- Dropbox;
- Imagine;
- settings;
- unread/read;
- delayed replies;
- media persistence.

## 11. Acceptance scenario

Full scenario:

~~~text
1. Open character chat.
2. Ask for selfie.
3. Ask "теперь боком".
4. Ask "а теперь со спины".
5. Change location and clothes.
6. Ask for another photo.
7. Verify new scene.
8. Open Instagram.
9. Verify generated media can be used as post/story.
10. Return to chat.
11. Verify world/visual context remains consistent.
~~~

This scenario is the minimum end-to-end regression for the World Engine milestone.
