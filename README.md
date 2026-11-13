# Secretary Schedule Frontend

Vue + TypeScript + Bootstrap web client. Install the locked packages with `npm ci`, copy `.env.example` to `.env` and set `VITE_API_BASE_URL` to the backend origin, then run `npm run dev`. Use `npm run build` and `npm test` for verification.

## Schedule assistant chat

This branch requires the backend `/v1/chat/completions` contract introduced in backend PR #7. Sending a message uses the stable application model `secretary-schedule`, one `user` message, `stream: false`, and the fixed `json_schema` response format from `src/contracts/chat-response-format.json`. Authorization uses the logged-in user's access JWT; provider credentials never belong in frontend environment variables.

The service parses JSON from `choices[0].message.content`, then converts proposal field/value pairs into the existing UI dictionary. History remains account-scoped and paginated through `/api/chat/messages`; proposal confirmation/cancellation keeps its existing APIs. Unsupported requests and malformed completions produce controlled chat errors.

The JSON contract file is a generated snapshot of `COMPLETION_RESPONSE_FORMAT` from backend `app/schemas/chat_completion.py`. Regenerate it from the backend when that contract changes and run both repositories' contract tests. The supported API is specific to schedule assistance and does not provide arbitrary-model proxying or streaming.
