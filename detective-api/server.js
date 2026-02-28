const express = require("express");
const OpenAI = require("openai");
const crypto = require("crypto");

const app = express();
app.use(express.json());

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

// ─────────────────────────────────────────────
// In-memory store (replace with DB in production)
// ─────────────────────────────────────────────
const playerSessions = {}; // { playerId: { seenCases: Set, activeCase: {}, chatHistory: [] } }
const casePool = {};        // { caseId: caseObject }

// ─────────────────────────────────────────────
// CASE GENERATION
// ─────────────────────────────────────────────

async function generateCase() {
  const seed = Math.floor(Math.random() * 1000000);

  const response = await openai.chat.completions.create({
    model: "gpt-4o",
    max_tokens: 1500,
    messages: [
      {
        role: "system",
        content: "You are a crime writer who creates unique, realistic detective game cases. Always respond with valid JSON only — no markdown, no backticks, no extra text.",
      },
      {
        role: "user",
        content: `Generate a unique modern crime case (murder, theft, fraud, kidnapping, arson) for a detective interrogation game. Use seed ${seed} for variety.

Return ONLY valid JSON in this exact format:
{
  "caseId": "unique_8char_alphanumeric",
  "title": "Case title",
  "crimeType": "murder|theft|fraud|kidnapping|arson",
  "summary": "2-3 sentence summary of what happened",
  "victim": {
    "name": "Full Name",
    "age": 30,
    "occupation": "job",
    "background": "brief background"
  },
  "suspect": {
    "name": "Full Name",
    "age": 28,
    "occupation": "job",
    "relationship": "relationship to victim",
    "personality": "nervous|deceptive|aggressive|calm|emotional",
    "isGuilty": true,
    "motive": "reason for crime (only if guilty)",
    "alibi": "their claimed alibi",
    "alibiIsTrue": false,
    "secretTheyAreHiding": "something personal unrelated to crime OR details of the crime",
    "behaviorStyle": "lies_confidently|nervous_and_slips|changes_story|mostly_truthful_but_hides_one_thing"
  },
  "evidence": [
    { "id": "ev1", "name": "Evidence name", "description": "what it shows", "pointsToSuspect": true },
    { "id": "ev2", "name": "Evidence name", "description": "what it shows", "pointsToSuspect": false },
    { "id": "ev3", "name": "Evidence name", "description": "what it shows", "pointsToSuspect": true }
  ],
  "witnesses": [
    { "name": "Witness name", "statement": "what they saw or heard" }
  ],
  "correctAccusation": true,
  "solvingClues": ["clue 1 the detective should find", "clue 2", "clue 3"],
  "crimeLocation": "where the crime happened",
  "timeOfCrime": "time and date"
}`,
      },
    ],
  });

  const text = response.choices[0].message.content;
  const json = text.replace(/```json|```/g, "").trim();
  const caseData = JSON.parse(json);

  // Ensure unique ID
  caseData.caseId = crypto.randomBytes(4).toString("hex");
  casePool[caseData.caseId] = caseData;
  return caseData;
}

// ─────────────────────────────────────────────
// ROUTES
// ─────────────────────────────────────────────

/**
 * GET /case/new?playerId=xxx
 * Returns a brand new case the player hasn't seen before.
 */
app.get("/case/new", async (req, res) => {
  const { playerId } = req.query;
  if (!playerId) return res.status(400).json({ error: "playerId required" });

  if (!playerSessions[playerId]) {
    playerSessions[playerId] = { seenCases: new Set(), activeCase: null, chatHistory: [] };
  }

  const session = playerSessions[playerId];

  try {
    let caseData;
    let attempts = 0;
    do {
      caseData = await generateCase();
      attempts++;
    } while (session.seenCases.has(caseData.caseId) && attempts < 5);

    session.seenCases.add(caseData.caseId);
    session.activeCase = caseData;
    session.chatHistory = [];

    // Return only what the player should see (no spoilers)
    res.json({
      caseId: caseData.caseId,
      title: caseData.title,
      crimeType: caseData.crimeType,
      summary: caseData.summary,
      victim: caseData.victim,
      suspect: {
        name: caseData.suspect.name,
        age: caseData.suspect.age,
        occupation: caseData.suspect.occupation,
        relationship: caseData.suspect.relationship,
        personality: caseData.suspect.personality,
      },
      evidence: caseData.evidence.map(e => ({ id: e.id, name: e.name, description: e.description })),
      witnesses: caseData.witnesses,
      crimeLocation: caseData.crimeLocation,
      timeOfCrime: caseData.timeOfCrime,
      totalCasesSeen: session.seenCases.size,
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to generate case", details: err.message });
  }
});

/**
 * POST /interrogate
 * Body: { playerId, message, showEvidence?: "ev1" }
 */
app.post("/interrogate", async (req, res) => {
  const { playerId, message, showEvidence } = req.body;
  if (!playerId || !message) return res.status(400).json({ error: "playerId and message required" });

  const session = playerSessions[playerId];
  if (!session || !session.activeCase) {
    return res.status(400).json({ error: "No active case. Call /case/new first." });
  }

  const c = session.activeCase;
  const suspect = c.suspect;

  let evidenceContext = "";
  if (showEvidence) {
    const ev = c.evidence.find(e => e.id === showEvidence);
    if (ev) {
      evidenceContext = `\n\nThe detective just showed you: "${ev.name}" — ${ev.description}. React appropriately based on whether this implicates you.`;
    }
  }

  const systemPrompt = `You are ${suspect.name}, a ${suspect.age}-year-old ${suspect.occupation} being interrogated by a detective.

CASE FACTS (secret — do not reveal directly):
- Crime: ${c.crimeType} of ${c.victim.name} at ${c.crimeLocation} on ${c.timeOfCrime}
- You are ${suspect.isGuilty ? "GUILTY" : "INNOCENT"}
- Your motive: ${suspect.motive || "none — you are innocent"}
- Your alibi: ${suspect.alibi} (this alibi is ${suspect.alibiIsTrue ? "TRUE" : "FALSE"})
- Secret you are hiding: ${suspect.secretTheyAreHiding}

YOUR BEHAVIOR STYLE: ${suspect.behaviorStyle}
- "lies_confidently": You lie smoothly, deny everything, seem very calm and composed
- "nervous_and_slips": You are anxious, make small contradictions, occasionally let things slip
- "changes_story": Your story subtly changes when pressured or shown evidence
- "mostly_truthful_but_hides_one_thing": You answer honestly except about one key detail

YOUR PERSONALITY: ${suspect.personality}

RULES:
1. Stay in character at ALL times. You are not an AI, you are this person.
2. Never confess unless the detective has cornered you with multiple pieces of evidence AND you are guilty.
3. React realistically when shown evidence.
4. Keep responses short (2-5 sentences) like a real interrogation.
5. Show emotion. Sweat. Get angry. Cry. Whatever fits your personality.
6. Never break character or mention you are an AI.${evidenceContext}`;

  // Add user message to chat history
  session.chatHistory.push({ role: "user", content: message });

  try {
    const response = await openai.chat.completions.create({
      model: "gpt-4o",
      max_tokens: 300,
      messages: [
        { role: "system", content: systemPrompt },
        ...session.chatHistory,
      ],
    });

    const reply = response.choices[0].message.content;

    // Add assistant reply to history
    session.chatHistory.push({ role: "assistant", content: reply });

    res.json({
      suspectName: suspect.name,
      response: reply,
      turnCount: session.chatHistory.length / 2,
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Interrogation failed", details: err.message });
  }
});

/**
 * POST /accuse
 * Body: { playerId, accuseSuspect: true/false, reasoning: "..." }
 */
app.post("/accuse", (req, res) => {
  const { playerId, accuseSuspect, reasoning } = req.body;
  if (!playerId) return res.status(400).json({ error: "playerId required" });

  const session = playerSessions[playerId];
  if (!session || !session.activeCase) {
    return res.status(400).json({ error: "No active case." });
  }

  const c = session.activeCase;
  const isCorrect = accuseSuspect === c.correctAccusation;

  res.json({
    correct: isCorrect,
    verdict: isCorrect
      ? "🎉 Case Solved! Great detective work!"
      : "❌ Wrong call. The real answer slipped through your fingers.",
    truth: {
      wasGuilty: c.suspect.isGuilty,
      motive: c.suspect.motive || "They were innocent all along.",
      realAlibi: c.suspect.alibi,
      alibiWasTrue: c.suspect.alibiIsTrue,
      solvingClues: c.solvingClues,
    },
  });
});

/**
 * GET /stats?playerId=xxx
 */
app.get("/stats", (req, res) => {
  const { playerId } = req.query;
  const session = playerSessions[playerId];
  if (!session) return res.json({ casesSeen: 0 });
  res.json({ casesSeen: session.seenCases.size });
});

// ─────────────────────────────────────────────
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`🔍 Detective API running on port ${PORT}`));
