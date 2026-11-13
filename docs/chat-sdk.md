# Backend chat through the AI SDK

## Request flow

`ChatView.vue` -> `services/chat.ts` -> lazy `services/backend-chat.ts` -> FastAPI `/v1/chat/completions` -> CLIProxyAPI -> model.

This uses the OpenAI-compatible provider without a new server or a general-purpose proxy. The existing Vue UI keeps its refs, paginated history, refresh handling and proposal confirmation actions. No Next.js environment variables, React hooks, localStorage access tokens or frontend provider keys are introduced.

`services/chat-sdk-loader.ts` owns one lazy loader shared by both send paths. It caches the in-flight and resolved import Promise, so concurrent calls share the same load. A rejected load is cleared for a later user-initiated attempt; it does not automatically retry a message or cache a JWT. The provider still attaches the access token passed to each request. The SDK chunk is not loaded just by opening the login page.

## Library responsibilities

- `createOpenAICompatible`: targets `${VITE_API_BASE_URL}/v1`; the provider appends `/chat/completions`. The public model alias is `secretary-schedule`.
- A custom fetch attaches the access JWT supplied for the current call. A call after refresh receives the new JWT; it does not reuse an authorization header captured when the application first loaded.
- `generateText`: calls the existing nonstreaming endpoint contract. Omitting `stream` uses the backend's `false` default.
- `streamText`: decodes the OpenAI SSE stream. `partialOutputStream` supplies repaired partial JSON objects; only their `answer` is displayed.
- `Output.object` and `jsonSchema`: request the exact backend-generated structured output schema. Zod's `fromJSONSchema` validates the complete result against that same snapshot. No separately maintained response schema is needed.
- `abortSignal`, a 180-second SDK timeout, `maxRetries: 0` and `streamRetries: 0` preserve the current cancellation and no-automatic-retry behavior.

The current Vue component does not use the SDK's Chat UI state. Therefore a `ChatTransport` class and `toUIMessageStream` conversion are unnecessary here. They would adapt a model stream to SDK-managed UI messages if the UI adopted that API later.

## Application responsibilities

- Keep the backend's one-current-user-message contract; the server loads account history.
- Wait for a successful finish and the complete validated object before returning proposal data to the UI.
- Reject duplicate proposal fields and preserve the difference between absent fields and explicit null values when converting field/value pairs into the existing dictionary.
- Translate SDK failures into the existing `ChatError` codes. HTTP 401 permits the existing refresh flow before a new authorized request; in-stream failures never automatically resend a message.
- Map HTTP 503 and the safe in-stream `ai_unavailable` code to a localized AI-service-unavailable message. Preserve the first stream error so subsequent EOF/terminal-marker failures do not hide the provider failure.
- Keep the small transport guard for the 1 MB limit and mandatory `[DONE]`. The SDK itself ignores that marker and accepts EOF after a stop chunk. The guard checks the stream tail, not individual SSE events.
- Resolve the size-limit and missing-completion-marker messages through the current `i18n.global` locale when throwing, rather than caching translated strings at SDK initialization. Both `vi.json` and `en.json` contain the messages; technical error codes and protocol markers are not translated.
- Hide a temporary trailing UTF-16 high surrogate while partial JSON is repaired, so a split emoji is not rendered as a broken character.

After an interruption, reload history before manually sending again: the backend may have saved the exchange before the connection failed. Schedule changes still require the existing explicit confirmation API.

## Validation

Run `npm ci`, `npm test` and `npm run build`. Contract tests execute the real installed SDK against mocked HTTP responses, including split UTF-8, CRLF, malformed output, missing `[DONE]`, invalid proposal metadata, changing JWTs, HTTP errors and cancellation. A gated stream test holds the response open until a provisional answer reaches the callback.

For an actual local integration, run the backend branch from PR #7 and an authenticated CLIProxyAPI instance with a reachable model. Log in, send a complete future schedule request and inspect `/v1/chat/completions` in browser Network tools: expect `stream: true`, `response_format.type: json_schema` and incremental SSE data. Confirm the proposal, then list schedules to verify the saved item. Never copy access JWTs or provider keys into review evidence.

The SDK adds a separate lazy JavaScript chunk of approximately 133 KB gzip in the current production build. Vite reports a chunk-size warning near 500 KB before gzip. Login does not load that chunk; first chat use does. Browser and deployment acceptance are separate from service integration tests.

For end-to-end HTTP timing and causal streaming checks, the backend's `scripts/verify_sse.py` invokes this repository's `scripts/verify-sse.mjs`. The controlled upstream withholds B until the real SDK callback receives A. This verifies service delivery before completion; it is not a browser paint measurement. Run from the backend as documented in its `docs/sse-verification.md`, pointing `--frontend` at this checkout. A separate opt-in negative control verifies that the test fails when upstream is intentionally buffered. Live model failures remain recorded as failures.
