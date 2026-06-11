# authFlow Validation Checklist

## Contract Alignment (JSON vs Runtime)

- [ ] Screen IDs match handler outputs:
  - `WELCOME`
  - `SIGN_UP`
  - `SIGN_IN`
  - `FORGOT_PASSWORD`
  - `SUCCESS`
- [ ] `routing_model` matches `handleAuthFlow` transition behavior (including retry loops).
- [ ] Input payload keys match handler expectations:
  - `pin_code`
  - `confirm_pin_code`
  - `email`
- [ ] Error payload key consistency: `error_msg`.
- [ ] Success payload key consistency: `message`.

## Gate A: Build

- [x] `pnpm build` passes.

## Gate B: Endpoint Smoke

- [x] Route reachability checked (`GET /meta_endpoint` is active).
- [x] `POST /api/seller/authFlow/send` validation path verified (`400` on missing seller body).
- [x] `POST /api/seller/authFlow/meta_endpoint` error path verified for malformed payload.
- [ ] Supporting reset endpoints respond as expected:
  - `/api/seller/authFlow/forgot_code`
  - `/api/seller/authFlow/reset_code`

## Gate C: Manual Flow Run

- [ ] WELCOME -> SIGN_IN path validated.
- [ ] WELCOME -> SIGN_UP path validated.
- [ ] SIGN_IN invalid PIN shows error.
- [ ] SIGN_IN valid PIN reaches SUCCESS and triggers menu send side-effect.
- [ ] FORGOT_PASSWORD invalid email shows error.
- [ ] FORGOT_PASSWORD valid email reaches SUCCESS.

## Final Verdict

- [ ] PASS
