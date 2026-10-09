<!-- LOVABLE:BEGIN -->
> [!IMPORTANT]
> This project is connected to [Lovable](https://lovable.dev). Avoid rewriting
> published git history — force pushing, or rebasing/amending/squashing commits
> that are already pushed — as it rewrites history on Lovable's side and the
> user will likely lose their project history.
>
> Commits you push to the connected branch sync back to Lovable and show up in
> the editor, so keep the branch in a working state.
<!-- LOVABLE:END -->

## Apex architecture
- Use a public Query-backed homepage with inline private editing; database RLS enforces every mutation independently of UI visibility.
- Store editor access in a separate email-based role table; authenticated verified emails match explicit owner/editor grants, never first-signup ownership.
- Store logos in a private bucket with authorized uploads and public read-only signed delivery, because public buckets are blocked by workspace policy.
- Keep public initial reads in a publishable-client server function; browser mutations use the generated session client and RLS.
- Store reviewer notes separately behind editor-only RLS so applicant data never includes private review context.
- Verify signed Discord sessions against explicit supervision membership before privileged report access; editor management uses authenticated RLS.
- Store report evidence privately and issue short-lived signed URLs only after reviewer authorization.
- Route bot calls through the linked Discord connector and retain notification failures on reports so submission success does not conceal alert failures.
