# 🕵️ Roblox AI Detective Game — Full Architecture Guide

## Overview

A Roblox detective game where players receive **randomized AI-generated crime cases**, interrogate an **OpenAI-powered suspect**, present evidence, and make a final accusation. Thousands of unique cases, no repeats per player.

---

## System Architecture

```
[Roblox Client UI]
       ↕ RemoteEvents
[Roblox Server (Lua)]
       ↕ HttpService (HTTPS)
[Your Node.js API]
       ↕ OpenAI SDK
[OpenAI GPT-4o (or other GPT-4 variants)]
```

---

## File Structure

```
detective-api/               ← Backend (deploy to Railway/Render/VPS)
  server.js                  ← Main Express API (uses Express + OpenAI SDK)
  package.json

detective-roblox/
  ServerScriptService/
    DetectiveServer.lua      ← Server-side Roblox logic
  StarterPlayerScripts/
    DetectiveClient.lua      ← Client-side UI logic
  SetupScript.lua            ← Run once to create RemoteEvents
```

---

## Setup Instructions

### Step 1: Set Up the Backend API

1. Copy `detective-api/.env.example` to `detective-api/.env`
2. Edit `.env` and add your OpenAI key:
   ```env
   OPENAI_API_KEY=sk-your-actual-key-here
   PORT=3000
   ```
3. Run `npm install` in the `detective-api/` folder
3. Deploy to one of:
   - **Railway** (railway.app) — easiest, free tier available
   - **Render** (render.com) — free tier available
   - **Any VPS** with Node.js
4. Make sure it's on **HTTPS** (Roblox requires this)
5. Note your deployed URL (e.g., `https://my-detective-api.railway.app`)

### Step 2: Set Up Roblox Studio

1. Open Roblox Studio and create a new place
2. **Enable HTTP Requests**: Game Settings → Security → Allow HTTP Requests ✅
3. Run `SetupScript.lua` once in the command bar or as a script to create all RemoteEvents
4. Add `DetectiveServer.lua` to `ServerScriptService`
5. Add `DetectiveClient.lua` to `StarterPlayerScripts`
6. In `DetectiveServer.lua`, update line 8: `local API_URL = "https://your-api-url.com"`

### Step 3: Build the UI

Create a `ScreenGui` called `DetectiveUI` in `StarterGui` with these frames:

**MainMenu**
- `StartButton` (TextButton)

**CaseScreen**
- `CaseTitle` (TextLabel)
- `CaseSummary` (TextLabel)
- `VictimInfo` (TextLabel)
- `SuspectInfo` (TextLabel)
- `EvidenceList` (TextLabel)
- `WitnessList` (TextLabel)
- `BeginInterrogateButton` (TextButton)

**InterrogateScreen**
- `ChatLog` (ScrollingFrame)
- `MessageInput` (TextBox)
- `SendButton` (TextButton)
- `EvidencePanel` (ScrollingFrame) — evidence buttons appear here
- `AccuseButton` (TextButton) — "Accuse Suspect"
- `InnocentButton` (TextButton) — "Declare Innocent"
- `StatusLabel` (TextLabel)

**VerdictScreen**
- `VerdictTitle` (TextLabel)
- `VerdictDetails` (TextLabel)
- `PlayAgainButton` (TextButton)

---

## How Cases Work

### Case Generation
- Each case is AI-generated on demand with randomized:
  - Crime type (murder, theft, fraud, kidnapping, arson)
  - Victim, suspect, motive, location, time
  - 3 pieces of evidence (some misleading)
  - Witnesses with statements
  - Whether the suspect is actually guilty or innocent
  - Suspect's behavior style (liar, nervous, shifty, honest)

### Anti-Repetition System
- Each player has a `seenCases` Set stored server-side
- When a new case is requested, it checks against this set
- Effectively unlimited cases since each is AI-generated fresh

### Suspect Behavior (Random per case)
| Style | Description |
|-------|-------------|
| `lies_confidently` | Smooth, calm, denies everything |
| `nervous_and_slips` | Anxious, makes contradictions |
| `changes_story` | Subtly shifts story under pressure |
| `mostly_truthful_but_hides_one_thing` | Honest except one key detail |

### Evidence System
- Players can present any of the 3 evidence items during interrogation
- Each piece triggers a special AI reaction from the suspect
- Evidence can only be shown once per interrogation

### Accusation
- Player can **accuse** the suspect or **declare them innocent**
- Either can be the correct answer (suspect isn't always guilty!)
- Verdict reveals the full truth, motive, and clues they missed

---

## API Endpoints

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/case/new?playerId=xxx` | Generate a new unique case |
| POST | `/interrogate` | Send message to AI suspect |
| POST | `/accuse` | Submit final accusation |
| GET | `/stats?playerId=xxx` | Get player stats |

---

## Security Notes

- All game logic is on the **Server script** — clients cannot cheat
- The suspect's guilt/innocence is never sent to the client
- Player IDs use Roblox `UserId` (not username) for tracking
- Rate limit your API endpoints for production (use `express-rate-limit`)
- For production, swap in-memory storage for a real database (MongoDB, Supabase, etc.)

---

## Scaling for Production

For a real game with many players:

1. **Database**: Replace `playerSessions` with MongoDB or Supabase to persist data across server restarts
2. **Case Cache**: Pre-generate a bank of 100+ cases on startup to reduce API latency
3. **Rate Limiting**: Add `express-rate-limit` to prevent API abuse
4. **Caching**: Cache frequently-requested data with Redis
5. **Multi-server**: Use Roblox's `MessagingService` if you need cross-server features

---

## Example Game Flow

```
1. Player clicks "Start New Case"
2. Server calls GET /case/new → OpenAI generates unique case
3. Player reads case file (victim, suspect, evidence, witnesses)
4. Player enters interrogation room
5. Player types questions → Server calls POST /interrogate → Claude responds as suspect
6. Player shows evidence → Suspect reacts dynamically
7. Player clicks "Accuse" or "Declare Innocent"
8. Server calls POST /accuse → Returns verdict + full truth reveal
9. Player sees if they solved it correctly
10. Player clicks "Play Again" → New unique case generated
```