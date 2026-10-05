# Error List

Every error code MidNight can emit, what it actually means, and what to check when
it shows up. Codes come from two places: MidNight's own registry
(`src/utils/errorRegistry.js`) and raw codes surfaced by Discord or PostgreSQL
(`src/utils/errorHandler.js`).

Registry metadata lives in `ErrorCodeRegistry`; this document mirrors it and adds
the plain-language diagnosis. Keep the two in sync when adding a code.

## How a code is chosen

`resolveErrorCode()` picks the first code it finds, in this order:

1. `context.errorCode` — set explicitly by the throwing code.
2. `error.context.errorCode` — same, from a wrapped error.
3. `error.code` — whatever the underlying library set.
4. A default derived from the error *type* (see the type map below).

So a raw `ECONNREFUSED` from Postgres becomes `DATABASE_ERROR`, and an explicit
`context.errorCode` always wins.

---

## MidNight error codes

| Code | Severity | Retryable | What it means | What to check |
| --- | --- | --- | --- | --- |
| `VALIDATION_FAILED` | low | no | Input failed a check before any work started. A bad crime type, a negative amount, a missing option. | Validate command inputs before processing; return field-specific guidance. Usually a user error, not a bug. |
| `PERMISSION_DENIED` | low | no | The bot or the user lacks a required Discord permission, or the target is a bot/DM-restricted. | Role permissions, and required Discord permissions for the command. Also raised for `50001`, `50013`, `50007`, `160002`. |
| `CONFIGURATION_ERROR` | medium | no | Required configuration is missing or invalid — unset env var, absent guild feature flag, deleted role. | Environment variables and per-guild feature configuration. |
| `DATABASE_ERROR` | high | **yes** | Postgres or the connection pool failed: timeout, saturation, deadlock, or the server refused the connection. | Postgres connectivity, pool saturation, statement timeouts, recent migrations. See the Postgres codes below. |
| `NETWORK_ERROR` | medium | **yes** | The request never completed — DNS, TCP, TLS, or a dropped socket. | Network reachability, upstream service status, retry/backoff behaviour. |
| `DISCORD_API_ERROR` | high | **yes** | Discord rejected a request for a reason that is not a permission problem. | Discord API status, rate-limit response patterns, bot token validity. |
| `USER_INPUT_ERROR` | low | no | A user-supplied ID, mention, or similar value could not be resolved to a real user. | Validate user-provided IDs/mentions and return clearer input examples. |
| `RATE_LIMITED` | low | **yes** | Either a Discord HTTP 429, or a command's own cooldown is still running. | Cooldown-aware retries; reduce bursty command execution. |
| `INTERACTION_INVALID` | medium | no | The interaction object was missing or already consumed when the handler tried to use it. | Ensure the interaction is available and valid before replying. |
| `INTERACTION_EXPIRED` | medium | no | The 15-minute interaction token expired before the command replied. | Defer or reply earlier. Long-running work must defer first. |
| `INTERACTION_RESPONSE_FAILED` | medium | no | Replying or editing failed because the interaction was already acknowledged, or the reply window closed. | Interaction acknowledgement state and Discord response error codes. |
| `INTERACTION_UNHANDLED` | high | no | An interaction arrived with no matching handler — usually an unregistered button, modal, or select. | Add a handler for that interaction type, or register the missing component handler. |
| `TASK_ERROR` | high | **yes** | A named background task threw. | Inspect that task for thrown errors or unawaited promises. |
| `UNHANDLED_REJECTION` | high | no | A promise rejected with no `catch`. | Find the unawaited promise and route it through `runSafeTask` or an explicit catch. |
| `LAVALINK_ERROR` | medium | **yes** | A Lavalink music node failed: unreachable, refused, or dropped mid-session. Nodes flap and reconnect on their own. | Check the node host/port/password, firewall rules, and Lavalink server status. See the Lavalink section below. |
| `UNKNOWN_ERROR` | high | no | Nothing matched, so the failure is unclassified. | Capture trace context and stack, then classify it under a specific code. |

### Type → default code

`ErrorTypes` values are lowercase and map to the codes above via
`TypeToErrorCode`:

| Type | Default code |
| --- | --- |
| `validation` | `VALIDATION_FAILED` |
| `permission` | `PERMISSION_DENIED` |
| `configuration` | `CONFIGURATION_ERROR` |
| `database` | `DATABASE_ERROR` |
| `network` | `NETWORK_ERROR` |
| `discord_api` | `DISCORD_API_ERROR` |
| `user_input` | `USER_INPUT_ERROR` |
| `rate_limit` | `RATE_LIMITED` |
| `lavalink` | `LAVALINK_ERROR` |
| `unknown` | `UNKNOWN_ERROR` |

The interaction codes (`INTERACTION_*`, `TASK_ERROR`, `UNHANDLED_REJECTION`) have
no entry in `ErrorTypes`; they are set directly through `context.errorCode`.

---

## Discord API codes

Recognised individually in `categorizeError()`:

| Code | Meaning | Classified as |
| --- | --- | --- |
| `50001` | Missing Access — the bot cannot see the target | `PERMISSION_DENIED` |
| `50013` | Missing Permissions — the bot lacks the required permission | `PERMISSION_DENIED` |
| `50007` | Cannot send messages to this user (DMs closed) | `PERMISSION_DENIED` |
| `160002` | Cannot reply without permission to read message history | `PERMISSION_DENIED` |
| `429` | Rate limited by Discord | `RATE_LIMITED` |
| `10000`+ (other) | Unknown entity, request-level failure, etc. | `DISCORD_API_ERROR` |

`403` (forbidden) and `404` (unknown interaction or channel) fall into the
`DISCORD_API_ERROR` bucket via the numeric range check. A `404` on an interaction
usually means the token expired or the message was deleted.

---

## PostgreSQL and network codes

Matched against `DATABASE_ERROR_CODES` in `errorHandler.js`:

| Code | Meaning |
| --- | --- |
| `ECONNREFUSED` | The server actively refused the connection |
| `ECONNRESET` | The connection was dropped mid-use |
| `ETIMEDOUT` | The connection attempt timed out |
| `57014` | `query_canceled` — usually a statement timeout fired |
| `53300` | `too_many_connections` — the pool/server limit is saturated |
| `08006` | Connection failure |
| `08001` | Client unable to establish a connection |
| `08003` | Connection does not exist |
| `40001` | Serialization failure — retry the transaction |
| `40P01` | Deadlock detected — retry the transaction |

`AbortError`, or any message containing `network`, `fetch failed`, or `enotconn`,
is classified as `NETWORK_ERROR` rather than a database fault.

`40001` and `40P01` are marked retryable: they are transient contention, not
configuration problems, so a retry with backoff is the correct response.

---

## Lavalink (music) errors

Node connectivity events never throw into commands — they are emitted on the
Riffy client and logged in `playerHandler.js`, throttled to one line per node
every 5 minutes. The handler tags them with `errorCode: LAVALINK_ERROR`, so
this is the code to look up when one appears.

| Log line | Meaning |
| --- | --- |
| `Lavalink node "X" error: AggregateError` | **The node is unreachable.** Every connection attempt failed (refused, timed out, DNS). `AggregateError` with no message is undici reporting that all attempts failed, not a bug in the bot. Check the node host/port, the Lavalink password, firewall rules, and whether the Lavalink server is running. |
| `Lavalink node "X" disconnected.` | The websocket dropped. During flapping this alternates with `connected` / error lines and the node usually recovers alone. Persistent flapping means the node itself is unstable. |
| `Riffy not initialized; music player handlers not attached.` | Startup ordering problem: `setupPlayerHandler` ran before `riffySetup`. Music commands will fail until the bot restarts cleanly. |
| `No Lavalink nodes configured. …` | Fatal at startup. Add `lavalink/nodes.json`, set `LAVALINK_NODES`, or set `LAVALINK_HOST`. This one is a `CONFIGURATION_ERROR`, not a node fault. |

Classification note: `categorizeError()` matches `lavalink` **before** the
Postgres bucket on purpose. A node's `ECONNREFUSED` sub-errors would otherwise
be misclassified as `DATABASE_ERROR` — a dead music node is not a database
fault. `errorCode: 'LAVALINK_ERROR'` set explicitly (as `playerHandler.js`
does) also resolves directly, regardless of message text.

---

## Notes

- Severity drives log filtering: `high` is worth paging on, `low` is noise.
- `retryable` says whether repeating the operation could succeed. It does **not**
  mean the bot retries automatically — there is no automatic retry loop.
- A command can override any of this by passing `errorCode` in the error context,
  which is why `resolveErrorCode()` checks context first.