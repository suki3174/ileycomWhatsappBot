# authFlow Metadata

This file stores project-side metadata that cannot exist in Meta Flow JSON.

## Source of Truth

- Handler: `src/handlers/seller/auth_flowHandler.ts`
- Meta route: `src/app/api/seller/authFlow/meta_endpoint/route.ts`
- Send route: `src/app/api/seller/authFlow/send/route.ts`

## Notes

- Based on latest auth flow JSON provided by team plus runtime transitions currently implemented in `auth_flowHandler.ts`.
- Runtime includes retry/self loops for `SIGN_IN`, `SIGN_UP`, and `FORGOT_PASSWORD` on validation errors.
