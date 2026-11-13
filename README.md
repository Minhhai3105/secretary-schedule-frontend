# Secretary Schedule Frontend

Vue + TypeScript + Bootstrap web client. Install the locked packages with `npm ci`, copy `.env.example` to `.env` and set `VITE_API_BASE_URL` to the backend origin, then run `npm run dev`. Use `npm run build` and `npm test` for verification.

## Schedule assistant chat

This branch requires the backend `/v1/chat/completions` contract introduced in backend PR #7. The chat UI uses the stable application model `secretary-schedule`, one `user` message, `stream: true`, and the fixed `json_schema` response format from `src/contracts/chat-response-format.json`. Authorization uses the logged-in user's access JWT; provider credentials never belong in frontend environment variables.

The service uses the Vercel AI SDK (`ai`, `@ai-sdk/openai-compatible`) for OpenAI-compatible requests, SSE decoding and partial structured output. `Output.object` uses the generated JSON schema, validated at runtime with Zod. Only the partial answer is rendered; a successful stop chunk, `[DONE]` and valid complete content are required before showing proposal actions. Proposal field/value pairs are converted into the existing UI dictionary. History and confirmation/cancellation keep their existing APIs. `generateText` supports the nonstreaming service.

The JSON contract file is a generated snapshot of `COMPLETION_RESPONSE_FORMAT` from backend `app/schemas/chat_completion.py`. Regenerate it from the backend when that contract changes and run both repositories' contract tests. The supported API is specific to schedule assistance and does not provide arbitrary-model proxying.

An interrupted stream retains provisional answer text but no proposal controls. Reload history before sending again because the request may already have been saved. There is no automatic retry after stream failure. Requests abort after 180 seconds and on component unmount; minimizing the panel allows the answer to finish in the background.

The SDK is loaded lazily when sending a message. Its default retries are disabled. A small fetch guard retains the 1 MB stream limit and requires `[DONE]`, because the SDK accepts EOF after a stop chunk without that marker. It does not parse SSE events. See [chat-sdk.md](docs/chat-sdk.md) for the implementation map and checks.
