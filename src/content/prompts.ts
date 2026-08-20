/** Seed prompt deck (~30 prompts, SPEC §10) with mechanical-variety hypotheses. */

import type { GamePrompt } from "../domain/types.js";

const SEED_EPOCH = "2026-08-20T00:00:00.000Z";

type SeedPrompt = { id: string; text: string; tags: string[]; hypotheses: string[] };

const seeds: SeedPrompt[] = [
  // Personality revealing
  { id: "p-unreasonable-opinion", text: "What's a completely unreasonable opinion you have about something that doesn't matter?", tags: ["personality"], hypotheses: ["reveals_personality", "supports_micro_response"] },
  { id: "p-pretend-enjoy", text: "What's something people pretend to enjoy?", tags: ["personality"], hypotheses: ["reveals_personality", "rewards_specificity", "supports_micro_response"] },
  { id: "p-hill-to-die-on", text: "What's the smallest hill you would die on?", tags: ["personality"], hypotheses: ["reveals_personality", "rewards_specificity"] },
  { id: "p-irrational-fear", text: "Describe an irrational suspicion you can't shake.", tags: ["personality"], hypotheses: ["reveals_personality", "encourages_anecdote"] },

  // Micro-comedy
  { id: "p-we-need-to-talk", text: "What's the worst possible response to \"we need to talk\"?", tags: ["comedy"], hypotheses: ["rewards_comedic_timing", "supports_micro_response"] },
  { id: "p-haircut", text: "What's the worst thing to hear after a haircut?", tags: ["comedy"], hypotheses: ["rewards_comedic_timing", "supports_micro_response"] },
  { id: "p-fortune-cookie", text: "Write the most unsettling fortune cookie fortune.", tags: ["comedy"], hypotheses: ["rewards_comedic_timing", "supports_micro_response"] },
  { id: "p-elevator-button", text: "What's the worst thing a stranger could say to you in an elevator between floors?", tags: ["comedy"], hypotheses: ["rewards_comedic_timing", "supports_micro_response"] },
  { id: "p-wifi-name", text: "What wifi network name would make you distrust an entire apartment building?", tags: ["comedy"], hypotheses: ["rewards_comedic_timing", "rewards_specificity", "supports_micro_response"] },

  // AI-voice invitation
  { id: "p-minor-inconvenience", text: "Explain a minor inconvenience as though it were a profound life lesson.", tags: ["ai-voice"], hypotheses: ["invites_ai_voice", "supports_long_response"] },
  { id: "p-linkedin-toast", text: "Announce a piece of toast the way people announce promotions online.", tags: ["ai-voice"], hypotheses: ["invites_ai_voice", "rewards_comedic_timing"] },
  { id: "p-terms-conditions", text: "Write one clause that should be hidden in every friendship's terms and conditions.", tags: ["ai-voice"], hypotheses: ["invites_ai_voice", "rewards_specificity"] },

  // Specificity
  { id: "p-restaurant-suspicious", text: "What's something that immediately makes a restaurant suspicious?", tags: ["specificity"], hypotheses: ["rewards_specificity", "supports_micro_response"] },
  { id: "p-grocery-cart", text: "Name three items in a grocery cart that tell a complete story.", tags: ["specificity"], hypotheses: ["rewards_specificity", "encourages_anecdote"] },
  { id: "p-fridge-shame", text: "What's the most shameful thing a refrigerator could contain?", tags: ["specificity"], hypotheses: ["rewards_specificity", "supports_micro_response"] },
  { id: "p-hotel-detail", text: "What one detail in a hotel room would make you leave immediately?", tags: ["specificity"], hypotheses: ["rewards_specificity", "supports_micro_response"] },

  // Persuasion
  { id: "p-naps-productive", text: "Convince someone that naps are productive.", tags: ["persuasion"], hypotheses: ["supports_long_response", "invites_ai_voice"] },
  { id: "p-cereal-soup", text: "Argue that cereal is or is not a soup. Commit fully.", tags: ["persuasion"], hypotheses: ["supports_long_response", "reveals_personality"] },
  { id: "p-defend-villain", text: "Defend a widely hated minor annoyance as secretly good.", tags: ["persuasion"], hypotheses: ["supports_long_response", "reveals_personality"] },

  // Observation
  { id: "p-social-rule", text: "What's a social rule everyone follows even though it makes no sense?", tags: ["observation"], hypotheses: ["rewards_specificity", "reveals_personality"] },
  { id: "p-adult-secret", text: "What's something no one tells you about being an adult?", tags: ["observation"], hypotheses: ["encourages_anecdote", "reveals_personality"] },
  { id: "p-fake-busy", text: "How do people signal they're busy without actually being busy?", tags: ["observation"], hypotheses: ["rewards_specificity"] },
  { id: "p-waiting-room", text: "Describe the exact feeling of a waiting room, without naming it.", tags: ["observation"], hypotheses: ["rewards_specificity", "supports_long_response"] },

  // Imagination
  { id: "p-fridge-feature", text: "Add one completely unnecessary feature to a refrigerator.", tags: ["imagination"], hypotheses: ["rewards_comedic_timing", "supports_micro_response"] },
  { id: "p-new-holiday", text: "Invent a holiday that celebrates something nobody should celebrate.", tags: ["imagination"], hypotheses: ["rewards_comedic_timing", "rewards_specificity"] },
  { id: "p-museum-exhibit", text: "Propose the most boring possible museum exhibit that you would still visit.", tags: ["imagination"], hypotheses: ["reveals_personality", "rewards_specificity"] },
  { id: "p-animal-job", text: "Assign a specific office job to a specific animal and justify the hire.", tags: ["imagination"], hypotheses: ["rewards_comedic_timing", "rewards_specificity"] },

  // Anecdote bait
  { id: "p-small-victory", text: "Describe a tiny victory that felt enormous.", tags: ["anecdote"], hypotheses: ["encourages_anecdote", "reveals_personality"] },
  { id: "p-wrong-name", text: "You've called someone the wrong name for too long to fix it. What now?", tags: ["anecdote"], hypotheses: ["encourages_anecdote", "rewards_comedic_timing"] },
  { id: "p-lost-object", text: "What object did you lose years ago that you still think about?", tags: ["anecdote"], hypotheses: ["encourages_anecdote", "reveals_personality", "supports_micro_response"] },
];

/** Derives the immutable seed prompt list; every entry is curated and active. */
export function seedPrompts(): GamePrompt[] {
  return seeds.map((s) => ({
    id: s.id,
    text: s.text,
    source: "curated",
    tags: s.tags,
    hypotheses: s.hypotheses,
    active: true,
    createdAt: SEED_EPOCH,
  }));
}
