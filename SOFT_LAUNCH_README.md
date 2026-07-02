# Soft-launch replacement package

## What was fixed
- user session auth moved to server-side session cookies
- protected routes no longer trust user_id from the browser
- wide-open CORS removed
- secure session cookie settings added
- logout now clears backend session too
- withdrawal method PINs are now hashed before storage
- public Terms, Privacy, and Contact pages added
- production helper files added: Procfile, wsgi.py, requirements.txt, .env.example, .gitignore

## What you must set before launch
1. Copy `.env.example` to `.env`.
2. Fill in real values for SECRET_KEY, admin username/password, Paystack keys, support email, and BASE_PUBLIC_URL.
3. Use a fresh production database. Do not reuse your development database export.
4. Start with `gunicorn wsgi:app` in production.

## Important
This package intentionally does not include your old `.env`, your local databases, or your virtual environment.
