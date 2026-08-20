/**
 * Offline demo provider: deterministic, persona-flavored canned play with no
 * API. Used by `npm run play -- --mock` so the game loop is exercisable
 * without credentials. Not used by tests of engine laws (those script
 * MockModelProvider precisely).
 */

import type { Rng } from "../domain/runtime.js";
import type { ModelCallRequest, ModelCallResult, ModelProvider } from "./provider.js";

const CANNED: Record<string, string[]> = {
  "The Minimalist": ["no.", "hard pass", "it's the lighting", "correct answer: never", "fine. one word: no"],
  "The Anecdotalist": [
    "my aunt did this exact thing in 2011 and we still talk about it at dinner",
    "there was a guy at my old job who swore by this, kept a spreadsheet and everything",
    "saw this happen at a rest stop outside town once. couldn't look away",
    "my roommate tried that. we don't discuss the smell",
    "reminded me of the diner near my school that laminated everything, even the salt",
  ],
  "The Messy Thinker": [
    "ok so at first i thought no but actually... maybe? it depends. probably no",
    "i keep going back and forth on this, like it's fine but also deeply not fine",
    "honestly i started typing three different answers. going with the weird one",
    "hmm. the obvious answer is boring so. the other thing. you know the thing",
    "i want to say something smart here but all i have is a feeling and it's suspicious",
  ],
  "The Comedian": [
    "and that's why I'm banned from the aquarium",
    "step one: lie. step two: commit. step three: new city, new name",
    "the fridge gets a lawyer. that's it. that's the feature",
    "it whispers 'i saw what you ate' every time you open it",
    "my answer is the same as my dating strategy: aggressive eye contact and fleeing",
  ],
  "The Earnest One": [
    "I think most people just want to feel noticed, honestly",
    "It's small, but it matters more than people admit",
    "I'd rather be sincere and wrong than clever and hollow",
    "There's something quietly good about it that gets overlooked",
    "It costs nothing to be kind about this, so I try to be",
  ],
};

export class DemoProvider implements ModelProvider {
  private counter = 0;

  constructor(private readonly rng: Rng) {}

  async complete(request: ModelCallRequest): Promise<ModelCallResult> {
    await new Promise((resolve) => setTimeout(resolve, 150 + Math.floor(this.rng() * 350)));
    return {
      text: this.reply(request),
      provider: "demo",
      model: "demo-canned",
      latencyMs: 1,
    };
  }

  private reply(request: ModelCallRequest): string {
    if (request.system.includes('"choice"')) {
      // Judge call: pick a valid label from the "one of: A, B, C" list.
      const match = request.system.match(/one of: ([A-F](?:, [A-F])*)/);
      if (!match) throw new Error("DemoProvider: cannot find label list in judge request");
      const labels = match[1]!.split(", ");
      return JSON.stringify({ choice: labels[Math.floor(this.rng() * labels.length)] });
    }
    const persona = Object.keys(CANNED).find((name) => request.system.includes(name));
    if (!persona) throw new Error("DemoProvider: cannot find persona in writer request");
    const lines = CANNED[persona]!;
    return lines[this.counter++ % lines.length]!;
  }
}
