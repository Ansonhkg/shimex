# Multi-Account ChatGPT / Codex Workflow

Trigger: `shimex codex-auth …` or the **Sign in with OpenAI Codex** button in
the admin UI, or any HTTP call to the `/api/codex-auths/*` endpoints.

This workflow governs how Shimex stores and runs more than one ChatGPT / Codex
OAuth session side-by-side and routes requests to the right one.

1. The Shimex backend reads `~/.shimex/codex-auths.json` from `$runtime.home`.
   The file shape (manageable by hand; supported by the CLI/HTTP layer):

   ```json
   {
     "version": 1,
     "default_profile": "personal",
     "profiles": {
       "personal": {
         "label": "personal",
         "account_id": "acc_personal_…",
         "access_token": "…",
         "available": true,
         "created_at": "…",
         "updated_at": "…",
         "note": ""
       }
     }
   }
   ```

   The file is gitignored because `~/.shimex/` is in `.gitignore`. The
   backend writes it 0600.

2. Profile names match `[a-zA-Z0-9][a-zA-Z0-9._-]{0,63}`. Pick names that
   describe the subscription owner (e.g. `personal`, `work`, `team-eu`).

3. Adding a profile has three entry points; all write the same on-disk shape:

   - **Sign in with OpenAI Codex** button in `GET /admin` →
     `POST /api/codex-auths/start-device { profile }` →
     `GET /admin/codex-auth/device?id=…` server-rendered page →
     background poll of `https://auth.openai.com/api/accounts/deviceauth/{usercode,token}`
     until the device login succeeds →
     `POST /api/codex-auths/device/{id}/complete` commits the credentials.
   - **Paste OAuth JSON** form (admin UI or `codex-auth add`) accepts the
     `{ tokens: { access_token, refresh_token, expires, account_id } }`
     shape or the flat `{ access_token, account_id }` shape.
   - **Import `~/.codex/auth.json`** — `codex-auth add personal ~/.codex/auth.json`
     copies the existing ChatGPT / Codex login.

4. Each profile produces `n_models` rows in the Codex picker, one per
   upstream Codex model. Slugs are `<profile>-<model>` (e.g.
   `personal-gpt-5-5`). Display names read `${profileName} · ${modelDisplayName}`.

5. At request time, the chatgpt-codex adapter looks up the profile by
   `route.model.profile` (preferred) or by the slug's profile prefix, then
   forwards `Authorization: Bearer <accessToken>` and the matched
   `chatgpt-account-id` to `chatgpt.com/backend-api/codex/responses`. If the
   profile token is missing, returns `shimex_auth_unavailable` 401.

6. Releasing a profile (`DELETE /api/codex-auths/{name}`) rewrites the file
   with the remaining profiles. If the deleted profile was the default, the
   next profile in`Object.keys` order becomes the new default. Legacy
   `~/.codex/auth.json` users are unaffected — Shimex reads that file when
   no multi-profile file is present and `legacy_single_account` is not set
   to `false`.

7. Until refresh-on-demand is wired (TBD): when a profile's access token
   expires (its `tokens.expires` is in the past), Shimex does NOT
   automatically refresh — it surfaces `shimex_auth_unavailable` 401 with
   a hint to re-add the profile. Re-run the device flow or paste a fresh
   OAuth JSON.

Scope: this workflow applies only to the `chatgpt-codex` provider. Other
providers follow their own authentication rules. Secrets never leave the
gitignored runtime directory.
