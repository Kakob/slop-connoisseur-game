/** Types for the pure exports of table.js (the browser module has no build step). */

export const TIMING: Record<string, number>;
export const YOU: "@you";
export const FRIEND: "@friend";

export type Plate = { label: string; text: string; own: boolean };
export type Guest = { name: string; initials: string; color: string };
export type PublicBallot = { judgeDisplayName: string; chosenLabel: string };
export type PublicResults = {
  humanLabel: string;
  blank?: boolean;
  humanTasteLabel?: string | null;
  table: { label: string; text: string; creatorKind: "human" | "machine"; creatorDisplayName: string }[];
  detectionBallots: PublicBallot[];
  machineTasteBallots: PublicBallot[];
};
export type Choices = { detection?: string | null; taste?: string | null };
export type Beat = { type: string; text: string; who?: string; label?: string; [key: string]: unknown };

export function tableModel(candidates: { label: string; text?: string }[], opts?: { ownLabel?: string | null; ownText?: string }): Plate[];
export function ownLabelFor(candidates: { label: string }[]): string | null;
export function initialsOf(name: string): string;
export function seatGuests(results: PublicResults): Guest[];
export function revealBeats(results: PublicResults, opts?: { viewer?: "creator" | "recipient"; choices?: Choices | null }): Beat[];
