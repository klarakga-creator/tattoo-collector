# Tattoo Collector

A personal web app for keeping track of my tattoos, the ones I'm planning, and inspiration for each body part. It works on iPhone and Mac and stays in sync between them.

- **Body**: an anatomical figure with front, back, left and right views. Each tattoo is a pin with a leader line to its photo. Tap one for details and the full photo.
- **Inspiration**: images, links and notes, sorted by body part.

Built as a plain HTML/JS progressive web app (no build step). Data, photos and sign-in are handled by [Supabase](https://supabase.com) on the free plan. Hosted on GitHub Pages.

## Setup (one time)

1. **Supabase project**: create a free project at supabase.com.
2. **Database**: open *SQL Editor → New query*, paste all of [`supabase/schema.sql`](supabase/schema.sql), press *Run*.
3. **Your login**: *Authentication → Users → Add user → Create new user*, enter your email and a password, tick *Auto Confirm User*.
4. **Keys**: from *Project Settings → API* (or the *Connect* button), copy the Project URL and the publishable / anon public key into [`config.js`](config.js).
5. **Optional**: *Authentication → Sign In / Providers*, switch off *Allow new users to sign up*, so only your account exists.
6. **Hosting**: in this GitHub repo, *Settings → Pages*, source *Deploy from a branch*, branch `main`, folder `/ (root)`.

## Install on iPhone

Open the GitHub Pages link in Safari, tap Share, then *Add to Home Screen*. Sign in once.

## Install on Mac

Safari: *File → Add to Dock*. Chrome: the install icon in the address bar.

## Privacy

Rows and photos are protected by row-level security: only the signed-in owner can read or change them. Photos live in a private storage bucket and are shown through short-lived signed links. The key in `config.js` is the public client key and is meant to be published.

Until `config.js` is filled in, the app runs in preview mode with example data that is not saved.
