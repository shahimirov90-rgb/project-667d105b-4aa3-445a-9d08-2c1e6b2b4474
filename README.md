# Семейный Круг

Build a polished, responsive, Russian-language private family group communication web app called «Семейный круг». It must work well on phones and desktop. Core features: secure sign-up/sign-in; create one private family space; invite relatives via a shareable invite link/code with owner approval; family group chat with timestamps, sender names and avatars; send and display photos and videos with upload progress, previews and a media gallery; reactions and replies; searchable message history; member list and basic roles (owner/admin/member); profile name and avatar; settings to manage members and revoke invites. Use a real persistent backend with database, authentication and private file storage. Enforce authorization server-side and with database/storage row-level security so only authenticated members of the same family can read messages and media; validate file types and sizes; do not expose public media URLs. Add empty states, loading/error states, accessible controls, and clear privacy messaging. Seed a tasteful demo family only if it does not compromise real user data. Do not claim deployment or real invites are active until configured. Build the working MVP end-to-end, not just a mockup. Use a warm, welcoming visual design, easy large controls, Russian UI text throughout.

This project was built with [Lovable](https://lovable.dev).

## Build with Lovable

Continue developing this project in the [Lovable editor](https://lovable.dev/projects/667d105b-4aa3-445a-9d08-2c1e6b2b4474).

- **Ship faster**: describe what you want to build and Lovable handles the code.
- **Stay in sync**: every change made in Lovable is committed straight to this repository.
- **Full ownership**: this code is yours. Push to `main` on GitHub and your changes sync back into Lovable, ready for your next prompt.

## Development

Prefer working locally? You need Node.js and npm — [install with nvm](https://github.com/nvm-sh/nvm#installing-and-updating).

```sh
git clone <this-repository-url>
cd <repository-name>
npm i
npm run dev
```
